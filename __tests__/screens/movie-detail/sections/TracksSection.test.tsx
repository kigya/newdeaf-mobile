import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { usePathname } from 'expo-router';

import { TracksSection } from '@/src/screens/movie-detail/sections/TracksSection';
import { t } from '@/src/shared/i18n';

const mockResolved = jest.fn();
const mockFailed = jest.fn();

jest.mock('@/src/features/playback/StreamResolver', () => ({
  StreamResolver: () => {
    const ReactLocal = require('react');
    const { Text } = require('react-native');
    return ReactLocal.createElement(Text, { testID: 'hidden-resolver' }, 'resolver');
  },
}));

describe('TracksSection', () => {
  afterEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/movie/1');
  });
  it('returns null without a player url', async () => {
    const view = await render(
      <TracksSection
        activePlayerUrl={undefined}
        stream={null}
        streamLoading={false}
        streamError={null}
        displayAudioSources={[]}
        nativePlayer
        fallbackPlayerUrl={undefined}
        onStreamResolved={mockResolved}
        onStreamFailed={mockFailed}
        onAudioPress={jest.fn()}
      />
    );
    expect(view.toJSON()).toBeNull();
  });

  it('unmounts the hidden resolver off the movie route and handles audio press', async () => {
    const onAudioPress = jest.fn();
    (usePathname as jest.Mock).mockReturnValue('/settings');
    await render(
      <TracksSection
        activePlayerUrl="https://player"
        stream={null}
        streamLoading
        streamError="boom"
        displayAudioSources={[{ label: 'Eng.Original', quality: { '720': 'https://cdn/m.m3u8' } }]}
        nativePlayer
        fallbackPlayerUrl={undefined}
        onStreamResolved={mockResolved}
        onStreamFailed={mockFailed}
        onAudioPress={onAudioPress}
      />
    );
    expect(screen.queryByTestId('hidden-resolver')).toBeNull();
    expect(screen.getByText('boom')).toBeTruthy();
    await fireEvent.press(screen.getByText('Eng.Original'));
    expect(onAudioPress).toHaveBeenCalledWith('Eng.Original');

    (usePathname as jest.Mock).mockReturnValue('/movie/1');
    await render(
      <TracksSection
        activePlayerUrl="https://player"
        stream={{
          hlsSource: [],
          tracks: [{ kind: 'captions', label: 'RU', src: 'https://cdn/ru.vtt' }],
        }}
        streamLoading={false}
        streamError={null}
        displayAudioSources={[]}
        nativePlayer
        fallbackPlayerUrl={undefined}
        onStreamResolved={mockResolved}
        onStreamFailed={mockFailed}
        onAudioPress={onAudioPress}
      />
    );
    expect(screen.getByText(t('movie.subtitles'))).toBeTruthy();
    expect(screen.getByText('RU')).toBeTruthy();
  });

  it('mounts the hidden resolver on the movie route while tracks load', async () => {
    (usePathname as jest.Mock).mockReturnValue('/movie/42');
    await render(
      <TracksSection
        activePlayerUrl="https://player"
        stream={null}
        streamLoading
        streamError={null}
        displayAudioSources={[]}
        nativePlayer
        fallbackPlayerUrl={undefined}
        onStreamResolved={mockResolved}
        onStreamFailed={mockFailed}
        onAudioPress={jest.fn()}
      />
    );
    expect(screen.getByTestId('hidden-resolver')).toBeTruthy();
    expect(screen.getByText(t('movie.loadingTracks'))).toBeTruthy();
  });
});
