import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StreamPayload } from '@/src/data/catalog/types';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { sheetStyles } from '@/src/shared/ui/sheetStyles';
import { pickPrimaryMediaUrl, pickSubtitleTrack } from '@/src/features/downloads/hls';
import { findAnyExistingMovie, findExistingSameTracks } from '@/src/features/downloads/match';
import { useDownloadsStore } from '@/src/features/downloads/store';
import type { DownloadRecord } from '@/src/features/downloads/types';
import { qualityOptions } from '@/src/features/playback/streamPick';
import { StreamResolver } from '@/src/features/playback/StreamResolver';
import { t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { pickPreferredQuality } from '@/src/features/settings/pickPreferredQuality';
import { useSettingsStore } from '@/src/features/settings/store';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  movieId: string;
  title: string;
  posterUrl?: string;
  playerUrl: string;
  season?: number;
  episode?: number;
};

/** In-screen sheet — no RN Modal (avoids Android back/overlay bugs with WebView). */
export function DownloadSheet({
  visible,
  onClose,
  movieId,
  title,
  posterUrl,
  playerUrl,
  season,
  episode,
}: Props) {
  const insets = useSafeAreaInsets();
  const enqueue = useDownloadsStore((s) => s.enqueue);
  const items = useDownloadsStore((s) => s.items);
  const preferredDownloadQuality = useSettingsStore((s) => s.preferredDownloadQuality);
  const [payload, setPayload] = useState<StreamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioIndex, setAudioIndex] = useState(0);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [quality, setQuality] = useState<string>(() =>
    preferredDownloadQuality === 'best' ? '720' : preferredDownloadQuality
  );
  const [starting, setStarting] = useState(false);
  const [dupDialog, setDupDialog] = useState<'exact' | 'other' | null>(null);
  const [dupExisting, setDupExisting] = useState<DownloadRecord | null>(null);

  const sources = payload?.hlsSource ?? [];
  const tracks = payload?.tracks ?? [];
  const selected = sources[audioIndex];
  const selectedSubtitle = tracks[subtitleIndex];
  const qualities = useMemo(() => qualityOptions(selected), [selected]);

  const onResolved = useCallback((data: StreamPayload) => {
    if (!data?.hlsSource?.length) {
      setError(t('downloadSheet.emptyStreams'));
      return;
    }
    setPayload(data);
    setError(null);
    const first = data.hlsSource[0];
    if (first) {
      const qs = qualityOptions(first);
      setQuality(pickPreferredQuality(qs, preferredDownloadQuality));
    }
    const preferred = pickSubtitleTrack(data.tracks ?? []);
    if (preferred) {
      const idx = data.tracks.findIndex(
        (tr) => tr.src === preferred.src && tr.label === preferred.label
      );
      setSubtitleIndex(idx >= 0 ? idx : 0);
    }
  }, [preferredDownloadQuality]);

  const doEnqueue = async () => {
    if (!selected || !selectedSubtitle) {
      setError(t('downloadSheet.noTracks'));
      return;
    }
    const hlsUrl = selected.quality[quality] ?? selected.quality[Object.keys(selected.quality)[0]];
    if (!hlsUrl) {
      setError(t('downloadSheet.qualityUnavailable'));
      return;
    }
    setStarting(true);
    try {
      await enqueue({
        movieId,
        title,
        posterUrl,
        playerUrl,
        audioLabel: selected.label,
        quality,
        subtitleLabel: selectedSubtitle.label,
        hlsUrl: pickPrimaryMediaUrl(hlsUrl),
        subtitleUrl: selectedSubtitle.src,
        season,
        episode,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e, t('downloadSheet.startFailed')));
    } finally {
      setStarting(false);
    }
  };

  const startDownload = () => {
    if (!selected || !selectedSubtitle) {
      setError(t('downloadSheet.noTracks'));
      return;
    }
    const exact = findExistingSameTracks(items, movieId, selected.label, selectedSubtitle.label);
    if (exact) {
      setDupExisting(exact);
      setDupDialog('exact');
      return;
    }
    const other = findAnyExistingMovie(items, movieId);
    if (other) {
      setDupExisting(other);
      setDupDialog('other');
      return;
    }
    void doEnqueue();
  };

  if (!visible) return null;

  const sheetTitle =
    season != null && episode != null ? t('downloadSheet.titleEpisode') : t('downloadSheet.title');

  return (
    <View style={sheetStyles.root} pointerEvents="box-none">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={sheetStyles.handle} />
        <View style={sheetStyles.header}>
          <Text style={styles.title}>{sheetTitle}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.subtitle} numberOfLines={2}>
          {title}
        </Text>

        {!error ? (
          <View style={payload ? styles.hiddenPlayer : undefined}>
            <StreamResolver
              key={playerUrl}
              playerUrl={playerUrl}
              mediaFetch
              onResolved={onResolved}
              onError={(message) => setError(message)}
            />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {payload ? (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.section}>{t('downloadSheet.audio')}</Text>
            <View style={styles.chips}>
              {sources.map((source, index) => {
                const active = index === audioIndex;
                return (
                  <Pressable
                    key={`${source.label}-${index}`}
                    onPress={() => {
                      setAudioIndex(index);
                      const qs = qualityOptions(source);
                      setQuality(
                        qs.includes(quality)
                          ? quality
                          : pickPreferredQuality(qs, preferredDownloadQuality)
                      );
                    }}
                    style={[styles.chip, active && sheetStyles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && sheetStyles.chipTextActive]}
                      numberOfLines={2}
                    >
                      {source.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.section}>{t('downloadSheet.quality')}</Text>
            <View style={styles.chips}>
              {qualities.map((q) => {
                const active = q === quality;
                return (
                  <Pressable
                    key={q}
                    onPress={() => setQuality(q)}
                    style={[styles.chip, active && sheetStyles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && sheetStyles.chipTextActive]}>
                      {q}p
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.section}>{t('downloadSheet.subtitles')}</Text>
            {tracks.length ? (
              <View style={styles.chips}>
                {tracks.map((track, index) => {
                  const active = index === subtitleIndex;
                  return (
                    <Pressable
                      key={`${track.label}-${index}`}
                      onPress={() => setSubtitleIndex(index)}
                      style={[styles.chip, active && sheetStyles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, active && sheetStyles.chipTextActive]}
                        numberOfLines={2}
                      >
                        {track.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.subInfo}>
                <Ionicons name="text" size={18} color={colors.danger} />
                <Text style={styles.subText}>{t('downloadSheet.noSubtitles')}</Text>
              </View>
            )}

            {Number(quality) >= 1080 ? (
              <Text style={styles.warn}>{t('downloadSheet.highQualityWarn')}</Text>
            ) : null}

            <Pressable
              style={[sheetStyles.cta, starting && sheetStyles.ctaDisabled]}
              disabled={starting || !selectedSubtitle}
              onPress={startDownload}
            >
              {starting ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color={colors.black} />
                  <Text style={sheetStyles.ctaText}>{t('common.download')}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        ) : null}
      </View>

      <ConfirmDialog
        visible={dupDialog === 'exact'}
        title={t('downloadSheet.alreadyTitle')}
        message={
          dupExisting
            ? dupExisting.status === 'failed'
              ? t('downloadSheet.alreadyFailed', {
                  title,
                  audio: dupExisting.audioLabel,
                  subs: dupExisting.subtitleLabel,
                })
              : dupExisting.status === 'completed'
                ? t('downloadSheet.alreadyDone', {
                    title,
                    audio: dupExisting.audioLabel,
                    subs: dupExisting.subtitleLabel,
                  })
                : t('downloadSheet.alreadyQueued', {
                    title,
                    audio: dupExisting.audioLabel,
                    subs: dupExisting.subtitleLabel,
                  })
            : undefined
        }
        confirmLabel={t('common.gotIt')}
        confirmOnly
        onConfirm={() => {
          setDupDialog(null);
          setDupExisting(null);
        }}
        onCancel={() => {
          setDupDialog(null);
          setDupExisting(null);
        }}
      />

      <ConfirmDialog
        visible={dupDialog === 'other'}
        title={t('downloadSheet.otherTitle')}
        message={
          dupExisting
            ? t('downloadSheet.otherMessage', {
                audio: dupExisting.audioLabel,
                subs: dupExisting.subtitleLabel,
              })
            : undefined
        }
        confirmLabel={t('downloadSheet.downloadAgain')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setDupDialog(null);
          setDupExisting(null);
          void doEnqueue();
        }}
        onCancel={() => {
          setDupDialog(null);
          setDupExisting(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 20,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  scroll: {
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  subInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  subText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  warn: {
    marginTop: spacing.md,
    color: colors.accent,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginVertical: spacing.md,
  },
  hiddenPlayer: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
});
