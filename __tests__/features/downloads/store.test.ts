jest.mock('@/src/features/downloads/db', () => ({
  listDownloads: jest.fn(async () => []),
  upsertDownload: jest.fn(async () => undefined),
  deleteDownloadRow: jest.fn(async () => undefined),
  getDownload: jest.fn(async () => null),
}));

jest.mock('@/src/features/downloads/foreground', () => ({
  startDownloadForeground: jest.fn(async () => undefined),
  stopDownloadForeground: jest.fn(async () => undefined),
  updateDownloadForeground: jest.fn(async () => undefined),
}));

jest.mock('@/src/features/downloads/hls', () => ({
  downloadHlsToDirectory: jest.fn(async () => ({
    dir: 'file:///mock-docs/downloads/id/',
    playlistPath: 'file:///mock-docs/downloads/id/index.m3u8',
  })),
  downloadTextFile: jest.fn(async (_u: string, dest: string) => dest),
  pickPrimaryMediaUrl: jest.fn((u: string) => u),
  pickSubtitleTrack: jest.fn(() => ({ label: 'RU', src: 'https://subs' })),
}));

jest.mock('@/src/features/downloads/mediaFetch', () => ({
  withMediaFetchPlayer: jest.fn(async (_url: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/src/features/downloads/progressive', () => ({
  downloadProgressiveFile: jest.fn(async () => 'file:///mock-docs/downloads/yt/video.mp4'),
  progressiveMediaHeaders: jest.fn(() => ({ Referer: 'https://www.incvideo1.online/' })),
}));

jest.mock('@/src/features/downloads/youtube', () => ({
  resolveYoutubeStream: jest.fn(),
  extractYoutubeVideoId: jest.fn(() => 'dQw4w9WgXcQ'),
}));

jest.mock('@/src/data/catalog/embedStreams', () => ({
  isEmbessPlayerUrl: (url: string) => /embess\.ws|namy\.ws|domem\.ws/i.test(url),
  isFsstPlayerUrl: (url: string) => /fsst\.online|incvideo/i.test(url),
  isProgressiveMediaUrl: (url: string) => /\.mp4/i.test(url),
  isResolvableEmbedUrl: (url: string) => /embess\.ws|namy\.ws|domem\.ws|fsst\.online|incvideo/i.test(url),
  resolveEmbedStream: jest.fn(async () => null),
}));

jest.mock('@/src/features/downloads/storage', () => {
  const actual = jest.requireActual('@/src/features/downloads/storage') as typeof import('@/src/features/downloads/storage');
  return {
    ...actual,
    computePathUsage: jest.fn(actual.computePathUsage),
  };
});

import {
  deleteDownloadRow,
  getDownload,
  listDownloads,
  upsertDownload,
} from '@/src/features/downloads/db';
import {
  startDownloadForeground,
  stopDownloadForeground,
  updateDownloadForeground,
} from '@/src/features/downloads/foreground';
import {
  downloadHlsToDirectory,
  downloadTextFile,
  pickSubtitleTrack,
} from '@/src/features/downloads/hls';
import { downloadProgressiveFile } from '@/src/features/downloads/progressive';
import { withMediaFetchPlayer } from '@/src/features/downloads/mediaFetch';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { computePathUsage } from '@/src/features/downloads/storage';
import type { DownloadRecord } from '@/src/features/downloads/types';
import { resolveYoutubeStream } from '@/src/features/downloads/youtube';
import { resolveEmbedStream } from '@/src/data/catalog/embedStreams';
import { t } from '@/src/shared/i18n';
import * as FileSystem from 'expo-file-system/legacy';

function baseRecord(
  partial: Partial<DownloadRecord> & Pick<DownloadRecord, 'id' | 'status'>
): DownloadRecord {
  return {
    movieId: '1',
    title: 'Film',
    progress: 0.5,
    createdAt: 1,
    updatedAt: 1,
    source: 'movie',
    mediaKind: 'hls',
    quality: '720',
    audioLabel: 'a',
    subtitleLabel: '',
    playerUrl: 'https://player',
    hlsUrl: 'https://hls',
    subtitleUrl: 'https://subs',
    ...partial,
  };
}

function flushJobs() {
  return new Promise((r) => setTimeout(r, 0));
}

describe('downloads store hydrate / remove', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDownloadsStore.setState({ items: [], hydrated: false, activeId: null });
  });

  it('marks in-flight downloads as failed interrupted on hydrate', async () => {
    (listDownloads as jest.Mock).mockResolvedValue([
      baseRecord({ id: 'a', status: 'downloading' }),
      baseRecord({ id: 'b', status: 'queued' }),
      baseRecord({ id: 'c', status: 'resolving' }),
      baseRecord({ id: 'd', status: 'completed', progress: 1, playlistPath: 'p' }),
      baseRecord({ id: 'e', status: 'paused' as DownloadRecord['status'] }),
    ]);

    await useDownloadsStore.getState().hydrate();

    const items = useDownloadsStore.getState().items;
    expect(useDownloadsStore.getState().hydrated).toBe(true);
    expect(items.find((i) => i.id === 'a')?.status).toBe('failed');
    expect(items.find((i) => i.id === 'b')?.status).toBe('failed');
    expect(items.find((i) => i.id === 'c')?.status).toBe('failed');
    expect(items.find((i) => i.id === 'e')?.status).toBe('failed');
    expect(items.find((i) => i.id === 'a')?.error).toBe(t('store.interrupted'));
    expect(items.find((i) => i.id === 'd')?.status).toBe('completed');
    expect(upsertDownload).toHaveBeenCalled();
    expect(stopDownloadForeground).toHaveBeenCalled();
  });

  it('hydrate respects mutation generation', async () => {
    let resolveList: (v: DownloadRecord[]) => void = () => undefined;
    (listDownloads as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<DownloadRecord[]>((resolve) => {
          resolveList = resolve;
        })
    );
    const hydratePromise = useDownloadsStore.getState().hydrate();
    useDownloadsStore.getState().remove; // touch
    // bump mutation via remove path mock
    (getDownload as jest.Mock).mockResolvedValue(null);
    (listDownloads as jest.Mock).mockResolvedValue([
      baseRecord({ id: 'fresh', status: 'completed', progress: 1, playlistPath: 'p' }),
    ]);
    await useDownloadsStore.getState().remove('x');
    resolveList([baseRecord({ id: 'stale', status: 'queued' })]);
    await hydratePromise;
    expect(useDownloadsStore.getState().items.some((i) => i.id === 'fresh')).toBe(true);
  });

  it('remove deletes db row', async () => {
    useDownloadsStore.setState({
      items: [baseRecord({ id: 'x', status: 'failed' })],
      hydrated: true,
      activeId: null,
    });
    (getDownload as jest.Mock).mockResolvedValue(baseRecord({ id: 'x', status: 'failed' }));
    (listDownloads as jest.Mock).mockResolvedValue([]);
    await useDownloadsStore.getState().remove('x');
    expect(deleteDownloadRow).toHaveBeenCalledWith('x');
  });

  it('refresh reloads items', async () => {
    (listDownloads as jest.Mock).mockResolvedValue([
      baseRecord({ id: 'r', status: 'completed', progress: 1, playlistPath: 'p' }),
    ]);
    await useDownloadsStore.getState().refresh();
    expect(useDownloadsStore.getState().items).toHaveLength(1);
  });
});

