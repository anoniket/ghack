import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Platform,
  Animated,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebViewBrowser from '@/components/WebViewBrowser';
import CrashBoundary from '@/components/CrashBoundary';
import { useAppStore } from '@/services/store';
import { COLORS, FONTS, BORDER_RADIUS, BORDERS, SPACING } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 16;
const GRID_COLS = 2;
const CARD_SIZE = (SCREEN_WIDTH - SPACING.xl * 2 - GRID_GAP) / GRID_COLS;

// Colored shadow backgrounds for each card (alternating, Stitch-style)
const SHADOW_COLORS = [
  COLORS.onSurface,        // black
  COLORS.primaryContainer, // red
  COLORS.tertiary,         // teal
  COLORS.secondary,        // purple
  COLORS.primary,          // deep red
  COLORS.tertiaryFixed,    // mint
  COLORS.secondaryContainer, // light purple
  COLORS.onSurface,        // black
  COLORS.primaryContainer, // red
  COLORS.tertiary,         // teal
  COLORS.secondary,        // purple
  COLORS.primary,          // deep red
];

// Slight rotation per card for sticker feel
const CARD_ROTATIONS = [
  '1deg', '-2deg', '2deg', '-1deg',
  '-2deg', '3deg', '-1deg', '2deg',
  '1deg', '-3deg', '2deg', '-2deg',
];

// Store data
const STORES = [
  { key: 'myntra', name: 'myntra', url: 'https://www.myntra.com', logo: require('@/assets/images/store-logos/myntra.png') },
  { key: 'ajio', name: 'ajio', url: 'https://www.ajio.com', logo: require('@/assets/images/store-logos/ajio.png') },
  { key: 'zara', name: 'zara', url: 'https://www.zara.com/in', logo: require('@/assets/images/store-logos/zara.png') },
  { key: 'hm', name: 'h&m', url: 'https://www2.hm.com/en_in/index.html', logo: require('@/assets/images/store-logos/hm.png') },
  { key: 'nike', name: 'nike', url: 'https://www.nike.com/in', logo: require('@/assets/images/store-logos/nike.png') },
  { key: 'puma', name: 'puma', url: 'https://in.puma.com', logo: require('@/assets/images/store-logos/puma.png') },
  { key: 'snitch', name: 'snitch', url: 'https://www.snitch.com', logo: require('@/assets/images/store-logos/snitch.png') },
  { key: 'westside', name: 'westside', url: 'https://www.westside.com', logo: require('@/assets/images/store-logos/westside.png') },
  { key: 'tatacliq', name: 'tata cliq', url: 'https://www.tatacliq.com', logo: require('@/assets/images/store-logos/tatacliq.png') },
  { key: 'fabindia', name: 'fabindia', url: 'https://www.fabindia.com', logo: require('@/assets/images/store-logos/fabindia.png') },
  { key: 'shein', name: 'shein', url: 'https://www.shein.in', logo: require('@/assets/images/store-logos/shein.png') },
  { key: 'amazon', name: 'amazon', url: 'https://www.amazon.in/fashion', logo: require('@/assets/images/store-logos/amazon.png') },
];

// Store card with colored shadow behind it
function StoreCard({ store, index, onPress }: {
  store: typeof STORES[0];
  index: number;
  onPress: (url: string) => void;
}) {
  const shadowColor = SHADOW_COLORS[index % SHADOW_COLORS.length];
  const rotation = CARD_ROTATIONS[index % CARD_ROTATIONS.length];

  return (
    <Pressable
      onPress={() => onPress(store.url)}
      style={({ pressed }) => [
        styles.cardWrapper,
        { transform: [{ rotate: rotation }] },
        pressed && styles.cardWrapperPressed,
      ]}
    >
      {/* Colored shadow div behind the card */}
      <View style={[styles.cardShadow, { backgroundColor: shadowColor }]} />
      {/* Card face */}
      <View style={styles.card}>
        <Image
          source={store.logo}
          style={styles.cardLogo}
          resizeMode="contain"
        />
      </View>
    </Pressable>
  );
}

function ScrollDownArrow() {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 8, duration: 600, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [bounce]);

  return (
    <Animated.View style={[styles.scrollArrow, { transform: [{ translateY: bounce }] }]}>
      <FontAwesome name="chevron-down" size={14} color={COLORS.onSurfaceVariant} />
    </Animated.View>
  );
}

export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const { setCurrentUrl, setCurrentProduct } = useAppStore.getState();

  const handleStorePress = useCallback((url: string) => {
    setCurrentUrl(url);
    setActiveUrl(url);
  }, [setCurrentUrl]);

  const handleTryOnRequest = useCallback((data: {
    imageUrl: string;
    pageUrl?: string;
    retry?: boolean;
  }) => {
    setCurrentProduct(data);
  }, [setCurrentProduct]);

  const handleCloseWebView = useCallback(() => {
    setActiveUrl(null);
    setCurrentUrl(null);
  }, [setCurrentUrl]);

  // WebView mode
  if (activeUrl) {
    return (
      <CrashBoundary name="StoresBrowser">
        <View style={styles.webviewContainer}>
          <WebViewBrowser onTryOnRequest={handleTryOnRequest} onClose={handleCloseWebView} />
        </View>
      </CrashBoundary>
    );
  }

  // Store grid
  return (
    <View style={styles.screenWrapper}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerBlock}>
        <Text style={styles.headline}>
          pick your{'\n'}<Text style={styles.headlineAccent}>store.</Text>
        </Text>
        <Text style={styles.subtitle}>
          tap any store to browse and try on clothes.
        </Text>
      </View>

      {/* 2-column grid */}
      <View style={styles.grid}>
        {STORES.map((store, index) => (
          <StoreCard
            key={store.key}
            store={store}
            index={index}
            onPress={handleStorePress}
          />
        ))}
      </View>

      {/* Hint */}
      <View style={styles.hintBlock}>
        <Text style={styles.hintText}>
          or ask the ai chat to open any website
        </Text>
      </View>

    </ScrollView>
    <ScrollDownArrow />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xl,
  },
  webviewContainer: {
    flex: 1,
  },

  // Header
  headerBlock: {
    gap: SPACING.sm,
  },
  headline: {
    fontFamily: FONTS.headline,
    fontSize: 44,
    color: COLORS.onSurface,
    letterSpacing: -2,
    lineHeight: 44,
    textTransform: 'lowercase',
  },
  headlineAccent: {
    color: COLORS.primary,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    lineHeight: 22,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    justifyContent: 'center',
  },

  // Card wrapper (includes shadow)
  cardWrapper: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    position: 'relative',
  },
  cardWrapperPressed: {
    transform: [{ rotate: '0deg' }, { translateX: 4 }, { translateY: 4 }],
  },

  // Colored shadow behind card
  cardShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.md,
  },

  // Card face
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },

  // Logo inside card
  cardLogo: {
    width: CARD_SIZE - 48,
    height: 32,
  },

  // Hint
  hintBlock: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  hintText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    opacity: 0.6,
    textTransform: 'lowercase',
  },

  // Scroll down arrow — fixed bottom-right
  scrollArrow: {
    position: 'absolute',
    bottom: 120,
    right: SPACING.xl,
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
