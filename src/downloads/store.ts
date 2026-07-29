import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import { deleteDownloadRow, getDownload, listDownloads, upsertDownload } from './db';
import {
  startDownloadForeground,
  stopDownloadForeground,
  updateDownloadForeground,
} from './foreground';
import { downloadHlsToDirectory, downloadTextFile } from './hls';
import { downloadProgressiveFile } from './progressive';
import type { DownloadRecord, DownloadRequest, YoutubeDownloadRequest } from './types';
import { resolveYoutubeStream } from './youtube';

type DownloadsState = {
  items: DownloadRecord[];
  hydrated: boolean;
  activeId: string | null;
  hydrate: () => Promise<void>;
  enqueue: (request: DownloadRequest) => Promise<string>;
  enqueueYoutube: (youtubeUrl: string) => Promise<string>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const PROGRESS_THROTTLE_MS = 250;

function makeId(movieId: string, quality: string, audioLabel: string) {
  const safeAudio = audioLabel.replace(/[^\wа-яА-ЯёЁ]+/gi, '_').slice(0, 40);
  return `${movieId}_${quality}_${safeAudio}_${Date.now()}`;
}

function makeYoutubeId(videoId: string) {
  return `yt_${videoId}_${Date.now()}`;
}

function downloadDirForId(id: string): string {
  return `${FileSystem.documentDirectory}downloads/${id}/`;
}

async function persist(record: DownloadRecord) {
  await upsertDownload(record);
}

function patchItemInStore(record: DownloadRecord, activeId?: string | null) {
  useDownloadsStore.setState((s) => {
    const idx = s.items.findIndex((i) => i.id === record.id);
    const items =
      idx === -1
        ? [record, ...s.items]
        : s.items.map((i, iIdx) => (iIdx === idx ? record : i));
    return {
      items,
      ...(activeId !== undefined ? { activeId } : null),
    };
  });
}

function createProgressReporter(title: string) {
  let lastUiAt = 0;
  let pending: DownloadRecord | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (record: DownloadRecord, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastUiAt < PROGRESS_THROTTLE_MS) {
      pending = record;
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          if (pending) {
            const r = pending;
            pending = null;
            void flush(r, true);
          }
        }, PROGRESS_THROTTLE_MS - (now - lastUiAt));
      }
      return;
    }

    lastUiAt = now;
    pending = null;
    await persist(record);
    patchItemInStore(record);
    await updateDownloadForeground(title, record.progress);
  };

  return {
    report: (record: DownloadRecord, force = false) => flush(record, force),
    flushPending: async () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pending) {
        const r = pending;
        pending = null;
        await flush(r, true);
      }
    },
  };
}

async function deleteDownloadFiles(id: string, videoDir?: string) {
  const dirs = new Set<string>();
  if (videoDir) dirs.add(videoDir.endsWith('/') ? videoDir : `${videoDir}/`);
  dirs.add(downloadDirForId(id));
  for (const dir of dirs) {
    try {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch (e) {
      console.warn('[downloads] failed to delete', dir, e);
    }
  }
}

async function stopForegroundIfIdle() {
  const stillActive = useDownloadsStore
    .getState()
    .items.some((i) => i.status === 'downloading' || i.status === 'queued');
  if (!stillActive) {
    await stopDownloadForeground();
  }
}

async function failDownload(id: string, message: string) {
  const failed = await getDownload(id);
  if (!failed) return;
  const updated: DownloadRecord = {
    ...failed,
    status: 'failed',
    error: message,
    updatedAt: Date.now(),
  };
  await persist(updated);
  patchItemInStore(updated, null);
}

async function runDownloadJob(id: string, request: DownloadRequest, existingDir?: string) {
  await startDownloadForeground(request.title);
  const reporter = createProgressReporter(request.title);
  try {
    const baseDir = existingDir ?? downloadDirForId(id);
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });

    let current: DownloadRecord = {
      id,
      movieId: request.movieId,
      title: request.title,
      posterUrl: request.posterUrl,
      audioLabel: request.audioLabel,
      quality: request.quality,
      subtitleLabel: request.subtitleLabel,
      status: 'downloading',
      progress: 0,
      videoDir: baseDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      playerUrl: request.playerUrl,
      hlsUrl: request.hlsUrl,
      subtitleUrl: request.subtitleUrl,
      source: 'movie',
      mediaKind: 'hls',
    };

    const prior = await getDownload(id);
    if (prior) {
      current = {
        ...prior,
        ...current,
        createdAt: prior.createdAt,
        status: 'downloading',
        error: undefined,
        progress: prior.progress > 0 && prior.progress < 1 ? prior.progress : 0,
        source: 'movie',
        mediaKind: 'hls',
      };
    }

    await persist(current);
    patchItemInStore(current, id);

    const preferredHeight = Number(request.quality) || 720;
    const { playlistPath } = await downloadHlsToDirectory(
      request.hlsUrl,
      baseDir,
      preferredHeight,
      (progress) => {
        current = {
          ...current,
          progress: Math.min(0.92, progress * 0.92),
          status: 'downloading',
          updatedAt: Date.now(),
        };
        void reporter.report(current);
      },
      request.playerUrl
    );

    await reporter.flushPending();

    const subtitlePath = `${baseDir}subs.vtt`;
    await downloadTextFile(request.subtitleUrl, subtitlePath, request.playerUrl);

    current = {
      ...current,
      status: 'completed',
      progress: 1,
      playlistPath,
      subtitlePath,
      updatedAt: Date.now(),
      error: undefined,
      hlsUrl: request.hlsUrl,
      subtitleUrl: request.subtitleUrl,
      source: 'movie',
      mediaKind: 'hls',
    };
    await persist(current);
    patchItemInStore(current, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка загрузки';
    await failDownload(id, message);
  } finally {
    await stopForegroundIfIdle();
  }
}

