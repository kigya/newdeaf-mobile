import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { ContinueWatchingRail } from '@/src/shared/ui/ContinueWatchingRail';
import type { DownloadRecord } from '@/src/features/downloads/types';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';

const mockClearById = jest.fn(async () => undefined);

jest.mock('@/src/features/watch-progress/store', () => ({
  useWatchProgressStore: jest.fn(),
}));

jest.mock('@/src/features/downloads/store', () => ({
  useDownloadsStore: Object.assign(jest.fn(), {
    getState: jest.fn(),
  }),
}));

const mockUseWp = useWatchProgressStore as unknown as jest.Mock;
const mockUseDl = useDownloadsStore as unknown as jest.Mock & {
  getState: jest.Mock;
};

function makeProgress(
  overrides: Partial<WatchProgressRecord> = {}
): WatchProgressRecord {
  return {
    id: 'p1',
    movieId: 'm1',
    positionSec: 120,
    durationSec: 600,
    title: 'Continue Me',
    posterUrl: 'https://example.com/p.jpg',
    href: '/m1/',
    isSeries: false,
    source: 'online',
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeDownload(overrides: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    movieId: 'm1',
    title: 'Offline Me',
    audioLabel: 'RU',
    quality: '720',
    subtitleLabel: 'EN',
    status: 'completed',
    progress: 1,
    playlistPath: 'file:///playlist.m3u8',
    createdAt: 1,
    updatedAt: 1,
    source: 'movie',
    mediaKind: 'hls',
    ...overrides,
  };
}

describe('ContinueWatchingRail', () => {
  const onRequestRemove = jest.fn();
  let mockPush: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: jest.fn(() => true),
    });
  });

  function mockStores(items: WatchProgressRecord[], downloads: DownloadRecord[]) {
    const state = {
      items,
      hydrated: true,
      clearById: mockClearById,
    };
    mockUseWp.mockImplementation((selector: (s: typeof state) => unknown) => selector(state));
    const dlState = { items: downloads };
    mockUseDl.mockImplementation((selector: (s: typeof dlState) => unknown) =>
      selector(dlState)
    );
    mockUseDl.getState.mockReturnValue(dlState);
  }

  it('returns null when not hydrated', async () => {
    mockUseWp.mockImplementation(
      (selector: (s: {
        hydrated: boolean;
        items: [];
        clearById: typeof mockClearById;
      }) => unknown) => selector({ hydrated: false, items: [], clearById: mockClearById })
    );
    mockUseDl.mockImplementation((selector: (s: { items: [] }) => unknown) =>
      selector({ items: [] })
    );
    const { toJSON } = await render(
      <ContinueWatchingRail onRequestRemove={onRequestRemove} />
    );
    expect(toJSON()).toBeNull();
  });

  it('returns null when no resumable items', async () => {
    mockStores([makeProgress({ positionSec: 10 })], []);
    const { toJSON } = await render(
      <ContinueWatchingRail onRequestRemove={onRequestRemove} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders online item and navigates to movie', async () => {
    mockStores([makeProgress()], []);
    await render(<ContinueWatchingRail onRequestRemove={onRequestRemove} />);
    expect(screen.getByText('Continue Me')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue Me'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/movie/[id]',
        params: expect.objectContaining({ id: 'm1' }),
      })
    );
  });

  it('navigates to offline player when download completed', async () => {
    const item = makeProgress({
      id: 'off1',
      source: 'offline',
      downloadId: 'd1',
      title: 'Offline Me',
      posterUrl: undefined,
      season: 1,
      episode: 2,
    });
    mockStores([item], [makeDownload()]);
    await render(<ContinueWatchingRail onRequestRemove={onRequestRemove} />);
    await fireEvent.press(screen.getByText('Offline Me'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/offline/[downloadId]',
      params: { downloadId: 'd1' },
    });
  });

  it('clears and opens movie when offline download missing playlist', async () => {
    const item = makeProgress({
      id: 'off2',
      source: 'offline',
      downloadId: 'd1',
      title: 'Broken Offline',
    });
    mockStores([item], [makeDownload({ playlistPath: undefined })]);
    await render(<ContinueWatchingRail onRequestRemove={onRequestRemove} />);
    await fireEvent.press(screen.getByText('Broken Offline'));
    expect(mockClearById).toHaveBeenCalledWith('off2');
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/movie/[id]' })
    );
  });

  it('clears orphan offline progress via effect', async () => {
    const item = makeProgress({
      id: 'orphan',
      source: 'offline',
      downloadId: 'missing',
      title: 'Orphan',
    });
    mockStores([item], []);
    await render(<ContinueWatchingRail onRequestRemove={onRequestRemove} />);
    expect(mockClearById).toHaveBeenCalledWith('orphan');
  });

  it('forwards long press to onRequestRemove', async () => {
    const item = makeProgress();
    mockStores([item], []);
    await render(<ContinueWatchingRail onRequestRemove={onRequestRemove} />);
    await fireEvent(screen.getByText('Continue Me'), 'onLongPress');
    expect(onRequestRemove).toHaveBeenCalledWith(item);
  });

  it('uses zero progress ratio without duration and pressed style', async () => {
    const TestRenderer = require('react-test-renderer');
    mockStores([makeProgress({ durationSec: undefined })], []);
    let renderer: {
      root: {
        findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => { props: { style: (s: { pressed: boolean }) => unknown } }[];
      };
      unmount: () => void;
    };
    await act(async () => {
      renderer = TestRenderer.create(
        <ContinueWatchingRail onRequestRemove={onRequestRemove} />
      );
    });
    const pressable = renderer!.root.findAll(
      (n) => typeof n.props?.style === 'function' && typeof n.props?.onPress === 'function'
    )[0];
    pressable.props.style({ pressed: true });
    pressable.props.style({ pressed: false });
    renderer!.unmount();
  });
});
