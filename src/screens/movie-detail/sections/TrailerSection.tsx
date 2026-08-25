import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { MovieDetail } from '@/src/data/catalog/types';
import { t } from '@/src/shared/i18n';
import { colors } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type TrailerSectionProps = {
  movie: MovieDetail;
  extraYoutubeId?: string;
};

export function TrailerSection({ movie, extraYoutubeId }: TrailerSectionProps) {
  const router = useRouter();
  const trailerId = movie.trailerYoutubeId || extraYoutubeId;
  const trailerEmbed = trailerId
    ? `https://www.youtube-nocookie.com/embed/${trailerId}?playsinline=1&rel=0`
    : movie.trailerUrl;

  if (!(trailerId || trailerEmbed)) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('movie.trailer')}</Text>
      {trailerId ? (
        <Pressable
          style={styles.trailerCard}
          onPress={() =>
            router.push(`/trailer/${trailerId}` as Href)
          }
        >
          <View style={styles.trailerPlay}>
            <Ionicons name="logo-youtube" size={36} color={colors.accent} />
          </View>
          <Text style={styles.trailerOpenText}>{t('movie.watchTrailer')}</Text>
        </Pressable>
      ) : (
        <View style={styles.trailerWrap}>
          <WebView
            source={{ uri: trailerEmbed as string }}
            style={styles.trailer}
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
          />
        </View>
      )}
    </View>
  );
}
