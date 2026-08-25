import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import type { StreamPayload } from '@/src/data/catalog/types';
import {
  isEmbessPlayerUrl,
  isFsstPlayerUrl,
  isProgressiveMediaUrl,
  isResolvableEmbedUrl,
  resolveEmbedStream,
} from '@/src/data/catalog/embedStreams';
import { deleteDownloadRow, getDownload, listDownloads, upsertDownload } from './db';
import {
  startDownloadForeground,
  stopDownloadForeground,
  updateDownloadForeground,
} from './foreground';
import { downloadHlsToDirectory, downloadTextFile, pickPrimaryMediaUrl, pickSubtitleTrack } from './hls';
import { withMediaFetchPlayer } from './mediaFetch';
import { downloadProgressiveFile, progressiveMediaHeaders } from './progressive';
import { DownloadGateError } from './errors';
import { currentWifiOnlyBlocked } from './network';
import { computeDownloadsUsage, computePathUsage, isStorageCapBlocked } from './storage';
import type {
  DownloadMediaKind,
  DownloadRecord,
  DownloadRequest,
  EnqueueOptions,
  YoutubeDownloadRequest,
} from './types';
import { resolveYoutubeStream } from './youtube';
import { t } from '@/src/shared/i18n';
import { useSettingsStore } from '@/src/features/settings/store';

export function inferMovieMediaKind(streamUrl: string, explicit?: DownloadMediaKind): DownloadMediaKind {
  if (explicit === 'progressive' || explicit === 'hls') return explicit;
  return isProgressiveMediaUrl(streamUrl) ? 'progressive' : 'hls';
}