async function runYoutubeDownloadJob(
  id: string,
  request: YoutubeDownloadRequest,
  existingDir?: string
) {
  await startDownloadForeground(request.title);
  const reporter = createProgressReporter(request.title);
  try {
    const baseDir = existingDir ?? downloadDirForId(id);
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });

    let current: DownloadRecord = {
      id,
      movieId: `yt_${request.videoId}`,
      title: request.title,
      posterUrl: request.posterUrl,
      audioLabel: 'YouTube',
      quality: request.quality,
      subtitleLabel: '—',
      status: 'downloading',
      progress: 0,
      videoDir: baseDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hlsUrl: request.mediaKind === 'hls' ? request.streamUrl : undefined,
      source: 'youtube',
      mediaKind: request.mediaKind,
      youtubeUrl: request.youtubeUrl,
    };

    const prior = await getDownload(id);
    if (prior) {
      current = {
        ...prior,
        ...current,
        createdAt: prior.createdAt,
        status: 'downloading',
        error: undefined,
        progress: prior.progress > 0 && prior.progress < 1 ? prior.progress : 0,
      };
    }

    await persist(current);
    patchItemInStore(current, id);

    let playlistPath: string;

    if (request.mediaKind === 'progressive') {
      const dest = `${baseDir}video.mp4`;
      playlistPath = await downloadProgressiveFile(request.streamUrl, dest, (progress) => {
        current = {
          ...current,
          progress,
          status: 'downloading',
          updatedAt: Date.now(),
        };
        void reporter.report(current);
      });
    } else {
      const preferredHeight = Number(request.quality) || 720;
      const result = await downloadHlsToDirectory(
        request.streamUrl,
        baseDir,
        preferredHeight,
        (progress) => {
          current = {
            ...current,
            progress,
            status: 'downloading',
            updatedAt: Date.now(),
          };
          void reporter.report(current);
        }
      );
      playlistPath = result.playlistPath;
    }

    await reporter.flushPending();

    current = {
      ...current,
      status: 'completed',
      progress: 1,
      playlistPath,
      updatedAt: Date.now(),
      error: undefined,
      hlsUrl: request.mediaKind === 'hls' ? request.streamUrl : current.hlsUrl,
      source: 'youtube',
      mediaKind: request.mediaKind,
      youtubeUrl: request.youtubeUrl,
    };
    await persist(current);
    patchItemInStore(current, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка загрузки';
    await failDownload(id, message);
  } finally {
    await stopForegroundIfIdle();
  }
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: [],
  hydrated: false,
  activeId: null,

  hydrate: async () => {
    const items = await listDownloads();
    set({ items, hydrated: true });
    const pending = items.filter(
      (i) => i.status === 'queued' || i.status === 'downloading' || i.status === 'resolving'
    );
    for (const p of pending) {
      const updated: DownloadRecord = {
        ...p,
        status: 'failed',
        error: 'Загрузка прервалась. Запустите снова.',
        updatedAt: Date.now(),
      };
      await persist(updated);
    }
    if (pending.length) {
      set({ items: await listDownloads() });
    }
    await stopDownloadForeground();
  },

  refresh: async () => {
    set({ items: await listDownloads() });
  },

  enqueue: async (request) => {
    const id = makeId(request.movieId, request.quality, request.audioLabel);
    const now = Date.now();
    const record: DownloadRecord = {
      id,
      movieId: request.movieId,
      title: request.title,
      posterUrl: request.posterUrl,
      audioLabel: request.audioLabel,
      quality: request.quality,
      subtitleLabel: request.subtitleLabel,
      status: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      playerUrl: request.playerUrl,
      hlsUrl: request.hlsUrl,
      subtitleUrl: request.subtitleUrl,
      source: 'movie',
      mediaKind: 'hls',
    };
    await persist(record);
    patchItemInStore(record, id);

    void runDownloadJob(id, request);
    return id;
  },

  enqueueYoutube: async (youtubeUrl) => {
    const resolved = await resolveYoutubeStream(youtubeUrl);
    const id = makeYoutubeId(resolved.videoId);
    const now = Date.now();
    const request: YoutubeDownloadRequest = {
      youtubeUrl: resolved.youtubeUrl,
      videoId: resolved.videoId,
      title: resolved.title,
      posterUrl: resolved.posterUrl,
      quality: resolved.quality,
      mediaKind: resolved.mediaKind,
      streamUrl: resolved.streamUrl,
    };
    const record: DownloadRecord = {
      id,
      movieId: `yt_${resolved.videoId}`,
      title: resolved.title,
      posterUrl: resolved.posterUrl,
      audioLabel: 'YouTube',
      quality: resolved.quality,
      subtitleLabel: '—',
      status: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      hlsUrl: resolved.mediaKind === 'hls' ? resolved.streamUrl : undefined,
      source: 'youtube',
      mediaKind: resolved.mediaKind,
      youtubeUrl: resolved.youtubeUrl,
    };
    await persist(record);
    patchItemInStore(record, id);
    void runYoutubeDownloadJob(id, request);
    return id;
  },

  retry: async (id) => {
    const item = await getDownload(id);
    if (!item) {
      throw new Error('Загрузка не найдена');
    }

    if (item.source === 'youtube') {
      if (!item.youtubeUrl) {
        throw new Error('Нет сохранённой ссылки YouTube для повторной загрузки');
      }
      const resolved = await resolveYoutubeStream(item.youtubeUrl);
      const request: YoutubeDownloadRequest = {
        youtubeUrl: resolved.youtubeUrl,
        videoId: resolved.videoId,
        title: resolved.title || item.title,
        posterUrl: resolved.posterUrl ?? item.posterUrl,
        quality: resolved.quality,
        mediaKind: resolved.mediaKind,
        streamUrl: resolved.streamUrl,
      };
      const updated: DownloadRecord = {
        ...item,
        title: request.title,
        posterUrl: request.posterUrl,
        quality: request.quality,
        status: 'queued',
        error: undefined,
        updatedAt: Date.now(),
        hlsUrl: request.mediaKind === 'hls' ? request.streamUrl : undefined,
        source: 'youtube',
        mediaKind: request.mediaKind,
        youtubeUrl: request.youtubeUrl,
      };
      await persist(updated);
      patchItemInStore(updated, id);
      void runYoutubeDownloadJob(id, request, item.videoDir ?? downloadDirForId(id));
      return;
    }

    if (!item.hlsUrl || !item.subtitleUrl || !item.playerUrl) {
      throw new Error('Нет сохранённых параметров для повторной загрузки');
    }
    const request: DownloadRequest = {
      movieId: item.movieId,
      title: item.title,
      posterUrl: item.posterUrl,
      playerUrl: item.playerUrl,
      audioLabel: item.audioLabel,
      quality: item.quality,
      subtitleLabel: item.subtitleLabel,
      hlsUrl: item.hlsUrl,
      subtitleUrl: item.subtitleUrl,
    };
    const updated: DownloadRecord = {
      ...item,
      status: 'queued',
      error: undefined,
      updatedAt: Date.now(),
      source: 'movie',
      mediaKind: 'hls',
    };
    await persist(updated);
    patchItemInStore(updated, id);
    void runDownloadJob(id, request, item.videoDir ?? downloadDirForId(id));
  },

  remove: async (id) => {
    const item = await getDownload(id);
    await deleteDownloadFiles(id, item?.videoDir);
    await deleteDownloadRow(id);
    const items = await listDownloads();
    set({ items, activeId: get().activeId === id ? null : get().activeId });
    const stillActive = items.some((i) => i.status === 'downloading' || i.status === 'queued');
    if (!stillActive) {
      await stopDownloadForeground();
    }
  },
}));
