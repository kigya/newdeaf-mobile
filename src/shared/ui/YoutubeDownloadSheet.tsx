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

import { useDownloadsStore } from '@/src/features/downloads/store';
import {
  extractYoutubeVideoId,
  probeYoutubeQualities,
  type YoutubeQualityOption,
} from '@/src/features/downloads/youtube';
import { t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { pickPreferredQuality } from '@/src/features/settings/pickPreferredQuality';
import { useSettingsStore } from '@/src/features/settings/store';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';
import { sheetStyles } from '@/src/shared/ui/sheetStyles';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Step = 'url' | 'quality';

/** In-screen sheet — no RN Modal (avoids Android back/overlay bugs). */
export function YoutubeDownloadSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const enqueueYoutube = useDownloadsStore((s) => s.enqueueYoutube);
  const preferredDownloadQuality = useSettingsStore((s) => s.preferredDownloadQuality);
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('url');
  const [qualities, setQualities] = useState<YoutubeQualityOption[]>([]);
  const [quality, setQuality] = useState<string>(() =>
    preferredDownloadQuality === 'best' ? '720' : preferredDownloadQuality
  );
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
    setQuality(
      preferredDownloadQuality === 'best' ? '720' : preferredDownloadQuality
    );
    setVideoTitle(null);
    Keyboard.dismiss();
    onClose();
  };

  const onBackdropPress = () => {
    if (!(keyboardOpen.current || keyboardHeight > 0)) return;
    Keyboard.dismiss();
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
      const available = probe.qualities.map((q) => q.quality);
      setQuality(pickPreferredQuality(available, preferredDownloadQuality));
      setStep('quality');
    } catch (e) {
      setError(errorMessage(e, t('youtube.startFailed')));
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
      setError(errorMessage(e, t('youtube.startFailed')));
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={sheetStyles.root} pointerEvents="box-none">
      <Pressable
        style={sheetStyles.backdrop}
        onPress={onBackdropPress}
        testID="yt-sheet-backdrop"
      />
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
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.header}>
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
                style={[sheetStyles.cta, !canProbe && sheetStyles.ctaDisabled]}
                disabled={!canProbe}
                onPress={() => void onProbe()}
              >
                {probing ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <>
                    <Ionicons name="logo-youtube" size={22} color={colors.black} />
                    <Text style={sheetStyles.ctaText}>{t('youtube.chooseQuality')}</Text>
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
                      style={[styles.chip, active && sheetStyles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && sheetStyles.chipTextActive]}>
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
                style={[sheetStyles.cta, !canStart && sheetStyles.ctaDisabled]}
                disabled={!canStart}
                onPress={() => void onStart()}
              >
                {starting ? (
                  <ActivityIndicator color={colors.black} />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={22} color={colors.black} />
                    <Text style={sheetStyles.ctaText}>{t('youtube.cta')}</Text>
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
  avoid: {
    width: '100%',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '85%',
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
  chipText: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  warn: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: spacing.sm,
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
