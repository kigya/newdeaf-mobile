import Constants from 'expo-constants';
import { MotiView } from 'moti';
import { useState } from 'react';
import { LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/src/shared/ui/Screen';
import { t } from '@/src/shared/i18n';
import { useSettingsStore } from '@/src/features/settings/store';
import {
  QUALITY_OPTIONS,
  type AppLocale,
  type PreferredDownloadQuality,
} from '@/src/features/settings/types';
import { colors, fonts, radius, spacing } from '@/src/shared/theme';

const AUTHOR_GITHUB_URL = 'https://github.com/kigya/newdeaf-mobile';

function qualityLabel(q: PreferredDownloadQuality): string {
  switch (q) {
    case 'best':
      return t('settings.qualityBest');
    case '1080':
      return t('settings.quality1080');
    case '720':
      return t('settings.quality720');
    case '480':
      return t('settings.quality480');
    case '360':
      return t('settings.quality360');
  }
}

function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: AppLocale;
  onChange: (locale: AppLocale) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };
  const pillWidth = width > 0 ? (width - 8) / 2 : 0;
  const isRu = locale === 'ru';

  return (
    <View style={styles.switchTrack} onLayout={onLayout} testID="language-switch">
      {pillWidth > 0 ? (
        <MotiView
          animate={{ translateX: isRu ? 4 : 4 + pillWidth }}
          transition={{ type: 'spring', damping: 18, stiffness: 220 }}
          style={[styles.switchPill, { width: pillWidth }]}
        />
      ) : null}
      <Pressable style={styles.switchOption} onPress={() => onChange('ru')}>
        <Text style={styles.flag}>🇷🇺</Text>
        <Text style={[styles.switchLabel, isRu && styles.switchLabelActive]}>
          {t('settings.languageRu')}
        </Text>
      </Pressable>
      <Pressable style={styles.switchOption} onPress={() => onChange('en')}>
        <Text style={styles.flag}>🇬🇧</Text>
        <Text style={[styles.switchLabel, !isRu && styles.switchLabelActive]}>
          {t('settings.languageEn')}
        </Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  const locale = useSettingsStore((s) => s.locale);
  const preferredDownloadQuality = useSettingsStore((s) => s.preferredDownloadQuality);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const setPreferredDownloadQuality = useSettingsStore((s) => s.setPreferredDownloadQuality);
  const version =
    Constants.expoConfig?.version ??
    Constants.nativeApplicationVersion ??
    '1.0.0';

  return (
    <Screen title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <LanguageSwitcher
          locale={locale}
          onChange={(next) => {
            void setLocale(next);
          }}
        />

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>
          {t('settings.downloadQuality')}
        </Text>
        <Text style={styles.hint}>{t('settings.downloadQualityHint')}</Text>
        <View style={styles.chips}>
          {QUALITY_OPTIONS.map((q) => {
            const active = q === preferredDownloadQuality;
            return (
              <Pressable
                key={q}
                onPress={() => void setPreferredDownloadQuality(q)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {qualityLabel(q)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Text style={styles.version}>{t('settings.version', { version })}</Text>
          <Text style={styles.madeBy}>
            {t('settings.madeBy')}
            <Text
              style={styles.madeByLink}
              onPress={() => {
                void Linking.openURL(AUTHOR_GITHUB_URL);
              }}
            >
              {t('settings.madeByLink')}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  sectionSpaced: {
    marginTop: spacing.xl,
  },
  hint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  switchTrack: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  switchPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  switchOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    zIndex: 1,
  },
  flag: {
    fontSize: 22,
  },
  switchLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  switchLabelActive: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  chipTextActive: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  version: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  madeBy: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  madeByLink: {
    color: colors.accent,
    fontFamily: fonts.semiBold,
    textDecorationLine: 'underline',
  },
});