describe('downloads store enqueue / retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDownloadsStore.setState({ items: [], hydrated: true, activeId: null });
    (startDownloadForeground as jest.Mock).mockResolvedValue(undefined);
    (stopDownloadForeground as jest.Mock).mockResolvedValue(undefined);
    (downloadHlsToDirectory as jest.Mock).mockResolvedValue({
      dir: 'file:///mock-docs/downloads/id/',
      playlistPath: 'file:///mock-docs/downloads/id/index.m3u8',
    });
    (downloadTextFile as jest.Mock).mockImplementation(async (_u: string, dest: string) => dest);
    (downloadProgressiveFile as jest.Mock).mockResolvedValue(
      'file:///mock-docs/downloads/yt/video.mp4'
    );
  });

  it('enqueue runs movie HLS job to completion', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      const item = useDownloadsStore.getState().items.find((i) => i.id === id);
      return item ?? baseRecord({ id, status: 'queued' });
    });

    const id = await useDownloadsStore.getState().enqueue({
      movieId: '10',
      title: 'Film',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'Subs',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
      season: 1,
      episode: 2,
    });

    expect(id).toContain('10_s1e2');
    expect(upsertDownload).toHaveBeenCalled();
    await flushJobs();
    await flushJobs();
    await new Promise((r) => setTimeout(r, 20));

    expect(startDownloadForeground).toHaveBeenCalled();
    expect(downloadHlsToDirectory).toHaveBeenCalled();
    expect(downloadTextFile).toHaveBeenCalled();
    const completed = useDownloadsStore.getState().items.find((i) => i.id === id);
    expect(completed?.status).toBe('completed');
    expect(completed?.progress).toBe(1);
  });

  it('completes when path usage throws', async () => {
    (computePathUsage as jest.Mock).mockRejectedValueOnce(new Error('stat fail'));
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      const item = useDownloadsStore.getState().items.find((i) => i.id === id);
      return item ?? baseRecord({ id, status: 'queued' });
    });

    const id = await useDownloadsStore.getState().enqueue({
      movieId: 'size-throw',
      title: 'Film',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'Subs',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await flushJobs();
    await flushJobs();
    await new Promise((r) => setTimeout(r, 20));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('completed');
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.sizeBytes).toBeUndefined();
  });

  it('enqueue fails job on download error', async () => {
    (downloadHlsToDirectory as jest.Mock).mockRejectedValueOnce(new Error('cdn 403'));
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      return (
        useDownloadsStore.getState().items.find((i) => i.id === id) ??
        baseRecord({ id, status: 'queued' })
      );
    });

    const id = await useDownloadsStore.getState().enqueue({
      movieId: '11',
      title: 'Fail',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('failed');
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.error).toBe('cdn 403');
  });

  it('enqueueYoutube progressive completes', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      posterUrl: 'https://t',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      return (
        useDownloadsStore.getState().items.find((i) => i.id === id) ??
        baseRecord({ id, status: 'queued', source: 'youtube' })
      );
    });

    const id = await useDownloadsStore.getState().enqueueYoutube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '720'
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(downloadProgressiveFile).toHaveBeenCalled();
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('completed');
  });

  it('enqueueYoutube hls completes', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/master.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      return (
        useDownloadsStore.getState().items.find((i) => i.id === id) ??
        baseRecord({ id, status: 'queued', source: 'youtube', mediaKind: 'hls' })
      );
    });

    const id = await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 30));
    expect(downloadHlsToDirectory).toHaveBeenCalled();
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.mediaKind).toBe('hls');
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('completed');
  });

  it('retry youtube re-resolves and re-runs', async () => {
    const item = baseRecord({
      id: 'yt1',
      status: 'failed',
      source: 'youtube',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoDir: 'file:///mock-docs/downloads/yt1/',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '480',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: item.youtubeUrl,
    });
    useDownloadsStore.setState({ items: [item], hydrated: true });

    await useDownloadsStore.getState().retry('yt1');
    await new Promise((r) => setTimeout(r, 30));
    expect(resolveYoutubeStream).toHaveBeenCalledWith(item.youtubeUrl);
    expect(downloadProgressiveFile).toHaveBeenCalled();
  });

  it('retry movie sets resolving with cache-busted playerUrl', async () => {
    const item = baseRecord({
      id: 'm1',
      status: 'failed',
      playerUrl: 'https://player?foo=1',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    await useDownloadsStore.getState().retry('m1');
    const updated = useDownloadsStore.getState().items.find((i) => i.id === 'm1');
    expect(updated?.status).toBe('resolving');
    expect(updated?.playerUrl).toContain('_nd=');
  });

  it('retry embess/fsst rematches via resolveEmbedStream', async () => {
    const item = baseRecord({
      id: 'm-fsst',
      status: 'failed',
      playerUrl: 'https://fsst.online/embed/1',
      audioLabel: 'Default',
      subtitleLabel: '—',
      quality: '360',
      videoDir: 'file:///mock-docs/downloads/m-fsst/',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    (resolveEmbedStream as jest.Mock).mockResolvedValue({
      progressive: true,
      hlsSource: [{ label: 'Default', quality: { '360': 'https://cdn/v.mp4' } }],
      tracks: [{ kind: 'captions', label: '—', src: '' }],
    });
    await useDownloadsStore.getState().retry('m-fsst');
    await new Promise((r) => setTimeout(r, 40));
    expect(resolveEmbedStream).toHaveBeenCalledWith('https://fsst.online/embed/1', {
      season: undefined,
      episode: undefined,
    });
    expect(downloadProgressiveFile).toHaveBeenCalled();
  });

  it('enqueue progressive movie downloads via downloadProgressiveFile', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id) ?? null
    );
    (downloadProgressiveFile as jest.Mock).mockImplementation(
      async (_u: string, dest: string, onProgress?: (p: number) => void) => {
        onProgress?.(0.5);
        return dest;
      }
    );
    await useDownloadsStore.getState().enqueue({
      movieId: '7739',
      title: 'Kitchen',
      playerUrl: 'https://fsst.online/playlist_iframe/1/',
      audioLabel: 'Кухня 2-1',
      quality: '360',
      subtitleLabel: '—',
      hlsUrl: 'https://cdn/ep.mp4',
      subtitleUrl: '',
      mediaKind: 'progressive',
      season: 2,
      episode: 1,
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadProgressiveFile).toHaveBeenCalled();
    expect(withMediaFetchPlayer).not.toHaveBeenCalled();
    const item = useDownloadsStore.getState().items[0];
    expect(item?.mediaKind).toBe('progressive');
    expect(item?.status).toBe('completed');
  });

  it('infers progressive mediaKind from mp4 URL without explicit kind', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id) ?? null
    );
    await useDownloadsStore.getState().enqueue({
      movieId: 'p1',
      title: 'Prog',
      playerUrl: 'https://fsst.online/embed/1',
      audioLabel: 'Default',
      quality: '360',
      subtitleLabel: '—',
      hlsUrl: 'https://cdn/v.mp4',
      subtitleUrl: '',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(useDownloadsStore.getState().items[0]?.mediaKind).toBe('progressive');
    expect(downloadProgressiveFile).toHaveBeenCalled();
  });

  it('movie progressive aborts after file download when removed', async () => {
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id) ?? null
    );
    (downloadProgressiveFile as jest.Mock).mockImplementation(
      async (_u: string, dest: string, onProgress?: (p: number) => void) => {
        onProgress?.(0.2);
        const id = useDownloadsStore.getState().activeId;
        if (id) await useDownloadsStore.getState().remove(id);
        onProgress?.(0.8);
        return dest;
      }
    );
    await useDownloadsStore.getState().enqueue({
      movieId: 'abort-p',
      title: 'Abort',
      playerUrl: 'https://fsst.online/embed/1',
      audioLabel: 'Default',
      quality: '360',
      subtitleLabel: '—',
      hlsUrl: 'https://cdn/v.mp4',
      subtitleUrl: '',
      mediaKind: 'progressive',
    });
    await new Promise((r) => setTimeout(r, 50));
  });

  it('retry embess throws when resolveEmbedStream returns no streams', async () => {
    const item = baseRecord({
      id: 'm-empty-embed',
      status: 'failed',
      playerUrl: 'https://api.embess.ws/embed/1',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    (resolveEmbedStream as jest.Mock).mockResolvedValue(null);
    await expect(useDownloadsStore.getState().retry('m-empty-embed')).rejects.toThrow(
      t('store.retryNoStreams')
    );
  });

  it('retry movie keeps progressive mediaKind while resolving', async () => {
    const item = baseRecord({
      id: 'm-prog-resolve',
      status: 'failed',
      playerUrl: 'https://player?foo=1',
      mediaKind: 'progressive',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    await useDownloadsStore.getState().retry('m-prog-resolve');
    const updated = useDownloadsStore.getState().items.find((i) => i.id === 'm-prog-resolve');
    expect(updated?.status).toBe('resolving');
    expect(updated?.mediaKind).toBe('progressive');
  });

  it('retry throws when missing', async () => {
    (getDownload as jest.Mock).mockResolvedValue(null);
    await expect(useDownloadsStore.getState().retry('nope')).rejects.toThrow(t('store.notFound'));
  });

  it('completeMovieRetry rebuilds request and enqueues job', async () => {
    const item = baseRecord({
      id: 'm2',
      status: 'resolving',
      audioLabel: 'RU',
      subtitleLabel: 'Subs',
      quality: '720',
      videoDir: 'file:///mock-docs/downloads/m2/',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      return useDownloadsStore.getState().items.find((i) => i.id === id) ?? item;
    });
    useDownloadsStore.setState({ items: [item], hydrated: true });

    await useDownloadsStore.getState().completeMovieRetry('m2', {
      hlsSource: [
        {
          label: 'RU',
          quality: { '720': 'https://hls/720.m3u8', '480': 'https://hls/480.m3u8' },
          audioId: 'https://hls/audio.m3u8',
        },
      ],
      tracks: [{ label: 'Subs', src: 'https://subs.vtt' }],
    } as never);

    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      expect.any(Function),
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ audioPlaylistUrl: 'https://hls/audio.m3u8' })
    );
    expect(useDownloadsStore.getState().items.find((i) => i.id === 'm2')?.status).toBe(
      'completed'
    );
  });

  it('completeMovieRetry tolerates empty subtitle src and missing audioId', async () => {
    const item = baseRecord({
      id: 'm2b',
      status: 'resolving',
      audioLabel: 'RU',
      subtitleLabel: 'Subs',
      quality: '720',
      videoDir: 'file:///mock-docs/downloads/m2b/',
      subtitleUrl: '',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      return useDownloadsStore.getState().items.find((i) => i.id === id) ?? item;
    });
    useDownloadsStore.setState({ items: [item], hydrated: true });

    await useDownloadsStore.getState().completeMovieRetry('m2b', {
      hlsSource: [{ label: 'RU', quality: { '720': 'https://hls/720.m3u8' } }],
      tracks: [{ label: 'Subs', src: '' }],
    } as never);

    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      expect.any(Function),
      expect.any(String),
      expect.any(Object),
      undefined
    );
  });

  it('completeMovieRetry uses pickSubtitleTrack fallback', async () => {
    const item = baseRecord({
      id: 'm3',
      status: 'resolving',
      audioLabel: 'X',
      subtitleLabel: 'missing',
      quality: '999',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    (pickSubtitleTrack as jest.Mock).mockReturnValue({ label: 'RU', src: 'https://ru' });
    useDownloadsStore.setState({ items: [item], hydrated: true });

    await useDownloadsStore.getState().completeMovieRetry('m3', {
      hlsSource: [{ label: 'Other', quality: { '480': 'https://hls/480.m3u8' } }],
      tracks: [{ label: 'EN', src: 'https://en' }],
    } as never);

    expect(pickSubtitleTrack).toHaveBeenCalled();
  });

  it('completeMovieRetry throws without streams', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'm4', status: 'resolving' })
    );
    await expect(
      useDownloadsStore.getState().completeMovieRetry('m4', { hlsSource: [], tracks: [] } as never)
    ).rejects.toThrow(t('store.retryNoStreams'));
  });

  it('failMovieResolve marks failed', async () => {
    const item = baseRecord({ id: 'm5', status: 'resolving' });
    (getDownload as jest.Mock).mockResolvedValue(item);
    useDownloadsStore.setState({ items: [item], hydrated: true });
    await useDownloadsStore.getState().failMovieResolve('m5', 'resolve failed');
    expect(useDownloadsStore.getState().items.find((i) => i.id === 'm5')?.status).toBe('failed');
    expect(useDownloadsStore.getState().items.find((i) => i.id === 'm5')?.error).toBe(
      'resolve failed'
    );
  });

  it('failMovieResolve no-ops when missing', async () => {
    (getDownload as jest.Mock).mockResolvedValue(null);
    await useDownloadsStore.getState().failMovieResolve('nope', 'x');
  });

  it('retry youtube throws without youtubeUrl', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'yt2', status: 'failed', source: 'youtube', youtubeUrl: undefined })
    );
    await expect(useDownloadsStore.getState().retry('yt2')).rejects.toThrow(t('store.noYoutubeUrl'));
  });

  it('retry movie throws without playerUrl', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'm6', status: 'failed', playerUrl: undefined })
    );
    await expect(useDownloadsStore.getState().retry('m6')).rejects.toThrow(t('store.noRetryParams'));
  });

  it('retry movie without query string adds cache bust', async () => {
    const item = baseRecord({
      id: 'm7',
      status: 'failed',
      playerUrl: 'https://player/plain',
    });
    (getDownload as jest.Mock).mockResolvedValue(item);
    await useDownloadsStore.getState().retry('m7');
    expect(useDownloadsStore.getState().items.find((i) => i.id === 'm7')?.playerUrl).toMatch(
      /\?_nd=/
    );
  });

  it('completeMovieRetry throws when item missing playerUrl', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'm8', status: 'resolving', playerUrl: undefined })
    );
    await expect(
      useDownloadsStore.getState().completeMovieRetry('m8', {
        hlsSource: [{ label: 'a', quality: { '720': 'u' } }],
        tracks: [{ label: 's', src: 'x' }],
      } as never)
    ).rejects.toThrow(t('store.notFound'));
  });

  it('completeMovieRetry throws when quality empty and when subtitle missing', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'm9', status: 'resolving', quality: '720', audioLabel: 'A' })
    );
    await expect(
      useDownloadsStore.getState().completeMovieRetry('m9', {
        hlsSource: [{ label: 'A', quality: {} }],
        tracks: [{ label: 's', src: 'x' }],
      } as never)
    ).rejects.toThrow(t('store.retryNoStreams'));

    (pickSubtitleTrack as jest.Mock).mockReturnValue(null);
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'm10', status: 'resolving', quality: '720', audioLabel: 'A' })
    );
    await expect(
      useDownloadsStore.getState().completeMovieRetry('m10', {
        hlsSource: [{ label: 'A', quality: { '720': 'https://h' } }],
        tracks: [],
      } as never)
    ).rejects.toThrow(t('store.retryNoStreams'));
  });

  it('movie job reports progress and handles abort mid-flight', async () => {
    jest.useFakeTimers();
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      return (
        useDownloadsStore.getState().items.find((i) => i.id === id) ??
        baseRecord({ id, status: 'queued' })
      );
    });
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      async (
        _u: string,
        _d: string,
        _h: number,
        onProgress?: (p: number) => void,
        _p?: string,
        signal?: AbortSignal
      ) => {
        onProgress?.(0.1);
        onProgress?.(0.2);
        onProgress?.(0.3);
        if (signal) {
          // simulate abort after progress
        }
        return {
          dir: 'file:///mock-docs/downloads/id/',
          playlistPath: 'file:///mock-docs/downloads/id/index.m3u8',
        };
      }
    );

    const id = await useDownloadsStore.getState().enqueue({
      movieId: 'prog',
      title: 'Prog',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await jest.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await jest.runOnlyPendingTimersAsync();
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('completed');
    jest.useRealTimers();
  });

  it('movie job exits early when deleted while queued', async () => {
    let calls = 0;
    (getDownload as jest.Mock).mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return null;
      return null;
    });
    await useDownloadsStore.getState().enqueue({
      movieId: 'gone',
      title: 'Gone',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(downloadHlsToDirectory).not.toHaveBeenCalled();
  });

  it('movie job abort error is swallowed', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      baseRecord({ id, status: 'queued' })
    );
    const abortErr = new Error('Download cancelled');
    abortErr.name = 'AbortError';
    (downloadHlsToDirectory as jest.Mock).mockRejectedValueOnce(abortErr);
    await useDownloadsStore.getState().enqueue({
      movieId: 'ab',
      title: 'Ab',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 30));
    // should not be failed
    expect(
      useDownloadsStore.getState().items.find((i) => i.movieId === 'ab')?.status
    ).not.toBe('failed');
  });

  it('movie job non-Error failure uses default message', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      baseRecord({ id, status: 'queued' })
    );
    (downloadHlsToDirectory as jest.Mock).mockRejectedValueOnce('raw');
    const id = await useDownloadsStore.getState().enqueue({
      movieId: 'raw',
      title: 'Raw',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.error).toBe(
      t('store.downloadError')
    );
  });

  it('youtube progressive reports progress', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadProgressiveFile as jest.Mock).mockImplementation(
      async (_u: string, dest: string, onProgress?: (p: number) => void) => {
        onProgress?.(0.5);
        return dest;
      }
    );
    const id = await useDownloadsStore.getState().enqueueYoutube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('completed');
  });

  it('youtube job fails when download throws non-abort', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadProgressiveFile as jest.Mock).mockRejectedValueOnce(new Error('yt fail'));
    const id = await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 30));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe('failed');
  });

  it('youtube job deleted mid-flight returns early', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/m.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async () => {
      n += 1;
      if (n === 1) return baseRecord({ id: 'x', status: 'queued', source: 'youtube' });
      return null;
    });
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 30));
  });

  it('remove clears activeId and stops foreground when idle', async () => {
    useDownloadsStore.setState({
      items: [baseRecord({ id: 'x', status: 'failed' })],
      hydrated: true,
      activeId: 'x',
    });
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'x', status: 'failed', videoDir: 'file:///v' })
    );
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('busy'));
    await useDownloadsStore.getState().remove('x');
    expect(useDownloadsStore.getState().activeId).toBeNull();
    expect(stopDownloadForeground).toHaveBeenCalled();
  });

  it('enqueueMovieJob warns when finally rejects', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      baseRecord({ id, status: 'queued' })
    );
    (stopDownloadForeground as jest.Mock).mockRejectedValueOnce(new Error('fg boom'));
    await useDownloadsStore.getState().enqueue({
      movieId: 'q1',
      title: 'Q1',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('throttles progress reports then flushes via timer', async () => {
    jest.useFakeTimers({ now: 1_000_000 });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadProgressiveFile as jest.Mock).mockImplementation(
      async (_u: string, dest: string, onProgress?: (p: number) => void) => {
        onProgress?.(0.1);
        onProgress?.(0.2);
        onProgress?.(0.3);
        // Stay inside download until throttle timer fires (before flushPending)
        await new Promise((r) => setTimeout(r, 300));
        return dest;
      }
    );
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    const idPromise = useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    const id = await idPromise;
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe(
      'completed'
    );
    expect(updateDownloadForeground).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('youtube hls reports progress', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/m.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      async (
        _u: string,
        _d: string,
        _h: number,
        onProgress?: (p: number) => void
      ) => {
        onProgress?.(0.4);
        return {
          dir: 'file:///mock-docs/downloads/yt/',
          playlistPath: 'file:///mock-docs/downloads/yt/index.m3u8',
        };
      }
    );
    const id = await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 30));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.status).toBe(
      'completed'
    );
  });

  it('throws AbortError when signal aborted after hls download', async () => {
    let finishHls: (v: { dir: string; playlistPath: string }) => void = () => undefined;
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishHls = resolve;
        })
    );
    const id = await useDownloadsStore.getState().enqueue({
      movieId: 'ab3',
      title: 'Ab3',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 10));
    (listDownloads as jest.Mock).mockResolvedValue([]);
    await useDownloadsStore.getState().remove(id);
    finishHls({
      dir: 'file:///mock-docs/downloads/id/',
      playlistPath: 'file:///mock-docs/downloads/id/index.m3u8',
    });
    await new Promise((r) => setTimeout(r, 30));
  });

  it('failDownload no-ops when row deleted between checks', async () => {
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      n += 1;
      // First lookups during job succeed; failDownload's getDownload returns null
      if (n <= 3) {
        return (
          useDownloadsStore.getState().items.find((i) => i.id === id) ??
          baseRecord({ id, status: 'queued' })
        );
      }
      return null;
    });
    (downloadHlsToDirectory as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await useDownloadsStore.getState().enqueue({
      movieId: 'gone2',
      title: 'Gone2',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('aborts at start when removed during foreground start', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (startDownloadForeground as jest.Mock).mockImplementation(async () => {
      const id = useDownloadsStore.getState().items[0]?.id;
      if (id) await useDownloadsStore.getState().remove(id);
    });
    await useDownloadsStore.getState().enqueue({
      movieId: 'early2',
      title: 'Early2',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).not.toHaveBeenCalled();
  });

  it('aborts youtube at start when removed during foreground start', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (startDownloadForeground as jest.Mock).mockImplementation(async () => {
      const id = useDownloadsStore.getState().items[0]?.id;
      if (id) await useDownloadsStore.getState().remove(id);
    });
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadProgressiveFile).not.toHaveBeenCalled();
  });

  it('aborts movie after prior load when removed during getDownload', async () => {
    (listDownloads as jest.Mock).mockResolvedValue([]);
    let priorCalls = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      priorCalls += 1;
      if (priorCalls === 1) {
        await useDownloadsStore.getState().remove(id);
        return baseRecord({ id, status: 'queued' });
      }
      return null;
    });
    await useDownloadsStore.getState().enqueue({
      movieId: 'ab-prior',
      title: 'AbPrior',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).not.toHaveBeenCalled();
  });

  it('skips progress when aborted mid-hls callback', async () => {
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      async (
        _u: string,
        _d: string,
        _h: number,
        onProgress?: (p: number) => void
      ) => {
        onProgress?.(0.1);
        const id = useDownloadsStore.getState().activeId;
        if (id) await useDownloadsStore.getState().remove(id);
        onProgress?.(0.5);
        const err = new Error('Download cancelled');
        err.name = 'AbortError';
        throw err;
      }
    );
    await useDownloadsStore.getState().enqueue({
      movieId: 'ab-prog',
      title: 'AbProg',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('returns after hls when aborted during subtitle download', async () => {
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadTextFile as jest.Mock).mockImplementation(async () => {
      const id = useDownloadsStore.getState().activeId;
      if (id) await useDownloadsStore.getState().remove(id);
      return 'file:///subs.vtt';
    });
    await useDownloadsStore.getState().enqueue({
      movieId: 'ab-subs',
      title: 'AbSubs',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('returns when row missing after successful hls', async () => {
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      n += 1;
      if (n === 1) {
        return (
          useDownloadsStore.getState().items.find((i) => i.id === id) ??
          baseRecord({ id, status: 'queued' })
        );
      }
      return null;
    });
    await useDownloadsStore.getState().enqueue({
      movieId: 'miss-after',
      title: 'Miss',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('catch returns when row deleted before failDownload', async () => {
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      n += 1;
      if (n === 1) return baseRecord({ id, status: 'queued' });
      return null;
    });
    (downloadHlsToDirectory as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await useDownloadsStore.getState().enqueue({
      movieId: 'catch-gone',
      title: 'CatchGone',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('youtube progressive skips progress when aborted mid-callback', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadProgressiveFile as jest.Mock).mockImplementation(
      async (_u: string, dest: string, onProgress?: (p: number) => void) => {
        onProgress?.(0.1);
        const id = useDownloadsStore.getState().activeId;
        if (id) await useDownloadsStore.getState().remove(id);
        onProgress?.(0.9);
        return dest;
      }
    );
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('youtube hls skips progress when aborted mid-callback', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '480',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/m.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (listDownloads as jest.Mock).mockResolvedValue([]);
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      async (
        _u: string,
        _d: string,
        _h: number,
        onProgress?: (p: number) => void
      ) => {
        onProgress?.(0.2);
        const id = useDownloadsStore.getState().activeId;
        if (id) await useDownloadsStore.getState().remove(id);
        onProgress?.(0.8);
        return {
          dir: 'file:///mock-docs/downloads/yt/',
          playlistPath: 'file:///mock-docs/downloads/yt/index.m3u8',
        };
      }
    );
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('youtube aborts after prior when removed during getDownload', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (listDownloads as jest.Mock).mockResolvedValue([]);
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      n += 1;
      if (n === 1) {
        await useDownloadsStore.getState().remove(id);
        return baseRecord({ id, status: 'queued', source: 'youtube' });
      }
      return null;
    });
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadProgressiveFile).not.toHaveBeenCalled();
  });

  it('youtube catch returns when row gone', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      n += 1;
      if (n === 1) return baseRecord({ id, status: 'queued', source: 'youtube' });
      return null;
    });
    (downloadProgressiveFile as jest.Mock).mockRejectedValueOnce(new Error('yt boom'));
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('youtube catch swallows AbortError', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    const abortErr = new Error('cancelled');
    abortErr.name = 'AbortError';
    (downloadProgressiveFile as jest.Mock).mockRejectedValueOnce(abortErr);
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('youtube non-Error failure uses default message', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadProgressiveFile as jest.Mock).mockRejectedValueOnce('raw');
    const id = await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
    expect(useDownloadsStore.getState().items.find((i) => i.id === id)?.error).toBe(
      t('store.downloadError')
    );
  });

  it('patchItemInStore inserts when id missing from items', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      async (
        _u: string,
        _d: string,
        _h: number,
        onProgress?: (p: number) => void
      ) => {
        useDownloadsStore.setState({ items: [] });
        onProgress?.(0.5);
        return {
          dir: 'file:///mock-docs/downloads/id/',
          playlistPath: 'file:///mock-docs/downloads/id/index.m3u8',
        };
      }
    );
    await useDownloadsStore.getState().enqueue({
      movieId: 'patch-miss',
      title: 'PatchMiss',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('retry youtube uses title/poster fallbacks and progressive videoDir default', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: '',
      posterUrl: undefined,
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({
        id: 'yt_dQw4w9WgXcQ',
        source: 'youtube',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'OldTitle',
        posterUrl: 'https://old-poster',
        status: 'failed',
        videoDir: undefined,
      })
    );
    (downloadProgressiveFile as jest.Mock).mockResolvedValue('file:///v.mp4');
    useDownloadsStore.setState({
      items: [
        baseRecord({
          id: 'yt_dQw4w9WgXcQ',
          source: 'youtube',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'OldTitle',
          posterUrl: 'https://old-poster',
          status: 'failed',
        }),
      ],
      hydrated: true,
    });
    await useDownloadsStore.getState().retry('yt_dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('retry youtube hls sets hlsUrl from stream', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'HLS',
      quality: '720',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/m.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({
        id: 'yt_dQw4w9WgXcQ',
        source: 'youtube',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        status: 'failed',
        videoDir: 'file:///mock-docs/downloads/yt/',
      })
    );
    useDownloadsStore.setState({
      items: [
        baseRecord({
          id: 'yt_dQw4w9WgXcQ',
          source: 'youtube',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          status: 'failed',
        }),
      ],
      hydrated: true,
    });
    await useDownloadsStore.getState().retry('yt_dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
  });

  it('completeMovieRetry uses empty hlsSource/tracks defaults', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({
        id: 'm-empty',
        status: 'resolving',
        playerUrl: 'https://player',
        quality: '720',
        audioLabel: 'A',
      })
    );
    await expect(
      useDownloadsStore.getState().completeMovieRetry('m-empty', {} as never)
    ).rejects.toThrow(t('store.retryNoStreams'));
  });

  it('failDownload returns when getDownload null', async () => {
    (downloadHlsToDirectory as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    let n = 0;
    (getDownload as jest.Mock).mockImplementation(async (id: string) => {
      n += 1;
      if (n === 1) return baseRecord({ id, status: 'queued' });
      if (n === 2) return baseRecord({ id, status: 'downloading' }); // stillExists
      return null; // failDownload
    });
    await useDownloadsStore.getState().enqueue({
      movieId: 'fd-null',
      title: 'FdNull',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
  });

  it('remove keeps foreground when another job still active', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({ id: 'done1', status: 'completed', videoDir: 'file:///v' })
    );
    (listDownloads as jest.Mock).mockResolvedValue([
      baseRecord({ id: 'other', status: 'downloading', progress: 0.2 }),
    ]);
    useDownloadsStore.setState({
      items: [
        baseRecord({ id: 'done1', status: 'completed' }),
        baseRecord({ id: 'other', status: 'downloading', progress: 0.2 }),
      ],
      hydrated: true,
      activeId: null,
    });
    (stopDownloadForeground as jest.Mock).mockClear();
    await useDownloadsStore.getState().remove('done1');
    expect(stopDownloadForeground).not.toHaveBeenCalled();
  });

  it('completeMovieRetry with omitted tracks uses empty list', async () => {
    (getDownload as jest.Mock).mockResolvedValue(
      baseRecord({
        id: 'm-tracks',
        status: 'resolving',
        playerUrl: 'https://player',
        quality: '720',
        audioLabel: 'A',
        subtitleLabel: 'S',
      })
    );
    (pickSubtitleTrack as jest.Mock).mockReturnValue(null);
    await expect(
      useDownloadsStore.getState().completeMovieRetry('m-tracks', {
        hlsSource: [{ label: 'A', quality: { '720': 'https://h' } }],
      } as never)
    ).rejects.toThrow(t('store.retryNoStreams'));
  });

  it('quality non-numeric falls back to 720', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    await useDownloadsStore.getState().enqueue({
      movieId: 'qbest',
      title: 'QBest',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: 'best',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).toHaveBeenCalledWith(
      'https://hls',
      expect.any(String),
      720,
      expect.any(Function),
      'https://player',
      expect.any(Object),
      undefined
    );
  });

  it('embess player skips MediaFetch and passes audioPlaylistUrl', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (withMediaFetchPlayer as jest.Mock).mockClear();
    await useDownloadsStore.getState().enqueue({
      movieId: 'emb1',
      title: 'Embess',
      playerUrl: 'https://api.embess.ws/embed/1',
      audioLabel: 'MovieDalen',
      quality: '720',
      subtitleLabel: '—',
      hlsUrl: 'https://cdn/master.m3u8',
      subtitleUrl: '',
      audioPlaylistUrl: 'https://cdn/a1.m3u8',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(withMediaFetchPlayer).not.toHaveBeenCalled();
    expect(downloadHlsToDirectory).toHaveBeenCalledWith(
      'https://cdn/master.m3u8',
      expect.any(String),
      720,
      expect.any(Function),
      'https://api.embess.ws/embed/1',
      expect.any(Object),
      { audioPlaylistUrl: 'https://cdn/a1.m3u8', audioLabel: 'MovieDalen' }
    );
    expect(downloadTextFile).not.toHaveBeenCalled();
  });

  it('youtube prior missing returns early', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: 'best',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/m.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockResolvedValue(null);
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).not.toHaveBeenCalled();
  });

  it('youtube hls with non-numeric quality uses 720', async () => {
    (resolveYoutubeStream as jest.Mock).mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'YT',
      quality: 'best',
      mediaKind: 'hls',
      streamUrl: 'https://cdn/m.m3u8',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    (downloadHlsToDirectory as jest.Mock).mockResolvedValue({
      dir: 'file:///mock-docs/downloads/yt/',
      playlistPath: 'file:///mock-docs/downloads/yt/index.m3u8',
    });
    await useDownloadsStore.getState().enqueueYoutube('dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).toHaveBeenCalledWith(
      'https://cdn/m.m3u8',
      expect.any(String),
      720,
      expect.any(Function),
      undefined,
      expect.any(Object)
    );
  });

  it('patch updates existing item among multiple rows', async () => {
    (getDownload as jest.Mock).mockImplementation(async (id: string) =>
      useDownloadsStore.getState().items.find((i) => i.id === id)
    );
    useDownloadsStore.setState({
      items: [
        baseRecord({ id: 'other', status: 'completed', progress: 1 }),
      ],
      hydrated: true,
    });
    (downloadHlsToDirectory as jest.Mock).mockImplementation(
      async (
        _u: string,
        _d: string,
        _h: number,
        onProgress?: (p: number) => void
      ) => {
        onProgress?.(0.5);
        return {
          dir: 'file:///mock-docs/downloads/id/',
          playlistPath: 'file:///mock-docs/downloads/id/index.m3u8',
        };
      }
    );
    await useDownloadsStore.getState().enqueue({
      movieId: 'multi-patch',
      title: 'Multi',
      playerUrl: 'https://player',
      audioLabel: 'RU',
      quality: '720',
      subtitleLabel: 'S',
      hlsUrl: 'https://hls',
      subtitleUrl: 'https://subs',
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(useDownloadsStore.getState().items.length).toBeGreaterThan(1);
  });
});
