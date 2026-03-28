import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import { saveSelfie, saveSelfieUris, saveSelfieS3Keys, uploadSelfieAndSaveKey, imageUriToBase64 } from '@/utils/imageUtils';
import { useAppStore } from '@/services/store';
import * as api from '@/services/api';
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS } from '@/utils/analytics';
import { COLORS, FONTS, SHADOWS, BORDER_RADIUS, BORDERS, SPACING } from '@/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_PHOTOS = 3;

// Slot dimensions for Step 1 (first photo not yet taken)
const SLOT_LARGE_W = SCREEN_WIDTH - 48; // full width minus padding
const SLOT_LARGE_H = 300;
const SLOT_SQUARE = (SCREEN_WIDTH - 48 - 8) / 2; // half width minus gap

// Slot dimensions for Step 2 (1+ photos taken)

// ---------------------------------------------------------------------------
// AnimatedButton — neo-brutalist press: shifts down+right, shadow collapses
// ---------------------------------------------------------------------------

interface AnimatedButtonProps {
  children: React.ReactNode;
  style: object;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

function AnimatedButton({
  children,
  style,
  onPress,
  disabled = false,
  accessibilityLabel,
}: AnimatedButtonProps) {
  const pressAnim = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  const handlePressIn = useCallback(() => {
    setPressed(true);
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 80,
      useNativeDriver: true,
    }).start();
  }, [pressAnim]);

  const handlePressOut = useCallback(() => {
    setPressed(false);
    Animated.timing(pressAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [pressAnim]);

  const translateX = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });
  const translateY = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });

  const isAndroid = Platform.OS === 'android';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={isAndroid ? { paddingRight: 6, paddingBottom: 6 } : undefined}>
        {/* Android: fake shadow view behind the button */}
        {isAndroid && !pressed && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                top: 6,
                left: 6,
                right: -6,
                bottom: -6,
                backgroundColor: COLORS.onSurface,
                borderRadius: BORDER_RADIUS.md,
              },
            ]}
          />
        )}
        <Animated.View
          style={[
            style,
            !isAndroid && (pressed ? SHADOWS.none : SHADOWS.hard),
            { transform: [{ translateX }, { translateY }] },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// OnboardingCamera — progressive 3-step selfie capture
// ---------------------------------------------------------------------------

export default function OnboardingCamera() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const { setSelfieUris, setSelfieS3Keys, setOnboardingComplete } = useAppStore();

  const hasPhotos = imageUris.length > 0;
  const canAddMore = imageUris.length < MAX_PHOTOS;

  // -------------------------------------------------------------------------
  // Image capture — logic preserved exactly from original
  // -------------------------------------------------------------------------

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        console.log(`[Picker] width=${asset.width}, height=${asset.height}`);
        posthog?.capture(ANALYTICS_EVENTS.ONBOARDING_SELFIE_CAPTURED);
        setImageUris((prev) => [...prev, asset.uri]);
      }
    } catch (err) {
      console.warn('Pick failed:', err);
    }
  }, [posthog]);

  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('camera access needed', 'enable camera access in settings to take a selfie.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [3, 4],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        console.log(`[Camera] width=${asset.width}, height=${asset.height}`);
        posthog?.capture(ANALYTICS_EVENTS.ONBOARDING_SELFIE_CAPTURED);
        setImageUris((prev) => [...prev, asset.uri]);
      }
    } catch (err) {
      console.warn('Camera failed:', err);
    }
  }, [posthog]);

  const removePhoto = useCallback((index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addAnotherPhoto = useCallback(() => {
    Alert.alert('add photo', 'choose a method', [
      { text: 'take photo', onPress: takePhoto },
      { text: 'choose from gallery', onPress: pickImage },
      { text: 'cancel', style: 'cancel' },
    ]);
  }, [takePhoto, pickImage]);

  // -------------------------------------------------------------------------
  // Confirm & upload — logic preserved exactly from original
  // -------------------------------------------------------------------------

  const confirmPhotos = useCallback(async () => {
    if (imageUris.length === 0) return;
    setSaving(true);
    setSavingStatus('saving photos...');
    try {
      // Save all photos locally
      const savedUris: string[] = [];
      for (const uri of imageUris) {
        const savedUri = await saveSelfie(uri);
        savedUris.push(savedUri);
      }
      await saveSelfieUris(savedUris);
      setSelfieUris(savedUris);

      // Convert all photos to base64 once — reused for description, cache, and S3
      setSavingStatus('analyzing your look...');
      const allBase64s = await Promise.all(savedUris.map(uri => imageUriToBase64(uri)));
      console.log(`[Onboarding] Converted ${allBase64s.length} photos to base64, sizes=[${allBase64s.map(b => (b.length / 1024).toFixed(0) + 'KB').join(', ')}]`);

      // Get selfie description from Gemini on FIRST photo -- must succeed before proceeding
      try {
        const desc = await api.describeSelfie(allBase64s[0]);
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('selfie_description', desc);
      } catch (descErr: unknown) {
        const descError = descErr as { message?: string };
        posthog?.capture(ANALYTICS_EVENTS.SELFIE_UPLOAD_FAILED);
        api.sendLogs([{ tag: 'Onboarding', msg: `Selfie description failed: ${descError.message}` }]).catch(() => {});
        Alert.alert('error', "couldn't process your photo. try a different one or retake it.");
        setSaving(false);
        setSavingStatus('');
        return;
      }

      // Upload to S3 + cache on backend
      setSavingStatus('uploading your photos...');

      // Fire all 3 in parallel: S3 uploads + backend cache
      const [s3Results] = await Promise.all([
        // S3 uploads
        Promise.all(savedUris.map(async (uri) => {
          try {
            return await uploadSelfieAndSaveKey(uri);
          } catch (uploadErr) {
            api.sendLogs([{ tag: 'Onboarding', msg: `S3 upload failed: ${(uploadErr as { message?: string }).message}` }]).catch(() => {});
            return null;
          }
        })),
        // Backend cache
        api.cacheSelfies(allBase64s).catch((err: unknown) => {
          const cacheErr = err as { message?: string };
          console.warn('[Onboarding] Backend selfie cache failed:', cacheErr.message);
        }),
      ]);

      const s3Keys = s3Results.filter((k): k is string => k !== null);
      if (s3Keys.length > 0) {
        await saveSelfieS3Keys(s3Keys);
        setSelfieS3Keys(s3Keys);
      }

      setSavingStatus("you're ready to try on anything");
      posthog?.capture(ANALYTICS_EVENTS.ONBOARDING_COMPLETED);
      setOnboardingComplete(true);
    } catch (err) {
      console.error('Error saving selfies:', err);
      Alert.alert('error', 'something went wrong. try again.');
    } finally {
      setSaving(false);
    }
  }, [imageUris, posthog, setSelfieUris, setSelfieS3Keys, setOnboardingComplete]);

  // -------------------------------------------------------------------------
  // Render — Step 1 (no photos) vs Step 2 (1+ photos)
  // -------------------------------------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + SPACING.lg }]}
      bounces={false}
      showsVerticalScrollIndicator={false}
    >
      {/* Headline */}
      <View style={styles.headerBlock}>
        {hasPhotos ? (
          <>
            <Text style={styles.headline}>
              nice! <Text style={styles.headlineAccent}>add more</Text>
              {'\n'}for better results.
            </Text>
            <Text style={styles.subtitle}>
              more photos with your face and body visible means better try-on results.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.headline}>
              your <Text style={styles.headlineAccent}>look.</Text>
              {'\n'}your style.
            </Text>
            <Text style={styles.subtitle}>
              add a clear photo of yourself showing your face and body till your waist. this is what we use to try on clothes for you.
            </Text>
          </>
        )}
      </View>

      {hasPhotos ? (
        <>
          {/* Step 2: Show uploaded selfie large, then 2 square add-more boxes, then CTA */}
          <Step2Slots
            imageUris={imageUris}
            canAddMore={canAddMore}
            onRemove={removePhoto}
            onAdd={addAnotherPhoto}
          />

          <View style={styles.actionsBlock}>
            {saving ? (
              <View style={[styles.btnPrimaryStatic, styles.btnPrimaryDisabled]}>
                <View style={styles.savingRow}>
                  <ActivityIndicator color={COLORS.onPrimary} size="small" />
                  {savingStatus ? (
                    <Text style={styles.savingText}>{savingStatus}</Text>
                  ) : null}
                </View>
              </View>
            ) : canAddMore ? (
              <>
                <AnimatedButton
                  style={styles.btnPrimary}
                  onPress={addAnotherPhoto}
                  disabled={false}
                  accessibilityLabel="add more photos"
                >
                  <Text style={styles.btnPrimaryText}>add more photos</Text>
                </AnimatedButton>
                <Pressable
                  onPress={confirmPhotos}
                  hitSlop={12}
                  style={styles.skipLink}
                >
                  <Text style={styles.skipLinkText}>i'll do this later</Text>
                </Pressable>
              </>
            ) : (
              <AnimatedButton
                style={styles.btnPrimary}
                onPress={confirmPhotos}
                disabled={false}
                accessibilityLabel="continue"
              >
                <Text style={styles.btnPrimaryText}>continue</Text>
              </AnimatedButton>
            )}
          </View>
        </>
      ) : (
        <>
          {/* Step 1: Big 3:4 selfie slot, then CTAs */}
          <Step1Slots />

          <View style={styles.actionsBlock}>
            <AnimatedButton
              style={styles.btnPrimary}
              onPress={takePhoto}
              disabled={false}
              accessibilityLabel="take a selfie"
            >
              <Text style={styles.btnPrimaryText}>take a selfie</Text>
            </AnimatedButton>
            <AnimatedButton
              style={styles.btnSecondary}
              onPress={pickImage}
              disabled={false}
              accessibilityLabel="choose from gallery"
            >
              <Text style={styles.btnSecondaryText}>choose from gallery</Text>
            </AnimatedButton>
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Step1Slots — one large empty slot + two small locked slots
// ---------------------------------------------------------------------------

function Step1Slots() {
  return (
    <View style={styles.slotsContainer}>
      {/* Big 3:4 selfie slot */}
      <View style={styles.slotLarge}>
        <FontAwesome name="camera" size={32} color={COLORS.outlineVariant} />
        <Text style={styles.slotLabel}>tap below to add your photo</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step2Slots — equal-sized slots: filled / empty+tappable
// ---------------------------------------------------------------------------

interface Step2SlotsProps {
  imageUris: string[];
  canAddMore: boolean;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

function Step2Slots({ imageUris, canAddMore, onRemove, onAdd }: Step2SlotsProps) {
  const renderSmallSlot = (index: number) => {
    const uri = imageUris[index];
    if (uri) {
      return (
        <FilledSlot
          key={`filled-${index}`}
          uri={uri}
          index={index}

          onRemove={onRemove}
        />
      );
    }
    if (canAddMore && index === imageUris.length) {
      return (
        <Pressable
          key={`empty-${index}`}
          style={styles.slotSquare}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="add another photo"
        >
          <FontAwesome name="plus" size={20} color={COLORS.onSurfaceVariant} />
          <Text style={styles.slotLabel}>add photo</Text>
        </Pressable>
      );
    }
    return (
      <View key={`future-${index}`} style={[styles.slotSquare, styles.slotFuture]}>
        <FontAwesome name="plus" size={20} color={COLORS.outlineVariant} />
      </View>
    );
  };

  return (
    <View style={styles.slotsContainer}>
      {/* Row 1: two square add-more slots */}
      <View style={styles.slotsRowSmall}>
        {renderSmallSlot(1)}
        {renderSmallSlot(2)}
      </View>

      {/* Row 2: primary selfie (large 3:4) */}
      <FilledSlot
        uri={imageUris[0]}
        index={0}
        onRemove={onRemove}
        isLarge
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// FilledSlot — image with remove button and optional primary badge
// ---------------------------------------------------------------------------

interface FilledSlotProps {
  uri: string;
  index: number;
  onRemove: (index: number) => void;
  isLarge?: boolean;
}

function FilledSlot({ uri, index, onRemove, isLarge }: FilledSlotProps) {
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [onRemove, index]);

  return (
    <View style={isLarge ? styles.filledSlotWrapperLarge : styles.filledSlotWrapper}>
      {Platform.OS === 'android' && (
        <View style={[StyleSheet.absoluteFill, styles.filledSlotAndroidShadow, {
          top: 4, left: 4, right: -4, bottom: -4,
        }]} />
      )}
      <View style={styles.filledSlot}>
        <Image source={{ uri }} style={styles.filledImage} resizeMode="cover" />
        {/* Checkmark badge */}
        <View style={styles.checkBadge}>
          <FontAwesome name="check" size={10} color={COLORS.onPrimary} />
        </View>
      </View>
      {/* Remove button */}
      <Pressable
        style={styles.removeBtn}
        onPress={handleRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`remove photo ${index + 1}`}
      >
        <View style={styles.removeBtnInner}>
          <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
        </View>
      </Pressable>
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
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'space-between',
  },

  // -- Header ---------------------------------------------------------------
  headerBlock: {
    gap: SPACING.md,
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

  // -- Slots container (Step 1) — 2 rows ------------------------------------
  slotsContainer: {
    gap: SPACING.sm,
  },
  slotsRowSmall: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },

  // Large empty slot (Step 1, slot 1 — full width)
  slotLarge: {
    width: SLOT_LARGE_W,
    height: SLOT_LARGE_H,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  slotIcon: {
    opacity: 0.6,
  },
  slotLabel: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textTransform: 'lowercase',
  },


  // Square slots (Step 2 — add more)
  slotSquare: {
    width: SLOT_SQUARE,
    height: SLOT_SQUARE,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  slotFuture: {
    borderColor: COLORS.outlineVariant,
    borderWidth: BORDERS.medium,
    opacity: 0.4,
  },

  // -- Filled slot ----------------------------------------------------------
  filledSlotWrapperLarge: {
    width: SLOT_LARGE_W,
    height: SLOT_LARGE_H,
  },
  filledSlotWrapper: {
    width: SLOT_SQUARE,
    height: SLOT_SQUARE,
  },
  filledSlotAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  filledSlot: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    overflow: 'hidden',
    ...Platform.select({ ios: SHADOWS.hardSmall }),
  },
  filledImage: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    bottom: SPACING.xs,
    left: SPACING.xs,
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDERS.medium,
    borderColor: COLORS.surfaceContainerLowest,
  },

  // Remove button — small red circle top-right
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
  },
  removeBtnInner: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDERS.medium,
    borderColor: COLORS.surfaceContainerLowest,
  },
  removeBtnText: {
    color: COLORS.onPrimary,
    fontSize: 16,
    fontFamily: FONTS.bodyBold,
    lineHeight: 18,
  },


  // -- Actions block --------------------------------------------------------
  actionsBlock: {
    gap: SPACING.md,
  },
  btnPrimaryStatic: {
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLink: {
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
  },
  skipLinkText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    textDecorationLine: 'underline',
    textTransform: 'lowercase',
  },

  // -- Primary CTA button (red) ---------------------------------------------
  btnPrimary: {
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryDisabled: {
    opacity: 0.9,
  },
  btnPrimaryText: {
    fontFamily: FONTS.headline,
    fontSize: 17,
    color: COLORS.onPrimary,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },

  // -- Secondary button (white) ----------------------------------------------
  btnSecondary: {
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontFamily: FONTS.headline,
    fontSize: 17,
    color: COLORS.onSurface,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
  },

  // -- Saving/processing indicator -------------------------------------------
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  savingText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 14,
    color: COLORS.onPrimary,
    textTransform: 'lowercase',
  },
});
