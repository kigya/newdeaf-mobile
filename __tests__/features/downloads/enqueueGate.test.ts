import { DownloadGateError } from '@/src/features/downloads/errors';

jest.mock('@/src/features/downloads/network', () => ({
  currentWifiOnlyBlocked: jest.fn(async () => false),
  isWifiOnlyBlocked: jest.fn(() => false),
}));

jest.mock('@/src/features/downloads/storage', () => ({
  computeDownloadsUsage: jest.fn(async () => 0),
  computePathUsage: jest.fn(async () => 0),
  isStorageCapBlocked: jest.fn(() => false),
  formatBytes: jest.fn(() => '0 B'),
}));

jest.mock('@/src/features/settings/store', () => {
  const state = {
    downloadsWifiOnly: false,
    storageCapMb: 0,
  };
  return {
    useSettingsStore: Object.assign(
      (sel: (s: typeof state) => unknown) => sel(state),
      { getState: () => state }
    ),
    __settings: state,
  };
});

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
    dir: 'file://x/',
    playlistPath: 'file://x/index.m3u8',
  })),
  downloadTextFile: jest.fn(async (_u: string, dest: string) => dest),
  pickPrimaryMediaUrl: jest.fn((u: string) => u),
  pickSubtitleTrack: jest.fn(),
}));

jest.mock('@/src/features/downloads/mediaFetch', () => ({
  withMediaFetchPlayer: jest.fn(async (_url: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/src/features/downloads/progressive', () => ({
  downloadProgressiveFile: jest.fn(async () => 'file://x/video.mp4'),
  progressiveMediaHeaders: jest.fn(() => ({})),
}));

jest.mock('@/src/features/downloads/youtube', () => ({
  resolveYoutubeStream: jest.fn(),
}));

jest.mock('@/src/data/catalog/embedStreams', () => ({
  isEmbessPlayerUrl: () => false,
  isFsstPlayerUrl: () => false,
  isProgressiveMediaUrl: () => false,
  isResolvableEmbedUrl: () => false,
  resolveEmbedStream: jest.fn(),
}));

import { currentWifiOnlyBlocked } from '@/src/features/downloads/network';
import { computeDownloadsUsage, isStorageCapBlocked } from '@/src/features/downloads/storage';
import { useDownloadsStore } from '@/src/features/downloads/store';

const settings = jest.requireMock('@/src/features/settings/store') as {
  __settings: { downloadsWifiOnly: boolean; storageCapMb: number };
};

describe('download enqueue gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settings.__settings.downloadsWifiOnly = false;
    settings.__settings.storageCapMb = 0;
    (currentWifiOnlyBlocked as jest.Mock).mockResolvedValue(false);
    (isStorageCapBlocked as jest.Mock).mockReturnValue(false);
    (computeDownloadsUsage as jest.Mock).mockResolvedValue(0);
    useDownloadsStore.setState({ items: [], hydrated: true, activeId: null });
  });

  it('rejects wifi unless force', async () => {
    (currentWifiOnlyBlocked as jest.Mock).mockResolvedValue(true);
    await expect(
      useDownloadsStore.getState().enqueue({
        movieId: '1',
        title: 'A',
        playerUrl: 'https://p',
        audioLabel: 'RU',
        quality: '720',
        subtitleLabel: 'subs',
        hlsUrl: 'https://h.m3u8',
        subtitleUrl: '',
      })
    ).rejects.toBeInstanceOf(DownloadGateError);
    await expect(
      useDownloadsStore.getState().enqueue(
        {
          movieId: '1',
          title: 'A',
          playerUrl: 'https://p',
          audioLabel: 'RU',
          quality: '720',
          subtitleLabel: 'subs',
          hlsUrl: 'https://h.m3u8',
          subtitleUrl: '',
        },
        { force: true }
      )
    ).resolves.toEqual(expect.any(String));
  });

  it('rejects storage cap unless force', async () => {
    (isStorageCapBlocked as jest.Mock).mockReturnValue(true);
    await expect(
      useDownloadsStore.getState().enqueue({
        movieId: '2',
        title: 'B',
        playerUrl: 'https://p',
        audioLabel: 'RU',
        quality: '720',
        subtitleLabel: 'subs',
        hlsUrl: 'https://h.m3u8',
        subtitleUrl: '',
      })
    ).rejects.toMatchObject({ code: 'storage' });
  });

  it('rejects youtube enqueue on wifi unless force', async () => {
    const { resolveYoutubeStream } = jest.requireMock('@/src/features/downloads/youtube') as {
      resolveYoutubeStream: jest.Mock;
    };
    resolveYoutubeStream.mockResolvedValue({
      youtubeUrl: 'https://youtu.be/x',
      videoId: 'x',
      title: 'YT',
      quality: '720',
      mediaKind: 'progressive',
      streamUrl: 'https://cdn/v.mp4',
    });
    (currentWifiOnlyBlocked as jest.Mock).mockResolvedValue(true);
    await expect(
      useDownloadsStore.getState().enqueueYoutube('https://youtu.be/x')
    ).rejects.toBeInstanceOf(DownloadGateError);
    await expect(
      useDownloadsStore.getState().enqueueYoutube('https://youtu.be/x', '720', { force: true })
    ).resolves.toEqual(expect.any(String));
  });
});
