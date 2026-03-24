import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useSSO } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS } from '@/utils/analytics';

// Required for OAuth redirect handling on web
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const posthog = usePostHog();
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = useCallback(async () => {
    setLoading('google');
    setError(null);
    posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_STARTED, { provider: 'google' });
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_COMPLETED, { provider: 'google' });
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      // User cancelled is not an error
      if (err?.errors?.[0]?.code !== 'session_exists') {
        const errorMsg = err?.errors?.[0]?.longMessage || err?.message || 'Sign in failed';
        posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_FAILED, { provider: 'google', error: errorMsg });
        setError(errorMsg);
      }
    } finally {
      setLoading(null);
    }
  }, [startSSOFlow, router, posthog]);

  const handleAppleSignIn = useCallback(async () => {
    setLoading('apple');
    setError(null);
    posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_STARTED, { provider: 'apple' });
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_apple',
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_COMPLETED, { provider: 'apple' });
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      if (err?.errors?.[0]?.code !== 'session_exists') {
        const errorMsg = err?.errors?.[0]?.longMessage || err?.message || 'Sign in failed';
        posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_FAILED, { provider: 'apple', error: errorMsg });
        setError(errorMsg);
      }
    } finally {
      setLoading(null);
    }
  }, [startSSOFlow, router, posthog]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.hero}>
        <Text style={styles.logo}>mrigAI</Text>
        <Text style={styles.tagline}>Try on any outfit{'\n'}before you buy</Text>
      </View>

      <View style={styles.buttonsContainer}>
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, styles.googleButton]}
          onPress={handleGoogleSignIn}
          disabled={loading !== null}
          activeOpacity={0.8}
        >
          {loading === 'google' ? (
            <ActivityIndicator color="#0D0D0D" size="small" />
          ) : (
            <>
              <FontAwesome name="google" size={18} color="#0D0D0D" style={styles.buttonIcon} />
              <Text style={[styles.buttonText, styles.googleButtonText]}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.button, styles.appleButton]}
            onPress={handleAppleSignIn}
            disabled={loading !== null}
            activeOpacity={0.8}
          >
            {loading === 'apple' ? (
              <ActivityIndicator color="#F5F5F5" size="small" />
            ) : (
              <>
                <FontAwesome name="apple" size={20} color="#F5F5F5" style={styles.buttonIcon} />
                <Text style={[styles.buttonText, styles.appleButtonText]}>Continue with Apple</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.disclaimer}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    color: '#F5F5F5',
    letterSpacing: -1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 26,
  },
  buttonsContainer: {
    paddingBottom: 32,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 20,
  },
  googleButton: {
    backgroundColor: '#F5F5F5',
  },
  appleButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  googleButtonText: {
    color: '#0D0D0D',
  },
  appleButtonText: {
    color: '#F5F5F5',
  },
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
