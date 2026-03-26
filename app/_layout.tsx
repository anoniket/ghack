import * as Sentry from '@sentry/react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { PostHogProvider } from 'posthog-react-native';
import { API_URL, isDemoMode, setDemoMode } from '@/utils/constants';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  enabled: !__DEV__,
});

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const customDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#FAF8F5',
    card: '#FAF8F5',
    text: '#1D1B19',
    border: 'rgba(29,27,25,0.08)',
    primary: '#DB313F',
  },
};

function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Fetch demo mode config from backend before rendering
  useEffect(() => {
    fetch(`${API_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => {
        setDemoMode(__DEV__ ? false : data.demoMode === true);
      })
      .catch(() => {
        // If backend unreachable, default to normal auth mode
        setDemoMode(false);
      })
      .finally(() => setConfigLoaded(true));
  }, []);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && configLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, configLoaded]);

  if (!loaded || !configLoaded) {
    return null;
  }

  const appContent = (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      <ThemeProvider value={customDarkTheme}>
        <StatusBar style="dark" />
        <Stack>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </KeyboardProvider>
  );

  const wrapWithPostHog = (children: React.ReactNode) => {
    if (!POSTHOG_API_KEY) return <>{children}</>;
    return (
      <PostHogProvider
        apiKey={POSTHOG_API_KEY}
        options={{
          host: POSTHOG_HOST,
          enableSessionReplay: true,
        }}
      >
        {children}
      </PostHogProvider>
    );
  };

  if (isDemoMode()) {
    return wrapWithPostHog(appContent);
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        {wrapWithPostHog(appContent)}
      </ClerkLoaded>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
