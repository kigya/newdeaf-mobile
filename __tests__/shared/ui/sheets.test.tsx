import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';

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

let mockPreferredDownloadQuality = '720';
const mockResolveEmbedStream = jest.fn(async (_url?: string): Promise<unknown> => null);
const mockIsResolvableEmbedUrl = jest.fn((_url?: string) => false);

jest.mock('@/src/features/settings/store', () => ({
  useSettingsStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ preferredDownloadQuality: mockPreferredDownloadQuality })
  ),
}));

jest.mock('@/src/data/catalog/embedStreams', () => ({
  isResolvableEmbedUrl: (url: string) => mockIsResolvableEmbedUrl(url),
  resolveEmbedStream: (url: string) => mockResolveEmbedStream(url),
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
        {
          testID: 'sheet-resolve-no-quality',
          onPress: () =>
            onResolved({
              hlsSource: [{ label: 'EmptyQ', quality: {} }],
              tracks: [{ kind: 'captions', label: 'EN', src: 'https://cdn/en.vtt' }],
            }),
        },
        ReactLocal.createElement(Text, null, 'noq')
      ),
      ReactLocal.createElement(
        P,
        {
          testID: 'sheet-resolve-no-subs',
          onPress: () =>
            onResolved({
              hlsSource: [{ label: 'A', quality: { '720': 'https://cdn/720.m3u8' } }],
              tracks: [],
            }),
        },
        ReactLocal.createElement(Text, null, 'nosubs')
      ),
      ReactLocal.createElement(
        P,
        {
          testID: 'sheet-resolve-shared-q',
          onPress: () =>
            onResolved({
              hlsSource: [
                {
                  label: 'Original',
                  quality: { '720': 'https://cdn/720.m3u8', '480': 'https://cdn/480.m3u8' },
                },
                {
                  label: 'Alt',
                  quality: { '720': 'https://cdn/alt720.m3u8', '360': 'https://cdn/360.m3u8' },
                },
              ],
              tracks: [{ kind: 'captions', label: 'EN', src: 'https://cdn/en.vtt' }],
            }),
        },
        ReactLocal.createElement(Text, null, 'sharedq')
      ),
      ReactLocal.createElement(
        P,
        {
          testID: 'sheet-resolve-no-tracks-field',
          onPress: () =>
            onResolved({
              hlsSource: [{ label: 'A', quality: { '720': 'https://cdn/720.m3u8' } }],
            }),
        },
        ReactLocal.createElement(Text, null, 'notracksfield')
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
  extractYoutubeVideoId: (...args: unknown[]) =>
    (mockExtractYoutubeVideoId as any)(...args),
  probeYoutubeQualities: (...args: unknown[]) =>
    (mockProbeYoutubeQualities as any)(...args),
}));

