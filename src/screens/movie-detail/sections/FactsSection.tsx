import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { KinopoiskFact } from '@/src/data/catalog/kinopoisk';
import { t } from '@/src/shared/i18n';
import { styles } from '@/src/screens/movie-detail/styles';

type FactsSectionProps = {
  facts?: KinopoiskFact[];
};

export function FactsSection({ facts }: FactsSectionProps) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!facts?.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('movie.facts')}</Text>
      {facts.map((fact, index) => {
        const gated = fact.spoiler && !open[index];
        return (
          <View key={`${index}-${fact.text.slice(0, 24)}`} style={styles.factCard}>
            {fact.spoiler ? (
              <Pressable
                onPress={() => setOpen((s) => ({ ...s, [index]: !s[index] }))}
                testID={`fact-spoiler-${index}`}
              >
                <Text style={styles.factSpoiler}>
                  {gated ? t('movie.spoiler') : t('movie.hideReview')}
                </Text>
              </Pressable>
            ) : null}
            {gated ? null : <Text style={styles.factText}>{fact.text}</Text>}
          </View>
        );
      })}
    </View>
  );
}
