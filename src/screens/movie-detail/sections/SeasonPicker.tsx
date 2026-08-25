import { Pressable, Text, View } from 'react-native';

import { listEpisodes } from '@/src/data/catalog/parse';
import type { PlayerFileList } from '@/src/data/catalog/types';
import { t } from '@/src/shared/i18n';
import { spacing } from '@/src/shared/theme';
import { styles } from '@/src/screens/movie-detail/styles';

type SeasonPickerProps = {
  isSerial: boolean;
  fileList: PlayerFileList | null;
  seasons: number[];
  episodes: number[];
  season: number;
  episode: number;
  setSeason: (season: number) => void;
  setEpisode: (episode: number) => void;
};

export function SeasonPicker({
  isSerial,
  fileList,
  seasons,
  episodes,
  season,
  episode,
  setSeason,
  setEpisode,
}: SeasonPickerProps) {
  if (!(isSerial && fileList)) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('movie.seasons')}</Text>
      <View style={styles.chips}>
        {seasons.map((s) => {
          const active = s === season;
          return (
            <Pressable
              key={s}
              onPress={() => {
                setSeason(s);
                const eps = listEpisodes(fileList, s);
                setEpisode(eps[0] ?? 1);
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t('movie.season', { n: s })}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
        {t('movie.episodes')}
      </Text>
      <View style={styles.chips}>
        {episodes.map((e) => {
          const active = e === episode;
          return (
            <Pressable
              key={e}
              onPress={() => setEpisode(e)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t('movie.episode', { n: e })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
