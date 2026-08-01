import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DownloadSheet } from '@/src/shared/ui/DownloadSheet';
import { YoutubeDownloadSheet } from '@/src/shared/ui/YoutubeDownloadSheet';
import { t } from '@/src/shared/i18n';

const mockEnqueue = jest.fn(async () => undefined);
const mockEnqueueYoutube = jest.fn(async () => undefined);
let mockDownloadItems: unknown[] = [];

jest.mock('@/src/features/downloads/store', () => ({
  useDownloadsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      enqueue: mockEnqueue,
      enqueueYoutube: mockEnqueueYoutube,
      items: mockDownloadItems,
    })
  ),
}));

jest.mock('@/src/features/settings/store', () => ({
  useSettingsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ preferredDownloadQuality: '720' })
  ),
}));

jest.mock('@/src/features/playback/StreamResolver', () => ({
  StreamResolver: ({
    onResolved,
    onError,
  }: {
    onResolved: (p: unknown) => void;
    onError: (m: string) => void;
  }) => {
    const ReactLocal = require('react');
    const { Pressable: P, Text, View } = require('react-native');
    return ReactLocal.createElement(
      View,
      null,
      ReactLocal.createElement(
        P,
        {
          testID: 'sheet-resolve',
          onPress: () =>
            onResolved({
              hlsSource: [
                {
                  label: 'Original',
                  quality: { '720': 'https://cdn/720.m3u8', '1080': 'https://cdn/1080.m3u8' },
                },
                {
                  label: 'Dub',
                  quality: { '480': 'https://cdn/480.m3u8' },
                },
              ],
              tracks: [
                { kind: 'captions', label: 'EN', src: 'https://cdn/en.vtt' },
                { kind: 'captions', label: 'RU', src: 'https://cdn/ru.vtt' },
              ],
            }),
        },
        ReactLocal.createElement(Text, null, 'resolve')
      ),
      ReactLocal.createElement(
        P,
        {
          testID: 'sheet-resolve-empty',
          onPress: () => onResolved({ hlsSource: [], tracks: [] }),
        },
        ReactLocal.createElement(Text, null, 'empty')
      ),
      ReactLocal.createElement(
        P,
        { testID: 'sheet-resolve-err', onPress: () => onError('bad') },
        ReactLocal.createElement(Text, null, 'err')
      )
    );
  },
}));

const mockExtractYoutubeVideoId = jest.fn((url: string) =>
  url.includes('youtube.com') || url.includes('youtu.be') ? 'abc12345678' : null
);
const mockProbeYoutubeQualities = jest.fn(async () => ({
  title: 'Cool Video',
  qualities: [
    { quality: '720', label: '720p' },
    { quality: '1080', label: '1080p' },
  ],
}));

jest.mock('@/src/features/downloads/youtube', () => ({
  extractYoutubeVideoId: (...args: unknown[]) => mockExtractYoutubeVideoId(...(args as [string])),
  probeYoutubeQualities: (...args: unknown[]) => mockProbeYoutubeQualities(...args),
}));

describe('DownloadSheet', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadItems = [];
  });

  it('returns null when not visible', async () => {
    const { toJSON } = await render(
      <DownloadSheet
        visible={false}
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('resolves streams and starts download', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
        season={1}
        episode={2}
      />
    );
    expect(screen.getByText(t('downloadSheet.titleEpisode'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sheet-resolve'));
    await waitFor(() => expect(screen.getByText('Original')).toBeTruthy());
    await fireEvent.press(screen.getByText('Dub'));
    await fireEvent.press(screen.getByText('480p'));
    await fireEvent.press(screen.getByText('RU'));
    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty streams error', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve-empty'));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.emptyStreams'))).toBeTruthy()
    );
  });

  it('shows duplicate dialog for existing tracks', async () => {
    mockDownloadItems = [
      {
        id: 'd1',
        movieId: 'm1',
        audioLabel: 'Original',
        subtitleLabel: 'EN',
        status: 'completed',
        source: 'movie',
      },
    ];
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve'));
    await waitFor(() => expect(screen.getByText(t('common.download'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.alreadyTitle'))).toBeTruthy()
    );
    await fireEvent.press(screen.getByText(t('common.gotIt')));
  });

  it('closes via close button', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('icon-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('YoutubeDownloadSheet', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockExtractYoutubeVideoId.mockImplementation((url: string) =>
      url.includes('youtube.com') || url.includes('youtu.be') ? 'abc12345678' : null
    );
  });

  it('returns null when not visible', async () => {
    const { toJSON } = await render(
      <YoutubeDownloadSheet visible={false} onClose={onClose} />
    );
    expect(toJSON()).toBeNull();
  });

  it('probes url, selects quality, and starts download', async () => {
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    expect(screen.getByText(t('youtube.title'))).toBeTruthy();
    const input = screen.getByPlaceholderText(t('youtube.placeholder'));
    await fireEvent.changeText(input, 'https://www.youtube.com/watch?v=abc12345678');
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText('Cool Video')).toBeTruthy());
    await fireEvent.press(screen.getByText('1080p'));
    await fireEvent.press(screen.getByText(t('youtube.cta')));
    await waitFor(() =>
      expect(mockEnqueueYoutube).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=abc12345678',
        '1080'
      )
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('shows invalid url error', async () => {
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtube.com/watch?v=abc12345678'
    );
    mockExtractYoutubeVideoId.mockReturnValueOnce(null);
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText(t('youtube.invalidUrl'))).toBeTruthy());
  });

  it('goes back to url step and closes', async () => {
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText(t('common.back'))).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.back')));
    expect(screen.getByPlaceholderText(t('youtube.placeholder'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('icon-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
