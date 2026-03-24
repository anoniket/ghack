import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { API_URL, isDemoMode, setDemoMode } from '@/utils/constants';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

const customDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#0D0D0D',
    card: '#1A1A1A',
    text: '#F5F5F5',
    border: 'rgba(255,255,255,0.08)',
    primary: '#E8C8A0',
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Fetch demo mode config from backend before rendering
  useEffect(() => {
    fetch(`${API_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => {
        setDemoMode(data.demoMode === true);
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
        <StatusBar style="light" />
        <Stack>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </KeyboardProvider>
  );

  if (isDemoMode()) {
    return appContent;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ClerkLoaded>
        {appContent}
      </ClerkLoaded>
    </ClerkProvider>
  );
}
