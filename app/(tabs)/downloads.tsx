import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { ConfirmDialog } from '@/src/components/ConfirmDialog';
import { EmptyState } from '@/src/components/EmptyState';
import { Screen } from '@/src/components/Screen';
import { YoutubeDownloadSheet } from '@/src/components/YoutubeDownloadSheet';
import { useDownloadsStore } from '@/src/downloads/store';
import type { DownloadRecord } from '@/src/downloads/types';
import { StreamResolver } from '@/src/player/StreamResolver';
import { t } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';

function statusLabel(item: DownloadRecord): string {
  switch (item.status) {
    case 'queued':
      return t('downloads.queued');
    case 'resolving':
      return t('downloads.resolving');
    case 'downloading':
      return t('downloads.downloading', { pct: Math.round(item.progress * 100) });
    case 'completed':
      return t('downloads.completed');
    case 'failed':
      return item.error ?? t('downloads.failed');
    case 'paused':
      return t('downloads.paused');
    default: {
      const _exhaustive: never = item.status;
      return String(_exhaustive);
    }
  }
}

function DownloadRow({
  item,
  onPlay,
  onRetry,
  onDelete,
}: {
  item: DownloadRecord;
  onPlay: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const isYoutube = item.source === 'youtube';
  const isDownloading = item.status === 'downloading';
  const hasEpisode = item.season != null && item.episode != null;

  return (
    <Animated.View
      exiting={FadeOut.duration(200)}
      layout={isDownloading ? undefined : LinearTransition}
    >
      <Pressable
        style={[styles.card, isYoutube && styles.cardYoutube]}
        onPress={() => {
          if (item.status === 'completed' && item.playlistPath) onPlay();
        }}
        onLongPress={onDelete}
      >
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.poster} contentFit="cover" />
        ) : (
          <View style={[styles.poster, styles.posterFallback]}>
            <Ionicons
              name={isYoutube ? 'logo-youtube' : 'film-outline'}
              size={22}
              color={colors.accent}
            />
          </View>
        )}
        <View style={styles.meta}>
          {isYoutube ? (
            <View style={styles.badge}>
              <Ionicons name="logo-youtube" size={12} color={colors.accent} />
              <Text style={styles.badgeText}>{t('downloads.ytBadge')}</Text>
            </View>
          ) : hasEpisode ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {t('downloads.episodeBadge', {
                  season: item.season,
                  episode: item.episode,
                })}
              </Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {isYoutube ? (
            <Text style={styles.line} numberOfLines={1}>
              YouTube · {item.quality}p
            </Text>
          ) : (
            <>
              <Text style={styles.line} numberOfLines={1}>
                {item.quality}p · {item.audioLabel}
              </Text>
              <Text style={styles.line} numberOfLines={1}>
                {t('downloads.subtitlesLine', { label: item.subtitleLabel })}
              </Text>
            </>
          )}
          <Text
            style={[
              styles.status,
              item.status === 'failed' && { color: colors.danger },
              item.status === 'completed' && { color: colors.success },
            ]}
          >
            {statusLabel(item)}
          </Text>
          {item.status === 'downloading' ? (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${Math.round(item.progress * 100)}%` }]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {item.status === 'failed' ? (
            <Pressable hitSlop={10} onPress={onRetry}>
              <Ionicons name="refresh" size={22} color={colors.accent} />
            </Pressable>
          ) : null}
          {item.status === 'completed' ? (
            <Ionicons name="play-circle" size={28} color={colors.accent} />
          ) : null}
          <Pressable hitSlop={10} onPress={onDelete}>
            <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function DownloadsScreen() {
  const router = useRouter();
  const items = useDownloadsStore((s) => s.items);
  const hydrated = useDownloadsStore((s) => s.hydrated);
  const hydrate = useDownloadsStore((s) => s.hydrate);
  const remove = useDownloadsStore((s) => s.remove);
  const retry = useDownloadsStore((s) => s.retry);
  const completeMovieRetry = useDownloadsStore((s) => s.completeMovieRetry);
  const failMovieResolve = useDownloadsStore((s) => s.failMovieResolve);
  const [pendingDelete, setPendingDelete] = useState<DownloadRecord | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [youtubeOpen, setYoutubeOpen] = useState(false);

  const resolvingMovie = items.find(
    (i) => i.status === 'resolving' && i.source !== 'youtube' && !!i.playerUrl
  );
  // Keep the warm player iframe mounted while a movie download runs — CDN fetch
  // must use that WebView session (OkHttp is fingerprint-blocked).
  const mediaFetchMovie = items.find(
    (i) =>
      i.source !== 'youtube' &&
      !!i.playerUrl &&
      (i.status === 'resolving' || i.status === 'queued' || i.status === 'downloading')
  );

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const confirmRemove = () => {
    const id = pendingDelete?.id;
    setPendingDelete(null);
    if (id) void remove(id);
  };

  return (
    <Screen title={t('downloads.title')} subtitle={t('downloads.subtitle')}>
      <View style={styles.body}>
        <Pressable style={styles.ytButton} onPress={() => setYoutubeOpen(true)}>
          <Ionicons name="logo-youtube" size={26} color={colors.black} />
          <View style={styles.ytButtonText}>
            <Text style={styles.ytButtonTitle}>{t('downloads.ytTitle')}</Text>
            <Text style={styles.ytButtonSub}>{t('downloads.ytSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.black} />
        </Pressable>

        {mediaFetchMovie?.playerUrl ? (
          <View style={styles.hiddenMediaFetch} pointerEvents="none" collapsable={false}>
            <StreamResolver
              key={`${mediaFetchMovie.id}:${mediaFetchMovie.playerUrl}`}
              playerUrl={mediaFetchMovie.playerUrl}
              mediaFetch
              onResolved={(payload) => {
                if (resolvingMovie && mediaFetchMovie.id === resolvingMovie.id) {
                  void completeMovieRetry(resolvingMovie.id, payload).catch((e) =>
                    setRetryError(e instanceof Error ? e.message : t('downloads.retryFailed'))
                  );
                }
              }}
              onError={(message) => {
                if (resolvingMovie && mediaFetchMovie.id === resolvingMovie.id) {
                  void failMovieResolve(resolvingMovie.id, message);
                  setRetryError(message);
                }
              }}
            />
          </View>
        ) : null}
        {resolvingMovie ? (
          <View style={styles.resolvingBanner}>
            <Text style={styles.resolvingText}>{t('player.resolving')}</Text>
          </View>
        ) : null}

        {!items.length ? (
          <EmptyState title={t('downloads.emptyTitle')} subtitle={t('downloads.emptySubtitle')} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <DownloadRow
                item={item}
                onPlay={() =>
                  router.push({
                    pathname: '/offline/[downloadId]',
                    params: { downloadId: item.id },
                  })
                }
                onRetry={() => {
                  void retry(item.id).catch((e) =>
                    setRetryError(e instanceof Error ? e.message : t('downloads.retryFailed'))
                  );
                }}
                onDelete={() => setPendingDelete(item)}
              />
            )}
          />
        )}
      </View>

      <YoutubeDownloadSheet visible={youtubeOpen} onClose={() => setYoutubeOpen(false)} />

      <ConfirmDialog
        visible={!!pendingDelete}
        title={t('downloads.deleteTitle')}
        message={
          pendingDelete
            ? t('downloads.deleteMessage', { title: pendingDelete.title })
            : undefined
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        visible={!!retryError}
        title={t('downloads.retryFailedTitle')}
        message={retryError ?? undefined}
        confirmLabel={t('common.gotIt')}
        confirmOnly
        onConfirm={() => setRetryError(null)}
        onCancel={() => setRetryError(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  ytButton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ytButtonText: {
    flex: 1,
    gap: 2,
  },
  ytButtonTitle: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  ytButtonSub: {
    color: 'rgba(0,0,0,0.65)',
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  cardYoutube: {
    borderColor: colors.accentSoft,
  },
  poster: {
    width: 64,
    height: 92,
    borderRadius: radius.sm,
    backgroundColor: colors.bgMuted,
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 2,
  },
  badgeText: {
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  line: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  status: {
    marginTop: 4,
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  progressTrack: {
    marginTop: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  actions: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  hiddenMediaFetch: {
    position: 'absolute',
    width: 320,
    height: 180,
    opacity: 0.02,
    left: 0,
    top: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  resolvingBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  resolvingText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
});