type DownloadsState = {
  items: DownloadRecord[];
  hydrated: boolean;
  activeId: string | null;
  hydrate: () => Promise<void>;
  enqueue: (request: DownloadRequest, opts?: EnqueueOptions) => Promise<string>;
  enqueueYoutube: (
    youtubeUrl: string,
    preferredQuality?: string,
    opts?: EnqueueOptions
  ) => Promise<string>;
  retry: (id: string) => Promise<void>;
  /** Finish movie retry after StreamResolver captured fresh HLS URLs. */
  completeMovieRetry: (id: string, payload: StreamPayload) => Promise<void>;
  failMovieResolve: (id: string, message: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const PROGRESS_THROTTLE_MS = 250;

/** Abort controllers for in-flight download jobs. */
const abortControllers = new Map<string, AbortController>();
/** Serialize movie HLS downloads — one shared WebView session. */
let movieJobChain: Promise<void> = Promise.resolve();
/** Bumped on user mutations so hydrate does not clobber fresher memory. */
let mutationGeneration = 0;

function bumpMutation() {
  mutationGeneration += 1;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (error instanceof Error && /cancelled/i.test(error.message))
  );
}

function getAbortSignal(id: string): AbortSignal {
  abortControllers.get(id)?.abort();
  const controller = new AbortController();
  abortControllers.set(id, controller);
  return controller.signal;
}

function clearAbort(id: string) {
  abortControllers.delete(id);
}

function enqueueMovieJob(task: () => Promise<void>): void {
  movieJobChain = movieJobChain.then(task, task).catch((e) => {
    console.warn('[downloads] movie queue error', e);
  });
}

async function assertDownloadAllowed(force?: boolean): Promise<void> {
  if (force) return;
  const { downloadsWifiOnly, storageCapMb } = useSettingsStore.getState();
  if (await currentWifiOnlyBlocked(downloadsWifiOnly)) {
    throw new DownloadGateError('wifi', t('downloads.wifiBlocked'));
  }
  const used = await computeDownloadsUsage();
  if (isStorageCapBlocked(used, storageCapMb)) {
    throw new DownloadGateError('storage', t('downloads.storageBlocked'));
  }
}

function makeId(movieId: string, quality: string, audioLabel: string, season?: number, episode?: number) {
  const safeAudio = audioLabel.replace(/[^\wа-яА-ЯёЁ]+/gi, '_').slice(0, 40);
  const ep =
    season != null && episode != null ? `_s${season}e${episode}` : '';
  return `${movieId}${ep}_${quality}_${safeAudio}_${Date.now()}`;
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
    let items: DownloadRecord[];
    if (idx === -1) {
      items = [record, ...s.items];
    } else {
      items = s.items.map((i, iIdx) => (iIdx === idx ? record : i));
    }
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
        const captured = record;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          pending = null;
          void flush(captured, true);
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
  const signal = getAbortSignal(id);
  await startDownloadForeground(request.title);
  const reporter = createProgressReporter(request.title);
  const mediaKind = inferMovieMediaKind(request.hlsUrl, request.mediaKind);
  try {
    if (signal.aborted) return;
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
      hlsUrl: mediaKind === 'hls' ? request.hlsUrl : undefined,
      subtitleUrl: request.subtitleUrl,
      source: 'movie',
      mediaKind,
      season: request.season,
      episode: request.episode,
      skipTimeSec: request.skipTimeSec,
      removeTimeSec: request.removeTimeSec,
    };

    const prior = await getDownload(id);
    if (!prior) {
      // Deleted while queued.
      return;
    }
    current = {
      ...prior,
      ...current,
      createdAt: prior.createdAt,
      status: 'downloading',
      error: undefined,
      progress: prior.progress > 0 && prior.progress < 1 ? prior.progress : 0,
      source: 'movie',
      mediaKind,
    };

    if (signal.aborted) return;
    await persist(current);
    patchItemInStore(current, id);

    const downloadSubs = async (): Promise<string | undefined> => {
      if (!request.subtitleUrl?.trim()) return undefined;
      const subs = `${baseDir}subs.vtt`;
      await downloadTextFile(request.subtitleUrl, subs, request.playerUrl);
      return subs;
    };

    let playlistPath: string;
    let subtitlePath: string | undefined;

    if (mediaKind === 'progressive') {
      const dest = `${baseDir}video.mp4`;
      playlistPath = await downloadProgressiveFile(
        request.hlsUrl,
        dest,
        (progress) => {
          if (signal.aborted) return;
          current = {
            ...current,
            progress: Math.min(0.92, progress * 0.92),
            status: 'downloading',
            updatedAt: Date.now(),
          };
          void reporter.report(current);
        },
        progressiveMediaHeaders(request.hlsUrl, request.playerUrl)
      );
      await reporter.flushPending();
      if (signal.aborted) {
        const err = new Error('Download cancelled');
        err.name = 'AbortError';
        throw err;
      }
      subtitlePath = await downloadSubs();
    } else {
      const preferredHeight = Number(request.quality) || 720;
      const hlsOptions = request.audioPlaylistUrl
        ? { audioPlaylistUrl: request.audioPlaylistUrl, audioLabel: request.audioLabel }
        : undefined;

      const runHlsAndSubs = async () => {
        const { playlistPath: path } = await downloadHlsToDirectory(
          request.hlsUrl,
          baseDir,
          preferredHeight,
          (progress) => {
            if (signal.aborted) return;
            current = {
              ...current,
              progress: Math.min(0.92, progress * 0.92),
              status: 'downloading',
              updatedAt: Date.now(),
            };
            void reporter.report(current);
          },
          request.playerUrl,
          signal,
          hlsOptions
        );

        await reporter.flushPending();
        if (signal.aborted) {
          const err = new Error('Download cancelled');
          err.name = 'AbortError';
          throw err;
        }

        const subsPath = await downloadSubs();
        return { playlistPath: path, subtitlePath: subsPath };
      };

      // Embess / fsst: OkHttp with player Referer — skip bnsi MediaFetch WebView.
      const skipMediaFetch =
        isEmbessPlayerUrl(request.playerUrl) || isFsstPlayerUrl(request.playerUrl);
      const result = skipMediaFetch
        ? await runHlsAndSubs()
        : await withMediaFetchPlayer(request.playerUrl, runHlsAndSubs);
      playlistPath = result.playlistPath;
      subtitlePath = result.subtitlePath;
    }

    if (signal.aborted) return;
    const stillExists = await getDownload(id);
    if (!stillExists) return;

    let sizeBytes: number | undefined;
    try {
      sizeBytes = await computePathUsage(baseDir);
    } catch {
      sizeBytes = undefined;
    }
    current = {
      ...current,
      status: 'completed',
      progress: 1,
      playlistPath,
      subtitlePath,
      updatedAt: Date.now(),
      error: undefined,
      hlsUrl: mediaKind === 'hls' ? request.hlsUrl : current.hlsUrl,
      subtitleUrl: request.subtitleUrl,
      source: 'movie',
      mediaKind,
      skipTimeSec: request.skipTimeSec ?? current.skipTimeSec,
      removeTimeSec: request.removeTimeSec ?? current.removeTimeSec,
      sizeBytes,
    };
    await persist(current);
    patchItemInStore(current, null);
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return;
    }
    const stillExists = await getDownload(id);
    if (!stillExists) return;
    const message = error instanceof Error ? error.message : t('store.downloadError');
    await failDownload(id, message);
  } finally {
    clearAbort(id);
    await stopForegroundIfIdle();
  }
}

