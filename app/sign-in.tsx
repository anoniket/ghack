import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Pressable,
  Image,
} from 'react-native';
import { useSSO } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS } from '@/utils/analytics';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SHADOWS, BORDER_RADIUS, BORDERS, SPACING } from '@/theme';
import AIConsentOverlay, { getAiConsent } from '@/components/AIConsentScreen';
import { useAppStore } from '@/services/store';

// Required for OAuth redirect handling on web
WebBrowser.maybeCompleteAuthSession();

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Store logo imports
const STORE_LOGOS = {
  myntra: require('@/assets/images/store-logos/myntra.png'),
  ajio: require('@/assets/images/store-logos/ajio.png'),
  hm: require('@/assets/images/store-logos/hm.png'),
  zara: require('@/assets/images/store-logos/zara.png'),
  nike: require('@/assets/images/store-logos/nike.png'),
  puma: require('@/assets/images/store-logos/puma.png'),
  westside: require('@/assets/images/store-logos/westside.png'),
  tatacliq: require('@/assets/images/store-logos/tatacliq.png'),
  snitch: require('@/assets/images/store-logos/snitch.png'),
  fabindia: require('@/assets/images/store-logos/fabindia.png'),
  shein: require('@/assets/images/store-logos/shein.png'),
  amazon: require('@/assets/images/store-logos/amazon.png'),
} as const;

// Row 1 scrolls left, Row 2 scrolls right
const ROW_1_LOGOS: (keyof typeof STORE_LOGOS)[] = ['myntra', 'zara', 'nike', 'snitch', 'ajio', 'shein'];
const ROW_2_LOGOS: (keyof typeof STORE_LOGOS)[] = ['puma', 'hm', 'westside', 'tatacliq', 'fabindia', 'amazon'];

const LOGO_WIDTH = 72;
const LOGO_HEIGHT = 28;
const MARQUEE_GAP = 24;
const LOGO_SLOT = LOGO_WIDTH + MARQUEE_GAP;

// ---------------------------------------------------------------------------
// StoreMarquee — 2-row auto-scrolling logo strip with edge fades
// ---------------------------------------------------------------------------

