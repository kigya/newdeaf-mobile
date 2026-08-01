import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';
import { useWatchProgressStore } from '@/src/watch-progress/store';
import {
  formatWatchTime,
  isResumable,
  type WatchProgressRecord,
} from '@/src/watch-progress/types';

const POSTER_W = 110;
const POSTER_H = Math.round(POSTER_W * 1.5);

function ContinueCard({
  item,
  onLongPress,
}: {
  item: WatchProgressRecord;
  onLongPress: (item: WatchProgressRecord) => void;
}) {
  const router = useRouter();
  const ratio =
    item.durationSec && item.durationSec > 0
      ? Math.min(1, Math.max(0, item.positionSec / item.durationSec))
      : 0;

  const onPress = () => {
    if (item.source === 'offline' && item.downloadId) {
      router.push({
        pathname: '/offline/[downloadId]',
        params: { downloadId: item.downloadId },
      });
      return;
    }
    router.push({
      pathname: '/movie/[id]',
      params: {
        id: item.movieId,
        href: item.href,
        title: item.title,
        posterUrl: item.posterUrl,
      },
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      onLongPress={() => onLongPress(item)}
      delayLongPress={450}
    >
      <View style={styles.posterWrap}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, styles.posterFallback]} />
        )}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {formatWatchTime(item.positionSec)}
        {item.season != null && item.episode != null
          ? ` · S${item.season}E${item.episode}`
          : ''}
      </Text>
    </Pressable>
  );
}

type Props = {
  onRequestRemove: (item: WatchProgressRecord) => void;
};

export function ContinueWatchingRail({ onRequestRemove }: Props) {
  const items = useWatchProgressStore((s) => s.items);
  const resumable = items.filter(isResumable).slice(0, 20);

  if (!resumable.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('catalog.continueWatching')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {resumable.map((item) => (
          <ContinueCard key={item.id} item={item} onLongPress={onRequestRemove} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 17,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    width: POSTER_W,
  },
  pressed: {
    opacity: 0.88,
  },
  posterWrap: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    backgroundColor: colors.bgElevated,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  cardTitle: {
    marginTop: spacing.xs,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  cardMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
});
