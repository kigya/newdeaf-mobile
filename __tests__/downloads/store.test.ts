jest.mock('@/src/downloads/db', () => ({
  listDownloads: jest.fn(async () => []),
  upsertDownload: jest.fn(async () => undefined),
  deleteDownloadRow: jest.fn(async () => undefined),
  getDownload: jest.fn(async () => null),
}));

jest.mock('@/src/downloads/foreground', () => ({
  startDownloadForeground: jest.fn(async () => undefined),
  stopDownloadForeground: jest.fn(async () => undefined),
  updateDownloadForeground: jest.fn(async () => undefined),
}));

jest.mock('@/src/downloads/hls', () => ({
  downloadHlsToDirectory: jest.fn(),
  downloadTextFile: jest.fn(),
  pickPrimaryMediaUrl: jest.fn((u: string) => u),
  pickSubtitleTrack: jest.fn(() => null),
}));

jest.mock('@/src/downloads/mediaFetch', () => ({
  withMediaFetchPlayer: jest.fn(async (_url: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/src/downloads/progressive', () => ({
  downloadProgressiveFile: jest.fn(),
}));

jest.mock('@/src/downloads/youtube', () => ({
  resolveYoutubeStream: jest.fn(),
  extractYoutubeVideoId: jest.fn(() => 'dQw4w9WgXcQ'),
}));

import { listDownloads, upsertDownload, deleteDownloadRow } from '@/src/downloads/db';
import { stopDownloadForeground } from '@/src/downloads/foreground';
import { useDownloadsStore } from '@/src/downloads/store';
import type { DownloadRecord } from '@/src/downloads/types';
import { t } from '@/src/i18n';

function baseRecord(partial: Partial<DownloadRecord> & Pick<DownloadRecord, 'id' | 'status'>): DownloadRecord {
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
    ...partial,
  };
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

  it('remove deletes db row', async () => {
    useDownloadsStore.setState({
      items: [baseRecord({ id: 'x', status: 'failed' })],
      hydrated: true,
      activeId: null,
    });
    (listDownloads as jest.Mock).mockResolvedValue([]);
    await useDownloadsStore.getState().remove('x');
    expect(deleteDownloadRow).toHaveBeenCalledWith('x');
  });
});
