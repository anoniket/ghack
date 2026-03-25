// ---------------------------------------------------------------------------
// Global mocks for React Native + Expo + third-party modules
// ---------------------------------------------------------------------------

// ---- Global stubs --------------------------------------------------------

// React Native's Animated module sometimes references requestAnimationFrame
global.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  setTimeout(cb, 0);
  return 0;
};

// __DEV__ is set by React Native's JS runtime
(global as any).__DEV__ = true;

// ---- @clerk/clerk-expo ---------------------------------------------------

jest.mock('@clerk/clerk-expo', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  useAuth: jest.fn(() => ({
    isSignedIn: true,
    isLoaded: true,
    userId: 'user_test123',
    signOut: jest.fn(),
  })),
  useUser: jest.fn(() => ({
    user: {
      fullName: 'Test User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
      imageUrl: 'https://example.com/avatar.png',
    },
  })),
  useSSO: jest.fn(() => ({
    startSSOFlow: jest.fn().mockResolvedValue({
      createdSessionId: 'sess_123',
      setActive: jest.fn(),
    }),
  })),
  getClerkInstance: jest.fn(() => ({
    session: {
      getToken: jest.fn().mockResolvedValue('test-token-123'),
    },
  })),
}));

jest.mock('@clerk/clerk-expo/token-cache', () => ({
  tokenCache: {
    getToken: jest.fn(),
    saveToken: jest.fn(),
  },
}));

// ---- posthog-react-native ------------------------------------------------

const mockPostHog = {
  capture: jest.fn(),
  identify: jest.fn(),
  screen: jest.fn(),
  reset: jest.fn(),
};

jest.mock('posthog-react-native', () => ({
  usePostHog: jest.fn(() => mockPostHog),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ---- @sentry/react-native ------------------------------------------------

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn((component: any) => component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  withScope: jest.fn(),
}));

// ---- expo-router ----------------------------------------------------------

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => mockRouter),
  useSegments: jest.fn(() => []),
  usePathname: jest.fn(() => '/'),
  useFocusEffect: jest.fn((cb: () => void) => {
    // Execute the callback immediately for testing
    cb();
  }),
  Redirect: jest.fn(({ href }: { href: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'redirect' }, `Redirect to ${href}`);
  }),
  Stack: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    {
      Screen: jest.fn(() => null),
    }
  ),
  Tabs: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    {
      Screen: jest.fn(() => null),
    }
  ),
  ErrorBoundary: jest.fn(({ children }: { children: React.ReactNode }) => children),
  Link: jest.fn(({ children }: { children: React.ReactNode }) => children),
}));

// ---- expo-web-browser ----------------------------------------------------

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openBrowserAsync: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

// ---- expo-image-picker ----------------------------------------------------

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}));

// ---- react-native-image-crop-picker ----------------------------------------

jest.mock('react-native-image-crop-picker', () => ({
  openPicker: jest.fn().mockResolvedValue({
    path: '/tmp/mock-photo.jpg',
    width: 2000,
    height: 2000,
    size: 500000,
  }),
  openCamera: jest.fn().mockResolvedValue({
    path: '/tmp/mock-camera.jpg',
    width: 2000,
    height: 2000,
    size: 500000,
  }),
  clean: jest.fn(),
}));

// ---- expo-font ------------------------------------------------------------

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  isLoaded: jest.fn(() => true),
  loadAsync: jest.fn(),
}));

// ---- expo-splash-screen ---------------------------------------------------

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// ---- expo-constants -------------------------------------------------------

jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
    manifest: {
      extra: {},
    },
  },
}));

// ---- expo-application -----------------------------------------------------

jest.mock('expo-application', () => ({
  getInstallationIdAsync: jest.fn().mockResolvedValue('test-install-id'),
  androidId: null,
}));

// ---- expo-file-system -----------------------------------------------------

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  readAsStringAsync: jest.fn().mockResolvedValue('mock-base64'),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 100 }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  File: jest.fn().mockImplementation(() => ({
    exists: false,
    delete: jest.fn(),
  })),
}));

// ---- expo-secure-store ----------------------------------------------------

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// ---- @react-native-async-storage/async-storage ----------------------------

const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStorage))),
    multiGet: jest.fn((keys: string[]) =>
      Promise.resolve(keys.map((k) => [k, mockStorage[k] || null]))
    ),
    multiSet: jest.fn((pairs: [string, string][]) => {
      pairs.forEach(([k, v]) => {
        mockStorage[k] = v;
      });
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
  },
}));

// ---- react-native-keyboard-controller -------------------------------------

jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  return {
    KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
    KeyboardAvoidingView: ({ children, ...props }: any) => {
      const { View } = require('react-native');
      return React.createElement(View, props, children);
    },
    useKeyboardHandler: jest.fn(),
    KeyboardController: {
      setInputMode: jest.fn(),
      setDefaultMode: jest.fn(),
    },
  };
});

// ---- react-native-safe-area-context ---------------------------------------

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: any) => children,
    useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 0, height: 0 } },
  };
});

