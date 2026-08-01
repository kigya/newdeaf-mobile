import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDownloadsStore } from '@/src/downloads/store';
import {
  extractYoutubeVideoId,
  probeYoutubeQualities,
  type YoutubeQualityOption,
} from '@/src/downloads/youtube';
import { t } from '@/src/i18n';
import { colors, fonts, radius, spacing } from '@/src/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Step = 'url' | 'quality';

/** In-screen sheet — no RN Modal (avoids Android back/overlay bugs). */
export function YoutubeDownloadSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const enqueueYoutube = useDownloadsStore((s) => s.enqueueYoutube);
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('url');
  const [qualities, setQualities] = useState<YoutubeQualityOption[]>([]);
  const [quality, setQuality] = useState('720');
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOpen = useRef(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardOpen.current = true;
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardOpen.current = false;
        setKeyboardHeight(0);
      }
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!visible) return null;

  const canProbe = !!extractYoutubeVideoId(url) && !probing && !starting;
  const canStart = step === 'quality' && !!quality && !starting;

  const resetAndClose = () => {
    setUrl('');
    setError(null);
    setStarting(false);
    setProbing(false);
    setStep('url');
    setQualities([]);
    setQuality('720');
    setVideoTitle(null);
    Keyboard.dismiss();
    onClose();
  };

  const onBackdropPress = () => {
    if (keyboardOpen.current || keyboardHeight > 0) {
      Keyboard.dismiss();
      return;
    }
  };

  const onProbe = async () => {
    setError(null);
    if (!extractYoutubeVideoId(url)) {
      setError(t('youtube.invalidUrl'));
      return;
    }
    setProbing(true);
    try {
      const probe = await probeYoutubeQualities(url.trim());
      setQualities(probe.qualities);
      setVideoTitle(probe.title);
      const preferred =
        probe.qualities.find((q) => q.quality === '720')?.quality ??
        probe.qualities[0]?.quality ??
        '720';
      setQuality(preferred);
      setStep('quality');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('youtube.startFailed'));
    } finally {
      setProbing(false);
    }
  };

  const onStart = async () => {
    setError(null);
    setStarting(true);
    try {
      await enqueueYoutube(url.trim(), quality);
      resetAndClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('youtube.startFailed'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onBackdropPress} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.avoid}
      >
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              marginBottom: Platform.OS === 'android' ? keyboardHeight : 0,
              minHeight: 320,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{t('youtube.title')}</Text>
            <Pressable onPress={resetAndClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{t('youtube.subtitle')}</Text>

          {step === 'url' ? (
            <>
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={(text) => {
                  setUrl(text);
                  if (error) setError(null);
                }}
                placeholder={t('youtube.placeholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                editable={!probing}
                onSubmitEditing={() => {
                  if (canProbe) void onProbe();
                }}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.cta, !canProbe && styles.ctaDisabled]}
                disabled={!canProbe}
                onPress={() => void onProbe()}
              >
                {probing ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <>
                    <Ionicons name="logo-youtube" size={22} color={colors.black} />
                    <Text style={styles.ctaText}>{t('youtube.chooseQuality')}</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {videoTitle ? (
                <Text style={styles.videoTitle} numberOfLines={2}>
                  {videoTitle}
                </Text>
              ) : null}
              <Text style={styles.section}>{t('youtube.quality')}</Text>
              <View style={styles.chips}>
                {qualities.map((q) => {
                  const active = q.quality === quality;
                  return (
                    <Pressable
                      key={q.quality}
                      onPress={() => setQuality(q.quality)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {q.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {Number(quality) >= 1080 ? (
                <Text style={styles.warn}>{t('downloadSheet.highQualityWarn')}</Text>
              ) : null}

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
                    <Ionicons name="download-outline" size={22} color={colors.black} />
                    <Text style={styles.ctaText}>{t('youtube.cta')}</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.backLink}
                onPress={() => {
                  setStep('url');
                  setError(null);
                }}
              >
                <Text style={styles.backLinkText}>{t('common.back')}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    justifyContent: 'flex-end',
  },
  avoid: {
    width: '100%',
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
    maxHeight: '85%',
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
    minHeight: 56,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  videoTitle: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  section: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  chipTextActive: {
    color: colors.accent,
  },
  warn: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: spacing.sm,
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
  backLink: {
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  backLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
});
