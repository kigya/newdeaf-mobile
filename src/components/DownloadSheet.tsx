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

import type { HlsSource, StreamPayload } from '@/src/api/types';
import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { pickSubtitleTrack } from '@/src/downloads/hls';
import { useDownloadsStore } from '@/src/downloads/store';
import type { DownloadRecord } from '@/src/downloads/types';
import { StreamResolver } from '@/src/player/StreamResolver';
import { colors, fonts, radius, spacing } from '@/src/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  movieId: string;
  title: string;
  posterUrl?: string;
  playerUrl: string;
};

function qualityOptions(source: HlsSource | undefined): string[] {
  if (!source) return [];
  return Object.keys(source.quality)
    .map(Number)
    .sort((a, b) => b - a)
    .map(String);
}

function norm(label: string): string {
  return label.trim().toLowerCase();
}

function findExistingSameTracks(
  items: DownloadRecord[],
  movieId: string,
  audioLabel: string,
  subtitleLabel: string
): DownloadRecord | undefined {
  const a = norm(audioLabel);
  const s = norm(subtitleLabel);
  return items.find(
    (i) =>
      i.source !== 'youtube' &&
      i.movieId === movieId &&
      norm(i.audioLabel) === a &&
      norm(i.subtitleLabel) === s &&
      (i.status === 'completed' ||
        i.status === 'queued' ||
        i.status === 'downloading' ||
        i.status === 'resolving' ||
        i.status === 'failed' ||
        i.status === 'paused')
  );
}

function findAnyExistingMovie(
  items: DownloadRecord[],
  movieId: string
): DownloadRecord | undefined {
  return items.find(
    (i) =>
      i.source !== 'youtube' &&
      i.movieId === movieId &&
      (i.status === 'completed' ||
        i.status === 'queued' ||
        i.status === 'downloading' ||
        i.status === 'resolving' ||
        i.status === 'failed' ||
        i.status === 'paused')
  );
}

/** In-screen sheet — no RN Modal (avoids Android back/overlay bugs with WebView). */
export function DownloadSheet({ visible, onClose, movieId, title, posterUrl, playerUrl }: Props) {
  const insets = useSafeAreaInsets();
  const enqueue = useDownloadsStore((s) => s.enqueue);
  const items = useDownloadsStore((s) => s.items);
  const [payload, setPayload] = useState<StreamPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioIndex, setAudioIndex] = useState(0);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const [quality, setQuality] = useState('720');
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
      setError('Потоки получены пустыми. Попробуйте ещё раз.');
      return;
    }
    setPayload(data);
    setError(null);
    const first = data.hlsSource[0];
    if (first) {
      const qs = qualityOptions(first);
      setQuality(qs.includes('720') ? '720' : qs[0] ?? '720');
    }
    const preferred = pickSubtitleTrack(data.tracks ?? []);
    if (preferred) {
      const idx = data.tracks.findIndex(
        (t) => t.src === preferred.src && t.label === preferred.label
      );
      setSubtitleIndex(idx >= 0 ? idx : 0);
    }
  }, []);

  const doEnqueue = async () => {
    if (!selected || !selectedSubtitle) {
      setError('Нет доступной озвучки или субтитров для скачивания');
      return;
    }
    const hlsUrl = selected.quality[quality] ?? selected.quality[Object.keys(selected.quality)[0]];
    if (!hlsUrl) {
      setError('Выбранное качество недоступно');
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
        hlsUrl,
        subtitleUrl: selectedSubtitle.src,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать загрузку');
    } finally {
      setStarting(false);
    }
  };

  const startDownload = () => {
    if (!selected || !selectedSubtitle) {
      setError('Нет доступной озвучки или субтитров для скачивания');
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

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Скачать фильм</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.subtitle} numberOfLines={2}>
          {title}
        </Text>

        {!payload && !error ? (
          <StreamResolver
            playerUrl={playerUrl}
            onResolved={onResolved}
            onError={(message) => setError(message)}
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {payload ? (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.section}>Озвучка</Text>
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
                        qs.includes(quality) ? quality : qs.includes('720') ? '720' : qs[0]
                      );
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                      numberOfLines={2}
                    >
                      {source.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.section}>Качество</Text>
            <View style={styles.chips}>
              {qualities.map((q) => {
                const active = q === quality;
                return (
                  <Pressable
                    key={q}
                    onPress={() => setQuality(q)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{q}p</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.section}>Субтитры</Text>
            {tracks.length ? (
              <View style={styles.chips}>
                {tracks.map((track, index) => {
                  const active = index === subtitleIndex;
                  return (
                    <Pressable
                      key={`${track.label}-${index}`}
                      onPress={() => setSubtitleIndex(index)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
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
                <Text style={styles.subText}>Субтитры не найдены</Text>
              </View>
            )}

            {Number(quality) >= 1080 ? (
              <Text style={styles.warn}>
                Высокое качество займёт много места. Рекомендуем 720p.
              </Text>
            ) : null}

            <Pressable
              style={[styles.cta, starting && styles.ctaDisabled]}
              disabled={starting || !selectedSubtitle}
              onPress={startDownload}
            >
              {starting ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color={colors.black} />
                  <Text style={styles.ctaText}>Скачать</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        ) : null}
      </View>

      <ConfirmDialog
        visible={dupDialog === 'exact'}
        title="Уже скачано"
        message={
          dupExisting
            ? dupExisting.status === 'failed'
              ? `«${title}» уже есть с озвучкой «${dupExisting.audioLabel}» и субтитрами «${dupExisting.subtitleLabel}» (ошибка загрузки). Удалите запись или нажмите «Снова» в Загрузках.`
              : dupExisting.status === 'completed'
                ? `«${title}» уже есть с озвучкой «${dupExisting.audioLabel}» и субтитрами «${dupExisting.subtitleLabel}». Повторная загрузка не нужна.`
                : `«${title}» уже качается или в очереди с озвучкой «${dupExisting.audioLabel}» и субтитрами «${dupExisting.subtitleLabel}».`
            : undefined
        }
        confirmLabel="Понятно"
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
        title="Фильм уже скачан"
        message={
          dupExisting
            ? `Уже есть копия с озвучкой «${dupExisting.audioLabel}» и субтитрами «${dupExisting.subtitleLabel}». Скачать ещё с выбранными дорожками?`
            : undefined
        }
        confirmLabel="Скачать ещё"
        cancelLabel="Отмена"
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
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.accent,
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
  cta: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginVertical: spacing.md,
  },
});