// ---- @react-navigation/native ---------------------------------------------

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    DarkTheme: {
      dark: true,
      colors: {
        primary: '#0a84ff',
        background: '#000000',
        card: '#1c1c1e',
        text: '#ffffff',
        border: '#272729',
        notification: '#ff453a',
      },
    },
    ThemeProvider: ({ children }: any) => children,
    useNavigation: jest.fn(() => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      dispatch: jest.fn(),
    })),
    useRoute: jest.fn(() => ({ params: {} })),
    useFocusEffect: jest.fn((cb: () => void) => cb()),
  };
});

// ---- @react-navigation/bottom-tabs ----------------------------------------

jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: jest.fn(() => 80),
  createBottomTabNavigator: jest.fn(),
}));

// ---- expo-blur ------------------------------------------------------------

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
  };
});

// ---- expo-image -----------------------------------------------------------

jest.mock('expo-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return {
    Image: (props: any) => React.createElement(Image, props),
  };
});

// ---- expo-video -----------------------------------------------------------

jest.mock('expo-video', () => ({
  useVideoPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    loop: false,
    muted: false,
  })),
  VideoView: jest.fn(() => null),
}));

// ---- expo-status-bar ------------------------------------------------------

jest.mock('expo-status-bar', () => ({
  StatusBar: jest.fn(() => null),
}));

// ---- react-native-webview -------------------------------------------------

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) =>
      React.createElement(View, { ...props, ref, testID: 'webview' })
    ),
    WebView: React.forwardRef((props: any, ref: any) =>
      React.createElement(View, { ...props, ref, testID: 'webview' })
    ),
  };
});

// ---- @react-native-community/netinfo --------------------------------------

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  }),
}));

// ---- @expo/vector-icons ---------------------------------------------------

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const FontAwesome = ({ name, ...props }: any) =>
    React.createElement(Text, { ...props, testID: `icon-${name}` }, name);
  FontAwesome.font = {};
  return {
    __esModule: true,
    default: FontAwesome,
  };
});

// ---- react-native-reanimated ----------------------------------------------

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (comp: any) => comp,
      View,
    },
    useSharedValue: jest.fn((init: any) => ({ value: init })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((val: any) => val),
    withSpring: jest.fn((val: any) => val),
    Easing: { linear: jest.fn() },
    FadeIn: { duration: jest.fn() },
    FadeOut: { duration: jest.fn() },
    Layout: {},
  };
});

// ---- react-native-gesture-handler -----------------------------------------

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, TouchableOpacity, ScrollView, FlatList } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    PanGestureHandler: View,
    TapGestureHandler: View,
    State: {},
    TouchableOpacity,
    ScrollView,
    FlatList,
    gestureHandlerRootHOC: (comp: any) => comp,
  };
});

// ---- Components we don't want to test deeply --------------------------------

jest.mock('@/components/VideoModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: jest.fn(() => null),
  };
});

jest.mock('@/components/CrashBoundary', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ---- Services that make network calls --------------------------------------

jest.mock('@/services/logger', () => ({
  rlog: jest.fn(),
}));

jest.mock('@/services/productDetector', () => ({
  PRODUCT_DETECTOR_JS: 'mock-detector-js',
}));

// ---- Expo linking ----------------------------------------------------------

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `myapp://${path}`),
  openURL: jest.fn(),
}));

// ---- expo-store-review -----------------------------------------------------

jest.mock('expo-store-review', () => ({
  requestReview: jest.fn(),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

// ---- expo-linear-gradient --------------------------------------------------

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props: any) => React.createElement(View, props),
  };
});

// ---- react-native-screens --------------------------------------------------

jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
  Screen: jest.fn(),
  ScreenContainer: jest.fn(),
  NativeScreen: jest.fn(),
  NativeScreenContainer: jest.fn(),
}));

// ---- @gorhom/bottom-sheet --------------------------------------------------

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) =>
      React.createElement(View, { ...props, ref })
    ),
    BottomSheetView: View,
    BottomSheetScrollView: View,
    BottomSheetModal: View,
    BottomSheetModalProvider: ({ children }: any) => children,
  };
});

// ---- posthog-react-native-session-replay -----------------------------------

jest.mock('posthog-react-native-session-replay', () => ({}));

// ---- react-native-worklets ------------------------------------------------

jest.mock('react-native-worklets', () => ({}));

// ---- expo-camera ----------------------------------------------------------

jest.mock('expo-camera', () => ({
  Camera: jest.fn(() => null),
  useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
}));

// ---- expo-auth-session ----------------------------------------------------

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'myapp://redirect'),
  AuthRequest: jest.fn(),
}));

// ---- expo-updates ---------------------------------------------------------

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
  useUpdates: jest.fn(() => ({})),
}));

// ---- Suppress console noise in tests --------------------------------------

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = (...args: any[]) => {
    // Suppress specific React Native test noise
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('act(...)') ||
      msg.includes('Warning: An update to') ||
      msg.includes('FATAL: EXPO_PUBLIC_API_URL')
    ) {
      return;
    }
    originalConsoleError(...args);
  };
  console.warn = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('Animated') || msg.includes('NativeModule')) return;
    originalConsoleWarn(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
