import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { searchMovies } from '@/src/api/catalog';
import type { MovieSummary } from '@/src/api/types';
import { MovieGrid } from '@/src/components/MovieGrid';
import { Screen } from '@/src/components/Screen';
import { colors, fonts, radius, spacing } from '@/src/theme';

const MIN_QUERY_LENGTH = 4;

export default function SearchScreen() {
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
      setError(`Введите минимум ${MIN_QUERY_LENGTH} символа`);
      setMovies([]);
      return;
    }
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const items = await searchMovies(q);
      setMovies(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска');
      setMovies([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="Поиск" subtitle="Найдите нужный фильм">
      <View style={styles.bar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Название фильма…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={runSearch}
          autoCorrect={false}
        />
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : hasQuery ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={26} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <MovieGrid
        movies={movies}
        loading={loading}
        emptyTitle={searched ? 'Ничего не найдено' : 'Начните поиск'}
        emptySubtitle={
          error
            ? error
            : searched
              ? 'Попробуйте другое название'
              : `Введите минимум ${MIN_QUERY_LENGTH} символа`
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
