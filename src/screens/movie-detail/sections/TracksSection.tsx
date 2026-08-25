import { usePathname } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { isResolvableEmbedUrl } from '@/src/data/catalog/embedStreams';
import type { HlsSource, StreamPayload } from '@/src/data/catalog/types';
import { StreamResolver } from '@/src/features/playback/StreamResolver';
import { t } from '@/src/shared/i18n';
import { colors, spacing } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type TracksSectionProps = {
  activePlayerUrl: string | undefined;
  stream: StreamPayload | null;
  streamLoading: boolean;
  streamError: string | null;
  displayAudioSources: HlsSource[];
  nativePlayer: boolean | undefined;
  fallbackPlayerUrl: string | undefined;
  onStreamResolved: (data: StreamPayload) => void;
  onStreamFailed: (message: string) => void;
  onAudioPress: (label: string) => void;
};

export function TracksSection({
  activePlayerUrl,
  stream,
  streamLoading,
  streamError,
  displayAudioSources,
  nativePlayer,
  fallbackPlayerUrl,
  onStreamResolved,
  onStreamFailed,
  onAudioPress,
}: TracksSectionProps) {
  const onMovieScreen = usePathname().includes('/movie');
  if (!activePlayerUrl) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('movie.audioSubs')}</Text>
      {streamLoading && !stream ? (
        <View style={styles.tracksLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.tracksHint}>{t('movie.loadingTracks')}</Text>
        </View>
      ) : null}
      {streamError && !stream ? (
        <Text style={styles.tracksHint}>{streamError}</Text>
      ) : null}
      {displayAudioSources.length ? (
        <>
          <Text style={styles.chipLabel}>{t('movie.audio')}</Text>
          <View style={styles.chips}>
            {displayAudioSources.map((source, index) => (
              <Pressable
                key={`${source.label}-${index}`}
                onPress={() => {
                  onAudioPress(source.label);
                }}
                style={[styles.chip, index === 0 && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, index === 0 && styles.chipTextActive]}
                  numberOfLines={2}
                >
                  {source.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {stream?.tracks?.length ? (
        <>
          <Text style={[styles.chipLabel, { marginTop: spacing.md }]}>
            {t('movie.subtitles')}
          </Text>
          <View style={styles.chips}>
            {stream.tracks.map((track, index) => (
              <View key={`${track.label}-${index}`} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={2}>
                  {track.label}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {onMovieScreen &&
      streamLoading &&
      !stream &&
      nativePlayer !== false &&
      !(fallbackPlayerUrl && isResolvableEmbedUrl(fallbackPlayerUrl)) ? (
        <View style={styles.hiddenResolver} pointerEvents="none">
          <StreamResolver
            key={activePlayerUrl}
            playerUrl={activePlayerUrl}
            onResolved={onStreamResolved}
            onError={onStreamFailed}
          />
        </View>
      ) : null}
    </View>
  );
}