async function runYoutubeDownloadJob(
  id: string,
  request: YoutubeDownloadRequest,
  existingDir?: string
) {
  const signal = getAbortSignal(id);
  await startDownloadForeground(request.title);
  const reporter = createProgressReporter(request.title);
  try {
    if (signal.aborted) return;
    const baseDir = existingDir ?? downloadDirForId(id);
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });

    let current: DownloadRecord = {
      id,
      movieId: `yt_${request.videoId}`,
      title: request.title,
      posterUrl: request.posterUrl,
      audioLabel: t('downloads.youtubeAudio'),
      quality: request.quality,
      subtitleLabel: t('downloads.noSubtitlesDash'),
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
    if (!prior) return;
    current = {
      ...prior,
      ...current,
      createdAt: prior.createdAt,
      status: 'downloading',
      error: undefined,
      progress: prior.progress > 0 && prior.progress < 1 ? prior.progress : 0,
    };

    if (signal.aborted) return;
    await persist(current);
    patchItemInStore(current, id);

    let playlistPath: string;

    if (request.mediaKind === 'progressive') {
      const dest = `${baseDir}video.mp4`;
      playlistPath = await downloadProgressiveFile(request.streamUrl, dest, (progress) => {
        if (signal.aborted) return;
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
          if (signal.aborted) return;
          current = {
            ...current,
            progress,
            status: 'downloading',
            updatedAt: Date.now(),
          };
          void reporter.report(current);
        },
        undefined,
        signal
      );
      playlistPath = result.playlistPath;
    }

    if (signal.aborted) return;
    const stillExists = await getDownload(id);
    if (!stillExists) return;

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
    if (isAbortError(error) || signal.aborted) return;
    const stillExists = await getDownload(id);
    if (!stillExists) return;
    const message = error instanceof Error ? error.message : t('store.downloadError');
    await failDownload(id, message);
  } finally {
    clearAbort(id);
    await stopForegroundIfIdle();
  }
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: [],
  hydrated: false,
  activeId: null,

  hydrate: async () => {
    const gen = mutationGeneration;
    const items = await listDownloads();
    // Mark interrupted / dead paused rows failed before first UI publish.
    const next: DownloadRecord[] = [];
    for (const p of items) {
      const active =
        p.status === 'queued' ||
        p.status === 'downloading' ||
        p.status === 'resolving' ||
        (p.status as string) === 'paused';
      if (active) {
        const updated: DownloadRecord = {
          ...p,
          status: 'failed',
          error: t('store.interrupted'),
          updatedAt: Date.now(),
        };
        await persist(updated);
        next.push(updated);
      } else {
        next.push(p);
      }
    }
    if (gen !== mutationGeneration) {
      set({ items: await listDownloads(), hydrated: true });
    } else {
      set({ items: next, hydrated: true });
    }
    await stopDownloadForeground();
  },

  refresh: async () => {
    set({ items: await listDownloads() });
  },

  enqueue: async (request, opts) => {
    await assertDownloadAllowed(opts?.force);
    bumpMutation();
    const id = makeId(
      request.movieId,
      request.quality,
      request.audioLabel,
      request.season,
      request.episode
    );
    const now = Date.now();
    const mediaKind = inferMovieMediaKind(request.hlsUrl, request.mediaKind);
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
      hlsUrl: mediaKind === 'hls' ? request.hlsUrl : undefined,
      subtitleUrl: request.subtitleUrl,
      source: 'movie',
      mediaKind,
      season: request.season,
      episode: request.episode,
      skipTimeSec: request.skipTimeSec,
      removeTimeSec: request.removeTimeSec,
    };
    await persist(record);
    patchItemInStore(record, id);

    enqueueMovieJob(() => runDownloadJob(id, { ...request, mediaKind }));
    return id;
  },

  enqueueYoutube: async (youtubeUrl, preferredQuality, opts) => {
    await assertDownloadAllowed(opts?.force);
    bumpMutation();
    const resolved = await resolveYoutubeStream(youtubeUrl, preferredQuality);
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
      audioLabel: t('downloads.youtubeAudio'),
      quality: resolved.quality,
      subtitleLabel: t('downloads.noSubtitlesDash'),
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
    bumpMutation();
    const item = await getDownload(id);
    if (!item) {
      throw new Error(t('store.notFound'));
    }

    if (item.source === 'youtube') {
      if (!item.youtubeUrl) {
        throw new Error(t('store.noYoutubeUrl'));
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

    if (!item.playerUrl) {
      throw new Error(t('store.noRetryParams'));
    }

    // Non-native embeds: rematch via HTTP resolve (bnsi StreamResolver never fires).
    if (isResolvableEmbedUrl(item.playerUrl)) {
      const payload = await resolveEmbedStream(item.playerUrl, {
        season: item.season,
        episode: item.episode,
      });
      if (!payload?.hlsSource?.length) {
        throw new Error(t('store.retryNoStreams'));
      }
      await useDownloadsStore.getState().completeMovieRetry(id, payload);
      return;
    }

    // Bust player HTTP cache so bnsi returns fresh signed HLS URLs.
    const bust = `_nd=${Date.now()}`;
    const playerUrl = item.playerUrl.includes('?')
      ? `${item.playerUrl}&${bust}`
      : `${item.playerUrl}?${bust}`;
    // CDN signed HLS URLs expire — re-resolve via StreamResolver before download.
    const updated: DownloadRecord = {
      ...item,
      playerUrl,
      status: 'resolving',
      error: undefined,
      progress: 0,
      updatedAt: Date.now(),
      source: 'movie',
      mediaKind: item.mediaKind === 'progressive' ? 'progressive' : 'hls',
    };
    await persist(updated);
    patchItemInStore(updated, id);
  },

  completeMovieRetry: async (id, payload) => {
    bumpMutation();
    const item = await getDownload(id);
    if (!item || !item.playerUrl) {
      throw new Error(t('store.notFound'));
    }

    const sources = payload.hlsSource ?? [];
    if (!sources.length) {
      throw new Error(t('store.retryNoStreams'));
    }

    const norm = (s: string) => s.trim().toLowerCase();
    const audio =
      sources.find((s) => norm(s.label) === norm(item.audioLabel)) ?? sources[0];
    const hlsUrl =
      audio.quality[item.quality] ??
      audio.quality[Object.keys(audio.quality)[0]];
    if (!hlsUrl) {
      throw new Error(t('store.retryNoStreams'));
    }

    const tracks = payload.tracks ?? [];
    const subtitle =
      tracks.find((tr) => norm(tr.label) === norm(item.subtitleLabel)) ??
      pickSubtitleTrack(tracks) ??
      tracks[0];
    if (!subtitle) {
      throw new Error(t('store.retryNoStreams'));
    }

    const quality =
      item.quality in audio.quality ? item.quality : Object.keys(audio.quality)[0];
    const mediaKind = inferMovieMediaKind(
      hlsUrl,
      payload.progressive ? 'progressive' : undefined
    );
    const request: DownloadRequest = {
      movieId: item.movieId,
      title: item.title,
      posterUrl: item.posterUrl,
      playerUrl: item.playerUrl,
      audioLabel: audio.label,
      quality,
      subtitleLabel: subtitle.label,
      hlsUrl: pickPrimaryMediaUrl(hlsUrl),
      subtitleUrl: subtitle.src ? subtitle.src : '',
      audioPlaylistUrl: audio.audioId ? audio.audioId : undefined,
      mediaKind,
      season: audio.season ?? item.season,
      episode: audio.episode ?? item.episode,
    };

    const baseDir = item.videoDir ?? downloadDirForId(id);
    // Fresh signed URLs — drop partial segments from the previous attempt.
    try {
      await FileSystem.deleteAsync(baseDir, { idempotent: true });
    } catch {
      // ignore
    }

    const updated: DownloadRecord = {
      ...item,
      audioLabel: request.audioLabel,
      quality: request.quality,
      subtitleLabel: request.subtitleLabel,
      hlsUrl: mediaKind === 'hls' ? request.hlsUrl : undefined,
      subtitleUrl: request.subtitleUrl,
      status: 'queued',
      progress: 0,
      error: undefined,
      playlistPath: undefined,
      subtitlePath: undefined,
      videoDir: baseDir,
      updatedAt: Date.now(),
      source: 'movie',
      mediaKind,
      season: request.season,
      episode: request.episode,
      skipTimeSec: request.skipTimeSec ?? item.skipTimeSec,
      removeTimeSec: request.removeTimeSec ?? item.removeTimeSec,
    };
    await persist(updated);
    patchItemInStore(updated, id);
    enqueueMovieJob(() => runDownloadJob(id, request, baseDir));
  },

  failMovieResolve: async (id, message) => {
    bumpMutation();
    const item = await getDownload(id);
    if (!item) return;
    const updated: DownloadRecord = {
      ...item,
      status: 'failed',
      error: message,
      updatedAt: Date.now(),
    };
    await persist(updated);
    patchItemInStore(updated, null);
  },

  remove: async (id) => {
    bumpMutation();
    abortControllers.get(id)?.abort();
    clearAbort(id);
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
