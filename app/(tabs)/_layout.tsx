import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, Text, TextInput, StyleSheet, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '@/services/store';
import { TAB_BAR_BASE_HEIGHT, isDemoMode } from '@/utils/constants';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { usePostHog } from 'posthog-react-native';
import { COLORS, FONTS, BORDERS, BORDER_RADIUS, SHADOWS } from '@/theme';

// PLAT-11: Cap font scaling globally
if ((Text as any).defaultProps == null) (Text as any).defaultProps = {};
(Text as any).defaultProps.maxFontSizeMultiplier = 1.4;
if ((TextInput as any).defaultProps == null) (TextInput as any).defaultProps = {};
(TextInput as any).defaultProps.maxFontSizeMultiplier = 1.4;

const ANTLER_WHITE = require('@/assets/images/mm.png');
const ANTLER_BLACK = require('@/assets/images/mm4.png');

function AiTabIcon({ focused }: { focused: boolean }) {
  if (focused) {
    return (
      <View style={tabStyles.activeTab}>
        <Image source={ANTLER_WHITE} style={tabStyles.antlerIcon} resizeMode="contain" />
        <Text style={tabStyles.activeLabel}>ai</Text>
      </View>
    );
  }
  return (
    <View style={tabStyles.inactiveTab}>
      <Image source={ANTLER_BLACK} style={tabStyles.antlerIcon} resizeMode="contain" />
      <Text style={tabStyles.inactiveLabel}>ai</Text>
    </View>
  );
}

function TabIcon({ name, label, focused }: { name: React.ComponentProps<typeof MaterialIcons>['name']; label: string; focused: boolean }) {
  if (focused) {
    return (
      <View style={tabStyles.activeTab}>
        <MaterialIcons name={name} size={24} color={COLORS.onPrimary} />
        <Text style={tabStyles.activeLabel}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={tabStyles.inactiveTab}>
      <MaterialIcons name={name} size={24} color={COLORS.onSurface} />
      <Text style={tabStyles.inactiveLabel}>{label}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  activeTab: {
    backgroundColor: COLORS.primaryContainer,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 3 } }),
  },
  activeLabel: {
    fontFamily: FONTS.headline,
    fontSize: 12,
    color: COLORS.onPrimary,
  },
  inactiveTab: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  inactiveLabel: {
    fontFamily: FONTS.headline,
    fontSize: 11,
    color: COLORS.onSurface,
  },
  antlerIcon: {
    width: 28,
    height: 28,
    marginBottom: -4,
  },
});

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
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.onSurface,
        tabBarInactiveTintColor: COLORS.onSurface,
        tabBarStyle: onboardingComplete ? {
          position: 'absolute',
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.onSurface,
          borderTopWidth: 2,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom,
          elevation: 0,
        } : { display: 'none' },
        tabBarShowLabel: false,
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerTintColor: COLORS.onSurface,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ai',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="auto-awesome" label="ai" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: 'stores',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="storefront" label="stores" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'closet',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="checkroom" label="closet" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'profile',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person-outline" label="you" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isDemoMode()) {
    return <TabsNavigator />;
  }

  return (
    <AuthGate>
      <TabsNavigator />
    </AuthGate>
  );
}