function MarqueeRow({ logos, reverse }: { logos: (keyof typeof STORE_LOGOS)[]; reverse?: boolean }) {
  const translateX = useRef(new Animated.Value(0)).current;
  // One full set width — translate exactly this far then reset seamlessly
  const setWidth = LOGO_SLOT * logos.length;

  useEffect(() => {
    const from = reverse ? -setWidth : 0;
    const to = reverse ? 0 : -setWidth;
    translateX.setValue(from);
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: to,
        duration: Math.abs(to - from) * 18,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [translateX, reverse, setWidth]);

  // Render 3 copies for seamless infinite scroll — no gaps at edges
  const renderStrip = (keyPrefix: string) =>
    logos.map((key) => (
      <Image
        key={`${keyPrefix}-${key}`}
        source={STORE_LOGOS[key]}
        style={styles.marqueeLogo}
        resizeMode="contain"
      />
    ));

  return (
    <Animated.View style={[styles.marqueeTrack, { transform: [{ translateX }] }]}>
      {renderStrip('a')}
      {renderStrip('b')}
      {renderStrip('c')}
    </Animated.View>
  );
}

function StoreMarquee() {
  return (
    <View style={styles.marqueeContainer}>
      <View style={styles.marqueeRow}>
        <MarqueeRow logos={ROW_1_LOGOS} />
      </View>
      <View style={styles.marqueeRow}>
        <MarqueeRow logos={ROW_2_LOGOS} reverse />
      </View>
      {/* Left fade */}
      <LinearGradient
        colors={[COLORS.background, `${COLORS.background}00`]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.marqueeFadeLeft}
        pointerEvents="none"
      />
      {/* Right fade */}
      <LinearGradient
        colors={[`${COLORS.background}00`, COLORS.background]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.marqueeFadeRight}
        pointerEvents="none"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// HeroGallery — scattered collage: selfie center, 3 try-ons around it
// ---------------------------------------------------------------------------

const HERO_IMAGES = {
  selfie: require('@/assets/images/selfie1.jpg'),
  lehenga: require('@/assets/images/selfie2.jpg'),
  dress: require('@/assets/images/selfie3.jpg'),
  hoodie: require('@/assets/images/selfie4.jpg'),
  sundress: require('@/assets/images/selfie5.jpg'),
};

function HeroGallery() {
  return (
    <View style={styles.galleryWrapper}>
      {/* Try-on: Lehenga — top left */}
      <View style={[styles.tryonCard, styles.tryonTopLeft]}>
        <Image source={HERO_IMAGES.lehenga} style={styles.tryonImage} resizeMode="cover" />
        <View style={[styles.logoStamp, { transform: [{ rotate: '-12deg' }] }]}>
          <Image source={STORE_LOGOS.myntra} style={styles.logoStampImage} resizeMode="contain" />
        </View>
      </View>

      {/* Try-on: Dress — top right */}
      <View style={[styles.tryonCard, styles.tryonTopRight]}>
        <Image source={HERO_IMAGES.dress} style={styles.tryonImage} resizeMode="cover" />
        <View style={[styles.logoStamp, { transform: [{ rotate: '8deg' }] }]}>
          <Image source={STORE_LOGOS.zara} style={styles.logoStampImage} resizeMode="contain" />
        </View>
      </View>

      {/* Selfie — center, on top */}
      <View style={[styles.selfieCard]}>
        <Image source={HERO_IMAGES.selfie} style={styles.selfieImage} resizeMode="cover" />
        <View style={styles.selfieBadge}>
          <Text style={styles.selfieBadgeText}>your selfie</Text>
        </View>
      </View>

      {/* Try-on: Hoodie — bottom right */}
      <View style={[styles.tryonCard, styles.tryonBottomRight]}>
        <Image source={HERO_IMAGES.hoodie} style={styles.tryonImage} resizeMode="cover" />
        <View style={[styles.logoStamp, { transform: [{ rotate: '-6deg' }] }]}>
          <Image source={STORE_LOGOS.ajio} style={styles.logoStampImage} resizeMode="contain" />
        </View>
      </View>

      {/* Try-on: Sundress — bottom left */}
      <View style={[styles.tryonCard, styles.tryonBottomLeft]}>
        <Image source={HERO_IMAGES.sundress} style={styles.tryonImage} resizeMode="cover" />
        <View style={[styles.logoStamp, { transform: [{ rotate: '10deg' }] }]}>
          <Image source={STORE_LOGOS.hm} style={styles.logoStampImage} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AnimatedButton — press shifts button down+right, shadow collapses (Stitch active-shift)
// ---------------------------------------------------------------------------

function AnimatedButton({
  children,
  style,
  onPress,
  disabled,
  accessibilityLabel,
  hasShadow,
}: {
  children: React.ReactNode;
  style: any;
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  hasShadow?: boolean;
}) {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  const handlePressIn = () => {
    setPressed(true);
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    setPressed(false);
    Animated.timing(pressAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  };

  const translateX = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });
  const translateY = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[
          style,
          hasShadow && (pressed ? SHADOWS.none : SHADOWS.hard),
          hasShadow && !pressed && Platform.select({ android: { elevation: 6 } }),
          { transform: [{ translateX }, { translateY }] },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// SignInScreen
// ---------------------------------------------------------------------------

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const posthog = usePostHog();
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<'google' | 'apple' | null>(null);
  const aiConsentGiven = useAppStore((s) => s.aiConsentGiven);

  // -- SSO flow (called after consent) --------------------------------------

  const startSSO = useCallback(async (provider: 'google' | 'apple') => {
    setLoading(provider);
    setError(null);
    posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_STARTED, { provider });
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: provider === 'google' ? 'oauth_google' : 'oauth_apple',
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_COMPLETED, { provider });
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      if (err?.errors?.[0]?.code !== 'session_exists') {
        const errorMsg = err?.errors?.[0]?.longMessage || err?.message || 'Sign in failed';
        posthog?.capture(ANALYTICS_EVENTS.SIGN_IN_FAILED, { provider, error: errorMsg });
        setError(errorMsg);
      }
    } finally {
      setLoading(null);
    }
  }, [startSSOFlow, router, posthog]);

  // -- Button handlers: check consent first ---------------------------------

  const handleGoogleSignIn = useCallback(async () => {
    if (aiConsentGiven) {
      startSSO('google');
    } else {
      setPendingProvider('google');
      setShowConsent(true);
    }
  }, [aiConsentGiven, startSSO]);

  const handleAppleSignIn = useCallback(async () => {
    if (aiConsentGiven) {
      startSSO('apple');
    } else {
      setPendingProvider('apple');
      setShowConsent(true);
    }
  }, [aiConsentGiven, startSSO]);

  // -- Consent callbacks ----------------------------------------------------

  const handleConsentAgree = useCallback(() => {
    setShowConsent(false);
    if (pendingProvider) {
      startSSO(pendingProvider);
      setPendingProvider(null);
    }
  }, [pendingProvider, startSSO]);

  const handleConsentDecline = useCallback(() => {
    setShowConsent(false);
    setPendingProvider(null);
  }, []);

  const handleOpenTerms = useCallback(() => {
    Linking.openURL('https://mrigai.com/terms-of-service');
  }, []);

  const handleOpenPrivacy = useCallback(() => {
    Linking.openURL('https://mrigai.com/privacy-policy');
  }, []);

  // -- Render ---------------------------------------------------------------

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 8 },
      ]}
    >
      {/* 1. Try-on Gallery */}
      <HeroGallery />

      {/* 2. Headline + Subtext */}
      <View style={styles.headlineBlock}>
        <View>
          <Text style={styles.headline}>try on</Text>
          <Text style={[styles.headline, styles.headlineTight]}>anything.</Text>
          <Text style={[styles.headline, styles.headlineTight, styles.headlineAccent]}>on any</Text>
          <Text style={[styles.headline, styles.headlineTight, styles.headlineAccent]}>website.</Text>
        </View>

        <Text style={styles.subtext}>
          one selfie. any store you love.{'\n'}it works everywhere.
        </Text>
      </View>

      {/* 6. Store marquee */}
      <StoreMarquee />

      {/* Bottom action area */}
      <View style={styles.actionsBlock}>
        {/* Error message */}
        {error && (
          <Text style={styles.errorText} accessibilityRole="alert">
            something went wrong. try again.
          </Text>
        )}

        {/* 7. Continue with Google */}
        <AnimatedButton
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading !== null}
          accessibilityLabel="continue with google"
          hasShadow
        >
          {loading === 'google' ? (
            <ActivityIndicator color={COLORS.onSurface} size="small" />
          ) : (
            <>
              <FontAwesome
                name="google"
                size={18}
                color={COLORS.onSurface}
                style={styles.buttonIcon}
              />
              <Text style={styles.googleButtonText}>continue with google</Text>
            </>
          )}
        </AnimatedButton>

        {/* 8. Continue with Apple — iOS only */}
        {Platform.OS === 'ios' && (
          <AnimatedButton
            style={styles.appleButton}
            onPress={handleAppleSignIn}
            disabled={loading !== null}
            accessibilityLabel="continue with apple"
            hasShadow
          >
            {loading === 'apple' ? (
              <ActivityIndicator color={COLORS.onSurface} size="small" />
            ) : (
              <>
                <FontAwesome
                  name="apple"
                  size={20}
                  color={COLORS.onSurface}
                  style={styles.buttonIcon}
                />
                <Text style={styles.appleButtonText}>continue with apple</Text>
              </>
            )}
          </AnimatedButton>
        )}

        {/* 9. Legal text */}
        <Text style={styles.legalText}>
          by continuing, you agree to our{' '}
          <Text
            style={styles.legalLink}
            onPress={handleOpenTerms}
            accessibilityRole="link"
          >
            terms
          </Text>
          {' & '}
          <Text
            style={styles.legalLink}
            onPress={handleOpenPrivacy}
            accessibilityRole="link"
          >
            privacy policy
          </Text>
        </Text>
      </View>

      {/* AI Consent Overlay */}
      {showConsent && (
        <AIConsentOverlay
          onAgree={handleConsentAgree}
          onDecline={handleConsentDecline}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // -- Layout ---------------------------------------------------------------
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },


  // -- 2. Gallery (scattered collage) ----------------------------------------
  galleryWrapper: {
    alignSelf: 'center',
    width: SCREEN_WIDTH - 32,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Selfie card — center, prominent, on top
  selfieCard: {
    position: 'absolute',
    width: 120,
    height: 160,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.primaryContainer,
    overflow: 'hidden',
    zIndex: 10,
    ...SHADOWS.hardPrimary,
    ...Platform.select({ android: { elevation: 8 } }),
  },
  selfieImage: {
    width: '100%',
    height: '100%',
  },
  selfieBadge: {
    position: 'absolute',
    bottom: -1,
    alignSelf: 'center',
    backgroundColor: COLORS.primaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  selfieBadgeText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 9,
    color: COLORS.background,
    textTransform: 'lowercase',
    letterSpacing: 0.5,
  },

  // Try-on cards — smaller, scattered around selfie
  tryonCard: {
    position: 'absolute',
    width: 100,
    height: 133,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    backgroundColor: COLORS.surfaceContainerLowest,
    overflow: 'hidden',
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  tryonImage: {
    width: '100%',
    height: '100%',
  },

  // Try-on positions (scattered like Stitch mood board)
  tryonTopLeft: {
    top: 0,
    left: 0,
    transform: [{ rotate: '-8deg' }],
    zIndex: 3,
  },
  tryonTopRight: {
    top: 10,
    right: 0,
    transform: [{ rotate: '6deg' }],
    zIndex: 2,
  },
  tryonBottomRight: {
    bottom: 0,
    right: 20,
    transform: [{ rotate: '-4deg' }],
    zIndex: 5,
  },
  tryonBottomLeft: {
    bottom: 10,
    left: 10,
    transform: [{ rotate: '5deg' }],
    zIndex: 4,
  },

  // Logo stamp — real brand logo tilted like a stamp
  logoStamp: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.surfaceContainerLowest,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: COLORS.onSurface,
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  logoStampImage: {
    width: 36,
    height: 14,
  },

  // -- 3/4/5. Headline block ------------------------------------------------
  headlineBlock: {
    gap: 10,
    alignItems: 'center',
  },
  // Stitch: text-7xl font-black leading-[0.8] tracking-tighter center
  // Web: 72px → Mobile: 38px
  headline: {
    fontFamily: FONTS.headline,
    fontSize: 68,
    color: COLORS.onSurface,
    letterSpacing: -3,
    lineHeight: 68,
    textTransform: 'lowercase',
    textAlign: 'center',
  },
  headlineTight: {
    marginTop: -14,
  },
  headlineAccent: {
    color: COLORS.primary,
  },
  // Stitch: text-xl font-medium center → 20px/500
  // Mobile: 15px
  subtext: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    lineHeight: 22,
    textAlign: 'center',
  },

  // -- 6. Marquee -----------------------------------------------------------
  marqueeContainer: {
    height: 68,
    overflow: 'hidden',
    marginHorizontal: -24, // bleed to screen edges
  },
  marqueeRow: {
    height: 30,
    overflow: 'hidden',
    marginBottom: 8,
  },
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: MARQUEE_GAP,
  },
  marqueeLogo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    opacity: 0.6,
  },
  marqueeFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  marqueeFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },

  // -- Actions block --------------------------------------------------------
  actionsBlock: {
    gap: 12,
  },

  // -- Error ----------------------------------------------------------------
  errorText: {
    fontFamily: FONTS.bodyMedium,
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
  },

  // -- 7. Google button -----------------------------------------------------
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  // Stitch: text-xl font-bold tracking-tight → 20px/700/-0.025em
  // Mobile: 17px
  googleButtonText: {
    fontFamily: FONTS.headline,
    fontSize: 17,
    color: COLORS.onSurface,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },

  // -- 8. Apple button — white with hard shadow, same as Google (Stitch style)
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  appleButtonText: {
    fontFamily: FONTS.headline,
    fontSize: 17,
    color: COLORS.onSurface,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },
  buttonIcon: {
    marginRight: 10,
  },

  // -- 9. Legal ------------------------------------------------------------
  // Stitch: text-sm font-body opacity-70 → 14px/400/0.7
  // Mobile: 12px
  legalText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    opacity: 0.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
});
