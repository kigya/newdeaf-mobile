import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { KinopoiskRelatedMovie } from '@/src/data/catalog/kinopoisk';
import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { DownloadSheet } from '@/src/shared/ui/DownloadSheet';
import { t } from '@/src/shared/i18n';
import { colors, spacing } from '@/src/shared/theme';
import { resumeDialogMessage } from '@/src/features/watch-progress/format';
import { CastSection } from '@/src/screens/movie-detail/sections/CastSection';
import { FactsSection } from '@/src/screens/movie-detail/sections/FactsSection';
import { HeroSection } from '@/src/screens/movie-detail/sections/HeroSection';
import { MetaSection } from '@/src/screens/movie-detail/sections/MetaSection';
import { OfflineCopiesSection } from '@/src/screens/movie-detail/sections/OfflineCopiesSection';
import { RelatedRails } from '@/src/screens/movie-detail/sections/RelatedRails';
import { SeasonPicker } from '@/src/screens/movie-detail/sections/SeasonPicker';
import { StickyActions } from '@/src/screens/movie-detail/sections/StickyActions';
import { TracksSection } from '@/src/screens/movie-detail/sections/TracksSection';
import { TrailerSection } from '@/src/screens/movie-detail/sections/TrailerSection';
import { styles } from '@/src/screens/movie-detail/styles';
import { useMovieDetailData } from '@/src/screens/movie-detail/useMovieDetailData';
import { ListPickerSheet } from '@/src/shared/ui/ListPickerSheet';
import { EncyclopediaMeta, ReviewsSection } from '@/src/screens/movie-detail/sections/EncyclopediaSection';
import { useMovieDetailExtras } from '@/src/screens/movie-detail/useMovieDetailExtras';

export default function MovieDetailScreen() {
  const insets = useSafeAreaInsets();
  const d = useMovieDetailData();
  const { kpExtras, tmdbExtras } = useMovieDetailExtras(d.movie, d.kp?.kinopoiskId);
  const [listOpen, setListOpen] = useState(false);

  const openRelatedMovie = (item: KinopoiskRelatedMovie) => {
    d.router.push({
      pathname: '/movie/[id]',
      params: {
        id: item.id,
        href: item.href,
        title: item.title,
        posterUrl: item.posterUrl ?? '',
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: d.movie?.title ?? d.paramTitle ?? t('common.movie'),
          headerRight: () => (
            <Pressable
              onPress={d.onToggleFavorite}
              disabled={!d.id}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                d.isFavorite ? t('movie.removeFavorite') : t('movie.addFavorite')
              }
              style={({ pressed }) => [{ opacity: pressed || d.favoriteBusy ? 0.6 : 1, marginRight: 4 }]}
            >
              <Ionicons
                name={d.isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={d.isFavorite ? colors.accent : colors.text}
              />
            </Pressable>
          ),
        }}
      />
      {d.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : d.error || !d.movie ? (
        <View style={styles.center}>
          <Text style={styles.error}>{d.error || t('movie.notFound')}</Text>
        </View>
      ) : (
        <View style={styles.root}>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
            <HeroSection movie={d.movie} isSerial={d.isSerial} kp={d.kp} />
            <MetaSection kpLoading={d.kpLoading} kp={d.kp} />
            <SeasonPicker
              isSerial={d.isSerial}
              fileList={d.fileList}
              seasons={d.seasons}
              episodes={d.episodes}
              season={d.season}
              episode={d.episode}
              setSeason={d.setSeason}
              setEpisode={d.setEpisode}
            />
            <MetaSection description={d.movie.description} />
            <CastSection kp={d.kp} actors={d.movie.actors} />
            <FactsSection facts={d.kp?.facts} />
            <RelatedRails
              similar={d.kp?.similar}
              related={d.kp?.related}
              sequels={kpExtras?.sequels}
              onOpenMovie={openRelatedMovie}
            />
            <EncyclopediaMeta
              extras={kpExtras}
              tmdb={tmdbExtras}
              siteSeasonCount={d.isSerial ? d.seasons.length : undefined}
            />
            <ReviewsSection extras={kpExtras} />
            <TracksSection
              activePlayerUrl={d.activePlayerUrl}
              stream={d.stream}
              streamLoading={d.streamLoading}
              streamError={d.streamError}
              displayAudioSources={d.displayAudioSources}
              nativePlayer={d.movie.nativePlayer}
              fallbackPlayerUrl={d.movie.fallbackPlayerUrl}
              onStreamResolved={d.onStreamResolved}
              onStreamFailed={d.onStreamFailed}
              onAudioPress={(label) => {
                d.setDownloadAudioLabel(label);
                d.setDownloadOpen(true);
              }}
            />
            <TrailerSection
              movie={d.movie}
              extraYoutubeId={kpExtras?.youtubeVideos[0]?.youtubeId ?? tmdbExtras?.videos[0]?.key}
            />
            {!d.movie.playerUrl ? (
              <Text style={[styles.error, { paddingHorizontal: spacing.lg }]}>
                {t('movie.noPlayer')}
              </Text>
            ) : null}
            <OfflineCopiesSection
              copies={d.offlineCopies}
              onWatchOffline={(downloadId) =>
                d.router.push({
                  pathname: '/offline/[downloadId]',
                  params: { downloadId },
                })
              }
            />
          </ScrollView>

          <StickyActions
            insetsBottom={insets.bottom}
            downloadBlocked={d.downloadBlocked}
            streamLoading={d.streamLoading}
            activePlayerUrl={d.activePlayerUrl}
            onWatchPress={() => void d.onWatchPress()}
            onDownloadPress={() => {
              if (d.downloadBlocked) return;
              d.setDownloadAudioLabel(undefined);
              d.setDownloadOpen(true);
            }}
            onAddToList={() => setListOpen(true)}
          />

          {d.downloadOpen && d.activePlayerUrl ? (
            <DownloadSheet
              visible={d.downloadOpen}
              onClose={() => d.setDownloadOpen(false)}
              movieId={
                d.isSerial ? `${d.movie.id}_s${d.season}_e${d.episode}` : d.movie.id
              }
              title={d.displayTitle}
              posterUrl={d.movie.posterUrl}
              playerUrl={d.embedDownloadUrl ?? d.activePlayerUrl}
              initialStream={d.stream}
              initialAudioLabel={d.downloadAudioLabel}
              season={d.isSerial ? d.season : undefined}
              episode={d.isSerial ? d.episode : undefined}
            />
          ) : null}

          <ConfirmDialog
            visible={!!d.resumePrompt}
            title={t('resume.title')}
            message={d.resumePrompt ? resumeDialogMessage(d.resumePrompt) : undefined}
            confirmLabel={t('resume.continue')}
            cancelLabel={t('resume.startOver')}
            onConfirm={() => {
              const progress = d.resumePrompt;
              d.setResumePrompt(null);
              void d.openPlayer({ resume: true, progress });
            }}
            onCancel={() => {
              const progress = d.resumePrompt;
              d.setResumePrompt(null);
              void d.openPlayer({ resume: false, progress });
            }}
          />
          <ListPickerSheet
            visible={listOpen}
            movie={d.movie}
            onClose={() => setListOpen(false)}
          />
        </View>
      )}
    </>
  );
}
