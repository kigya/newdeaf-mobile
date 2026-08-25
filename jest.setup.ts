jest.mock('youtubei.js/react-native', () => ({
  Innertube: { create: jest.fn() },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  cacheDirectory: 'file:///mock-cache/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  createDownloadResumable: jest.fn(),
  readDirectoryAsync: jest.fn(async () => []),
  getFreeDiskStorageAsync: jest.fn(async () => 8 * 1024 * 1024 * 1024),
  getTotalDiskCapacityAsync: jest.fn(async () => 64 * 1024 * 1024 * 1024),
  copyAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-network', () => ({
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    CELLULAR: 'CELLULAR',
    WIFI: 'WIFI',
    BLUETOOTH: 'BLUETOOTH',
    ETHERNET: 'ETHERNET',
    WIMAX: 'WIMAX',
    VPN: 'VPN',
    OTHER: 'OTHER',
  },
  useNetworkState: jest.fn(() => ({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  })),
  getNetworkStateAsync: jest.fn(async () => ({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  })),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(() => []),
  })),
}));

jest.mock('react-native-background-actions', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    isRunning: jest.fn(() => false),
    updateNotification: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  usePathname: jest.fn(() => '/movie/1'),
  Stack: {
    Screen: jest.fn(() => null),
  },
  Link: ({ children }: { children?: React.ReactNode }) => children ?? null,
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(View, props, children),
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '1.0.0' },
    nativeApplicationVersion: '1.0.0',
  },
}));

jest.mock('moti', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    MotiView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(View, props, children),
    MotiText: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(View, props, children),
  };
});

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: ({ ...props }: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: props.testID ?? 'expo-image' }),
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }: { name?: string }) =>
    React.createElement(Text, { testID: `icon-${name ?? 'unknown'}` }, name ?? '');
  return {
    Ionicons: Icon,
    MaterialIcons: Icon,
    FontAwesome: Icon,
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Animated = {
    View: View,
    createAnimatedComponent: (Component: unknown) => Component,
    call: () => {},
  };
  return {
    __esModule: true,
    default: Animated,
    FadeOut: { duration: () => ({}) },
    FadeIn: { duration: () => ({}) },
    LinearTransition: {},
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    Easing: { linear: jest.fn(), ease: jest.fn() },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  };
});
