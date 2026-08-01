import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { searchMovies } from '@/src/data/catalog/catalog';
import type { MovieSummary } from '@/src/data/catalog/types';
import { MovieGrid } from '@/src/shared/ui/MovieGrid';
import { Screen } from '@/src/shared/ui/Screen';
import { t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';

const MIN_QUERY_LENGTH = 4;

export default function SearchScreen() {
  const getWatchProgress = useWatchProgressStore((s) => s.getLatestForMovie);
  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
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
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const items = await searchMovies(q);
      if (reqId !== requestIdRef.current) return;
      setMovies(items);
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      setError(errorMessage(e, t('search.error')));
      setMovies([]);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  };

  const emptyTitle = error
    ? t('search.error')
    : searched
      ? t('search.emptyNone')
      : t('search.emptyStart');
  const emptySubtitle = error
    ? error
    : searched
      ? t('search.emptyNoneSub')
      : t('search.emptyStartSub', { count: MIN_QUERY_LENGTH });

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
          onSubmitEditing={() => {
            void runSearch();
          }}
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
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
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
