import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDownloadsStore } from '@/src/downloads/store';
import { extractYoutubeVideoId } from '@/src/downloads/youtube';
import { colors, fonts, radius, spacing } from '@/src/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** In-screen sheet — no RN Modal (avoids Android back/overlay bugs). */
export function YoutubeDownloadSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const enqueueYoutube = useDownloadsStore((s) => s.enqueueYoutube);
  const [url, setUrl] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const canStart = !!extractYoutubeVideoId(url) && !starting;

  const onStart = async () => {
    setError(null);
    if (!extractYoutubeVideoId(url)) {
      setError('Вставьте корректную ссылку на YouTube');
      return;
    }
    setStarting(true);
    try {
      await enqueueYoutube(url.trim());
      setUrl('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать загрузку');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>YouTube Video Downloader</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Вставьте ссылку на видео — оно появится в загрузках рядом с фильмами
        </Text>

        <TextInput
          style={styles.input}
          value={url}
          onChangeText={(text) => {
            setUrl(text);
            if (error) setError(null);
          }}
          placeholder="https://youtube.com/watch?v=…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          editable={!starting}
          onSubmitEditing={() => {
            if (canStart) void onStart();
          }}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.cta, !canStart && styles.ctaDisabled]}
          disabled={!canStart}
          onPress={() => void onStart()}
        >
          {starting ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <>
              <Ionicons name="logo-youtube" size={22} color={colors.black} />
              <Text style={styles.ctaText}>Скачать видео</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    flex: 1,
    paddingRight: spacing.md,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    minHeight: 52,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  cta: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: colors.black,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
