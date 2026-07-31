import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { searchMovies } from '@/src/api/catalog';
import type { MovieSummary } from '@/src/api/types';
import { MovieGrid } from '@/src/components/MovieGrid';
import { Screen } from '@/src/components/Screen';
import { t } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';
import { useWatchProgressStore } from '@/src/watch-progress/store';

const MIN_QUERY_LENGTH = 4;

export default function SearchScreen() {
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (!query.trim()) {
      setMovies([]);
      setSearched(false);
      setError(null);
    }
  }, [query]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSearched(false);
      setError(t('search.minLength', { count: MIN_QUERY_LENGTH }));
      setMovies([]);
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const items = await searchMovies(q);
      setMovies(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('search.error'));
      setMovies([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title={t('search.title')} subtitle={t('search.subtitle')}>
      <Pressable style={styles.bar} onPress={Keyboard.dismiss}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={runSearch}
          autoCorrect={false}
          blurOnSubmit
        />
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : hasQuery ? (
          <Pressable
            onPress={() => {
              setQuery('');
              Keyboard.dismiss();
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={26} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Pressable>
      <MovieGrid
        movies={movies}
        loading={loading}
        getWatchProgress={getWatchProgress}
        emptyTitle={searched ? t('search.emptyNone') : t('search.emptyStart')}
        emptySubtitle={
          error
            ? error
            : searched
              ? t('search.emptyNoneSub')
              : t('search.emptyStartSub', { count: MIN_QUERY_LENGTH })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
});
