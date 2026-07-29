import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { StreamPayload } from '@/src/api/types';
import { colors, fonts, spacing } from '@/src/theme';

import { PlayerWebView } from './PlayerWebView';

type Props = {
  playerUrl: string;
  onResolved: (payload: StreamPayload) => void;
  onError?: (message: string) => void;
  timeoutMs?: number;
};

export function StreamResolver({ playerUrl, onResolved, onError, timeoutMs = 70000 }: Props) {
  const [status, setStatus] = useState('Получаем потоки…');
  const done = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        onError?.('Таймаут получения потоков. Попробуйте ещё раз.');
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [onError, timeoutMs]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.text}>{status}</Text>
      <View style={styles.playerSlot}>
        <PlayerWebView
          playerUrl={playerUrl}
          mode="resolve"
          onReady={() => {}}
          onStatus={setStatus}
          onStream={(payload) => {
            if (done.current) return;
            done.current = true;
            onResolved(payload);
          }}
          onError={(message) => {
            if (done.current) return;
            done.current = true;
            onError?.(message);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  text: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  playerSlot: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
