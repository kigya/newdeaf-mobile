import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/src/theme';

/** Icon + label area above the system gesture/nav inset. */
const TAB_BAR_CONTENT_HEIGHT = 52;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Extra gap so labels clear the gesture pill / mandatory system gestures.
  const bottomInset = Math.max(insets.bottom, 16) + 24;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
          paddingTop: 4,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.medium,
          fontSize: 11,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Каталог',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="film-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Поиск',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="genres"
        options={{
          title: 'Жанры',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Загрузки',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="download-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