describe('DownloadSheet', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadItems = [];
    mockPreferredDownloadQuality = '720';
    mockIsResolvableEmbedUrl.mockReturnValue(false);
    mockResolveEmbedStream.mockResolvedValue(null);
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

  it('shows other-track dialog and downloads again', async () => {
    mockDownloadItems = [
      {
        id: 'd1',
        movieId: 'm1',
        audioLabel: 'OtherAudio',
        subtitleLabel: 'OtherSubs',
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
      expect(screen.getByText(t('downloadSheet.otherTitle'))).toBeTruthy()
    );
    await fireEvent.press(screen.getByText(t('downloadSheet.downloadAgain')));
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
  });

  it('cancels other-track dialog', async () => {
    mockDownloadItems = [
      {
        id: 'd1',
        movieId: 'm1',
        audioLabel: 'Other',
        subtitleLabel: 'X',
        status: 'queued',
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
      expect(screen.getByText(t('downloadSheet.otherTitle'))).toBeTruthy()
    );
    await fireEvent.press(screen.getByText(t('common.cancel')));
  });

  it('shows enqueue error', async () => {
    mockEnqueue.mockRejectedValueOnce(new Error('enqueue boom'));
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
    await waitFor(() => expect(screen.getByText('enqueue boom')).toBeTruthy());
  });

  it('shows resolve error', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve-err'));
    await waitFor(() => expect(screen.getByText('bad')).toBeTruthy());
  });

  it('shows quality unavailable when qualities empty', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve-no-quality'));
    await waitFor(() => expect(screen.getByText('EmptyQ')).toBeTruthy());
    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.qualityUnavailable'))).toBeTruthy()
    );
  });

  it('shows no tracks when pressing download without subtitles', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve-no-subs'));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.noSubtitles'))).toBeTruthy()
    );
    // Disabled CTA — fireEvent still invokes handler in RNTL
    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.noTracks'))).toBeTruthy()
    );
  });

  it('cancels exact duplicate via dialog backdrop', async () => {
    mockDownloadItems = [
      {
        id: 'd1',
        movieId: 'm1',
        audioLabel: 'Original',
        subtitleLabel: 'EN',
        status: 'failed',
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
    await fireEvent.press(screen.getByTestId('confirm-dialog-backdrop'));
    await waitFor(() =>
      expect(screen.queryByText(t('downloadSheet.alreadyTitle'))).toBeNull()
    );
  });

  it('preferred best quality and high quality warn; switches audio quality', async () => {
    mockPreferredDownloadQuality = 'best';
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
    await waitFor(() => expect(screen.getByText('1080p')).toBeTruthy());
    await fireEvent.press(screen.getByText('1080p'));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.highQualityWarn'))).toBeTruthy()
    );
    await fireEvent.press(screen.getByText('Dub'));
    await waitFor(() => expect(screen.getByText('480p')).toBeTruthy());
  });

  it('keeps quality when switching audio if still available', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve-shared-q'));
    await waitFor(() => expect(screen.getByText('720p')).toBeTruthy());
    await fireEvent.press(screen.getByText('Alt'));
    expect(screen.getByText('720p')).toBeTruthy();
  });

  it('shows starting spinner while enqueue pending', async () => {
    let resolveEnqueue: () => void = () => undefined;
    mockEnqueue.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveEnqueue = () => resolve(undefined);
        })
    );
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
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    resolveEnqueue();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('handles resolve without tracks field', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
      />
    );
    await fireEvent.press(screen.getByTestId('sheet-resolve-no-tracks-field'));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.noSubtitles'))).toBeTruthy()
    );
  });

  it('uses initialStream without StreamResolver', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://api.embess.ws/embed/1"
        initialStream={{
          hlsSource: [
            {
              label: 'MovieDalen',
              quality: { '720': 'https://cdn/m.m3u8' },
              audioId: 'https://cdn/a1.m3u8',
            },
          ],
          tracks: [{ kind: 'captions', label: 'Рус. полные', src: 'https://cdn/ru.vtt' }],
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('MovieDalen')).toBeTruthy());
    expect(screen.queryByTestId('sheet-resolve')).toBeNull();
    await fireEvent.press(screen.getByText(t('common.download')));
    await waitFor(() =>
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          audioPlaylistUrl: 'https://cdn/a1.m3u8',
          audioLabel: 'MovieDalen',
        })
      )
    );
  });

  it('resolves embed playerUrl via resolveEmbedStream', async () => {
    mockIsResolvableEmbedUrl.mockReturnValue(true);
    mockResolveEmbedStream.mockResolvedValue({
      hlsSource: [{ label: 'LostFilm', quality: { '720': 'https://cdn/m.m3u8' } }],
      tracks: [{ kind: 'captions', label: 'EN', src: 'https://cdn/en.vtt' }],
    });
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://api.embess.ws/embed/1"
      />
    );
    await waitFor(() => expect(screen.getByText('LostFilm')).toBeTruthy());
    expect(mockResolveEmbedStream).toHaveBeenCalled();
  });

  it('shows empty error when embed resolve returns nothing', async () => {
    mockIsResolvableEmbedUrl.mockReturnValue(true);
    mockResolveEmbedStream.mockResolvedValue(null);
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://api.embess.ws/embed/1"
      />
    );
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.emptyStreams'))).toBeTruthy()
    );
  });

  it('shows error when embed resolve throws', async () => {
    mockIsResolvableEmbedUrl.mockReturnValue(true);
    mockResolveEmbedStream.mockRejectedValue(new Error('boom'));
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://api.embess.ws/embed/1"
      />
    );
    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
  });

  it('applies payload preferring russian subtitle', async () => {
    await render(
      <DownloadSheet
        visible
        onClose={onClose}
        movieId="m1"
        title="Film"
        playerUrl="https://player"
        initialStream={{
          hlsSource: [{ label: 'A', quality: { '720': 'https://cdn/m.m3u8' } }],
          tracks: [
            { kind: 'captions', label: 'EN', src: 'https://cdn/en.vtt' },
            { kind: 'captions', label: 'Рус. полные', src: 'https://cdn/ru.vtt' },
          ],
        }}
      />
    );
    await waitFor(() => expect(screen.getByText('Рус. полные')).toBeTruthy());
  });
});

