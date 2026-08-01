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
}));

jest.mock('@/src/features/downloads/youtube', () => ({
  resolveYoutubeStream: jest.fn(),
  extractYoutubeVideoId: jest.fn(() => 'dQw4w9WgXcQ'),
}));

import {
  deleteDownloadRow,
  getDownload,
  listDownloads,
  upsertDownload,
} from '@/src/features/downloads/db';
import {
  startDownloadForeground,
  stopDownloadForeground,
} from '@/src/features/downloads/foreground';
import {
  downloadHlsToDirectory,
  downloadTextFile,
  pickSubtitleTrack,
} from '@/src/features/downloads/hls';
import { downloadProgressiveFile } from '@/src/features/downloads/progressive';
import { useDownloadsStore } from '@/src/features/downloads/store';
import type { DownloadRecord } from '@/src/features/downloads/types';
import { resolveYoutubeStream } from '@/src/features/downloads/youtube';
import { t } from '@/src/shared/i18n';

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
        { label: 'RU', quality: { '720': 'https://hls/720.m3u8', '480': 'https://hls/480.m3u8' } },
      ],
      tracks: [{ label: 'Subs', src: 'https://subs.vtt' }],
    } as never);

    await new Promise((r) => setTimeout(r, 40));
    expect(downloadHlsToDirectory).toHaveBeenCalled();
    expect(useDownloadsStore.getState().items.find((i) => i.id === 'm2')?.status).toBe(
      'completed'
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
});
