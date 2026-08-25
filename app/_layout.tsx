import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { EmbedHtmlFetchHost } from '@/src/features/downloads/EmbedHtmlFetchHost';
import { MediaFetchHost } from '@/src/features/downloads/MediaFetchHost';
import { useDiscoveryStore } from '@/src/features/discovery/store';
import { useDownloadsStore } from '@/src/features/downloads/store';
import { useFavoritesStore } from '@/src/features/favorites/store';
import { useListsStore } from '@/src/features/lists/store';
import { t } from '@/src/shared/i18n';
import { useSettingsStore } from '@/src/features/settings/store';
import { useTitlePrefsStore } from '@/src/features/title-prefs/store';
import { colors } from '@/src/shared/theme';
import { useWatchHistoryStore } from '@/src/features/watch-history/store';
import { useWatchProgressStore } from '@/src/features/watch-progress/store';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const hydrateDownloads = useDownloadsStore((s) => s.hydrate);
  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);
  const hydrateWatchProgress = useWatchProgressStore((s) => s.hydrate);
  const hydrateWatchHistory = useWatchHistoryStore((s) => s.hydrate);
  const hydrateLists = useListsStore((s) => s.hydrate);
  const hydrateTitlePrefs = useTitlePrefsStore((s) => s.hydrate);
  const hydrateDiscovery = useDiscoveryStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const syncFromSystemIfChanged = useSettingsStore((s) => s.syncFromSystemIfChanged);
  const locale = useSettingsStore((s) => s.locale);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const [loaded, error] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void (async () => {
        await hydrateSettings();
        void hydrateDownloads();
        void hydrateFavorites();
        void hydrateWatchProgress();
        void hydrateWatchHistory();
        void hydrateLists();
        void hydrateTitlePrefs();
        void hydrateDiscovery();
        SplashScreen.hideAsync();
        if (Platform.OS === 'android') {
          void Notifications.requestPermissionsAsync();
        }
      })();
    }
  }, [
    loaded,
    hydrateSettings,
    hydrateDownloads,
    hydrateFavorites,
    hydrateWatchProgress,
    hydrateWatchHistory,
    hydrateLists,
    hydrateTitlePrefs,
    hydrateDiscovery,
  ]);

  useEffect(() => {
    if (!settingsHydrated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncFromSystemIfChanged();
      }
    });
    return () => sub.remove();
  }, [settingsHydrated, syncFromSystemIfChanged]);

  if (!loaded || !settingsHydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Stack
        key={locale}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'Montserrat_600SemiBold' },
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="movie/[id]"
          options={{
            title: t('common.movie'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="player/[id]"
          options={{
            title: t('common.player'),
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="offline/[downloadId]"
          options={{
            title: t('common.offline'),
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="trailer/[videoId]"
          options={{
            title: t('trailer.title'),
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="genre/[slug]"
          options={{
            title: t('common.genre'),
            headerBackTitle: t('common.back'),
          }}
        />
      </Stack>
      <MediaFetchHost />
      <EmbedHtmlFetchHost />
    </GestureHandlerRootView>
  );
}
