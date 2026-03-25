import React, { useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, Redirect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { View, StyleSheet, Platform, Text, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/services/store';
import { TAB_BAR_BASE_HEIGHT, isDemoMode } from '@/utils/constants';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usePostHog } from 'posthog-react-native';
import AIConsentOverlay, { getAiConsent } from '@/components/AIConsentScreen';

// PLAT-11: Cap font scaling globally — prevents layout breakage with large accessibility fonts
if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
(Text as any).defaultProps.maxFontSizeMultiplier = 1.4;
if ((TextInput as any).defaultProps == null) (TextInput as any).defaultProps = {};
(TextInput as any).defaultProps.maxFontSizeMultiplier = 1.4;

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -3 }} {...props} />;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const { user } = useUser();
  const posthog = usePostHog();

  React.useEffect(() => {
    if (isSignedIn && userId && posthog) {
      posthog.identify(userId, {
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName,
      });
    }
  }, [isSignedIn, userId, user, posthog]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return <>{children}</>;
}

function TabsNavigator() {
  const insets = useSafeAreaInsets();
  const isGenerating = useAppStore((s) => s.tryOnLoading || s.videoLoading);

  return (
    <Tabs
      screenOptions={{
        // Block tab switches during image/video generation — WebView must stay mounted
        tabBarButton: isGenerating
          ? (props) => <TouchableOpacity {...(props as any)} activeOpacity={1} onPress={undefined} />
          : undefined,
        tabBarActiveTintColor: '#E8C8A0',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.3)',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(13,13,13,0.95)',
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 0.5,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 10,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView
              tint="dark"
              intensity={80}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        headerStyle: {
          backgroundColor: '#0D0D0D',
        },
        headerTintColor: '#F5F5F5',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Shop',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="shopping-bag" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="heart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const aiConsentGiven = useAppStore((s) => s.aiConsentGiven);
  const setAiConsentGiven = useAppStore((s) => s.setAiConsentGiven);

  useEffect(() => {
    getAiConsent().then((given) => {
      if (given) setAiConsentGiven(true);
    });
  }, []);

  const content = isDemoMode() ? (
    <TabsNavigator />
  ) : (
    <AuthGate>
      <TabsNavigator />
    </AuthGate>
  );

  return (
    <View style={{ flex: 1 }}>
      {content}
      {!aiConsentGiven && <AIConsentOverlay />}
    </View>
  );
}