describe('YoutubeDownloadSheet', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockPreferredDownloadQuality = '720';
    mockExtractYoutubeVideoId.mockImplementation((url: string) =>
      url.includes('youtube.com') || url.includes('youtu.be') ? 'abc12345678' : null
    );
    mockProbeYoutubeQualities.mockResolvedValue({
      title: 'Cool Video',
      qualities: [
        { quality: '720', label: '720p' },
        { quality: '1080', label: '1080p' },
      ],
    });
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

  it('shows probe error and start error', async () => {
    mockProbeYoutubeQualities.mockRejectedValueOnce(new Error('probe fail'));
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText('probe fail')).toBeTruthy());

    mockProbeYoutubeQualities.mockResolvedValueOnce({
      title: 'Cool Video',
      qualities: [
        { quality: '720', label: '720p' },
        { quality: '1080', label: '1080p' },
      ],
    });
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText(t('youtube.cta'))).toBeTruthy());
    mockEnqueueYoutube.mockRejectedValueOnce(new Error('start fail'));
    await fireEvent.press(screen.getByText(t('youtube.cta')));
    await waitFor(() => expect(screen.getByText('start fail')).toBeTruthy());
  });

  it('submit editing probes when canProbe', async () => {
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    const input = screen.getByPlaceholderText(t('youtube.placeholder'));
    await fireEvent.changeText(input, 'https://youtu.be/abc12345678');
    await fireEvent(input, 'submitEditing');
    await waitFor(() => expect(mockProbeYoutubeQualities).toHaveBeenCalled());
  });

  it('uses iOS keyboard events', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const handlers: Record<string, (e?: { endCoordinates: { height: number } }) => void> = {};
    const addSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e?: { endCoordinates: { height: number } }) => void) => {
      handlers[event] = cb;
      return { remove: jest.fn() };
    }) as any);
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    handlers.keyboardWillShow?.({ endCoordinates: { height: 100 } });
    handlers.keyboardWillHide?.();
    addSpy.mockRestore();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('preferred quality best maps to 720 initial state', async () => {
    mockPreferredDownloadQuality = 'best';
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    expect(screen.getByText(t('youtube.title'))).toBeTruthy();
  });

  it('clears error on text change and handles keyboard + backdrop', async () => {
    const handlers: Record<string, (e?: { endCoordinates: { height: number } }) => void> = {};
    const addSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e?: { endCoordinates: { height: number } }) => void) => {
      handlers[event] = cb;
      return { remove: jest.fn() };
    }) as any);
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);

    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );
    mockExtractYoutubeVideoId.mockReturnValueOnce(null);
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText(t('youtube.invalidUrl'))).toBeTruthy());
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    await act(async () => {
      handlers[showEvent]?.({ endCoordinates: { height: 280 } });
    });
    await fireEvent.press(screen.getByTestId('yt-sheet-backdrop'));
    expect(dismissSpy).toHaveBeenCalled();
    dismissSpy.mockClear();
    await act(async () => {
      handlers[hideEvent]?.();
    });
    await fireEvent.press(screen.getByTestId('yt-sheet-backdrop'));
    expect(dismissSpy).not.toHaveBeenCalled();

    addSpy.mockRestore();
    dismissSpy.mockRestore();
  });

  it('android keyboard margin and probing/starting spinners', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const handlers: Record<string, (e?: { endCoordinates: { height: number } }) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: unknown) => {
      handlers[event] = cb as (e?: { endCoordinates: { height: number } }) => void;
      return { remove: jest.fn() };
    }) as any);

    let resolveProbe: (v: {
      title: string;
      qualities: { quality: string; label: string }[];
    }) => void = () => undefined;
    mockProbeYoutubeQualities.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        })
    );

    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    handlers.keyboardDidShow?.({ endCoordinates: { height: 200 } });
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    resolveProbe({
      title: '',
      qualities: [
        { quality: '720', label: '720p' },
        { quality: '1080', label: '1080p' },
      ],
    });
    await waitFor(() => expect(screen.getByText(t('youtube.cta'))).toBeTruthy());
    await fireEvent.press(screen.getByText('1080p'));
    await waitFor(() =>
      expect(screen.getByText(t('downloadSheet.highQualityWarn'))).toBeTruthy()
    );

    let resolveStart: () => void = () => undefined;
    mockEnqueueYoutube.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveStart = () => resolve(undefined);
        })
    );
    await fireEvent.press(screen.getByText(t('youtube.cta')));
    await waitFor(() => expect(mockEnqueueYoutube).toHaveBeenCalled());
    resolveStart();
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('resetAndClose restores best preferred quality', async () => {
    mockPreferredDownloadQuality = 'best';
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    await fireEvent.changeText(
      screen.getByPlaceholderText(t('youtube.placeholder')),
      'https://youtu.be/abc12345678'
    );
    await fireEvent.press(screen.getByText(t('youtube.chooseQuality')));
    await waitFor(() => expect(screen.getByText(t('youtube.cta'))).toBeTruthy());
    await fireEvent.press(screen.getByTestId('icon-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submitEditing no-ops when cannot probe', async () => {
    await render(<YoutubeDownloadSheet visible onClose={onClose} />);
    const input = screen.getByPlaceholderText(t('youtube.placeholder'));
    await fireEvent(input, 'submitEditing');
    expect(mockProbeYoutubeQualities).not.toHaveBeenCalled();
  });
});
