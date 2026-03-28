import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/services/store';
import { saveSelfie, deleteSelfie, saveSelfieUris, saveSelfieS3Keys, uploadSelfieAndSaveKey, imageUriToBase64 } from '@/utils/imageUtils';
import { resetChat } from '@/services/gemini';
import * as api from '@/services/api';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { isDemoMode } from '@/utils/constants';
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS } from '@/utils/analytics';
import { COLORS, FONTS, SHADOWS, BORDER_RADIUS, BORDERS, SPACING } from '@/theme';

const MAX_PHOTOS = 3;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_ROW_GAP = SPACING.sm;
const SMALL_SLOT_SIZE = (SCREEN_WIDTH - SPACING.xl * 2 - PHOTO_ROW_GAP) / 2;

// ---------------------------------------------------------------------------
// AccountSection
// ---------------------------------------------------------------------------

interface AccountSectionProps {
  selfieUri: string | null;
}

function AccountSection({ selfieUri }: AccountSectionProps) {
  const { user } = useUser();

  if (!user) return null;

  const avatarSource = selfieUri ? { uri: selfieUri } : user.imageUrl ? { uri: user.imageUrl } : null;

  return (
    <View style={styles.accountCard}>
      {avatarSource && (
        <View style={styles.avatarBoxOuter}>
          {Platform.OS === 'android' && (
            <View style={[StyleSheet.absoluteFill, styles.avatarBoxAndroidShadow, {
              top: 4, left: 4, right: -4, bottom: -4,
            }]} />
          )}
          <View style={styles.avatarBox}>
            <Image source={avatarSource} style={styles.avatarImage} />
          </View>
        </View>
      )}
      <View style={styles.accountInfo}>
        <Text style={styles.accountName}>{(user.fullName || 'user').toLowerCase()}</Text>
        <Text style={styles.accountEmail}>
          {(user.primaryEmailAddress?.emailAddress || '').toLowerCase()}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SignOutButton
// ---------------------------------------------------------------------------

function SignOutButton() {
  const { signOut } = useAuth();
  const posthog = usePostHog();

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          posthog?.capture(ANALYTICS_EVENTS.SIGN_OUT);
          const { setSelfieUris, setSelfieS3Keys, setOnboardingComplete, clearMessages, setSavedTryOns, setHistoryLoaded } = useAppStore.getState();
          await deleteSelfie();
          setSelfieUris([]);
          setSelfieS3Keys([]);
          setOnboardingComplete(false);
          clearMessages();
          setSavedTryOns([]);
          setHistoryLoaded(false);
          await signOut();
        },
      },
    ]);
  }, [posthog, signOut]);

  return (
    <TouchableOpacity
      style={styles.signOutBtn}
      onPress={handleSignOut}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="sign out"
    >
      <Text style={styles.signOutText}>sign out</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const {
    selfieUris,
    setSelfieUris,
    selfieS3Keys,
    setSelfieS3Keys,
    setOnboardingComplete,
    clearMessages,
    setCurrentUrl,
    preferredModel,
    setPreferredModel,
  } = useAppStore();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const [updating, setUpdating] = useState(false);
  const [statusText, setStatusText] = useState('');

  // -------------------------------------------------------------------------
  // Image picking — swapped to expo-image-picker
  // -------------------------------------------------------------------------

  const pickImageForSlot = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        await handleAddPhoto(result.assets[0].uri);
      }
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Pick failed:', err);
    }
  }, []);

  const takePhotoForSlot = useCallback(async () => {
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
        await handleAddPhoto(result.assets[0].uri);
      }
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Camera failed:', err);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Core photo logic — preserved exactly
  // -------------------------------------------------------------------------

  const handleAddPhoto = async (uri: string) => {
    const currentUris = useAppStore.getState().selfieUris;
    const currentKeys = useAppStore.getState().selfieS3Keys;
    if (!uri || currentUris.length >= MAX_PHOTOS) return;
    setUpdating(true);
    setStatusText('Saving photo...');
    try {
      const savedUri = await saveSelfie(uri);
      const newUris = [...currentUris, savedUri];
      await saveSelfieUris(newUris);
      setSelfieUris(newUris);
      posthog?.capture(ANALYTICS_EVENTS.SELFIE_ADDED);

      if (newUris.length === 1) {
        setStatusText('Analyzing your photo...');
        try {
          const b64 = await imageUriToBase64(savedUri);
          const desc = await api.describeSelfie(b64);
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem('selfie_description', desc);
        } catch (descErr: any) {
          await saveSelfieUris(currentUris);
          setSelfieUris(currentUris);
          api.sendLogs([{ tag: 'Profile', msg: `Selfie description failed: ${descErr.message}` }]).catch(() => {});
          Alert.alert('Error', 'Could not process your selfie. Please try again.');
          setUpdating(false);
          setStatusText('');
          return;
        }
      }

      setOnboardingComplete(true);

      setStatusText('Uploading...');
      const allBase64s = await Promise.all(newUris.map(u => imageUriToBase64(u)));
      await Promise.all([
        (async () => {
          try {
            const s3Key = await uploadSelfieAndSaveKey(savedUri);
            const freshKeys = useAppStore.getState().selfieS3Keys;
            const newKeys = [...freshKeys, s3Key];
            await saveSelfieS3Keys(newKeys);
            setSelfieS3Keys(newKeys);
          } catch (uploadErr) {
            api.sendLogs([{ tag: 'Profile', msg: `S3 upload failed: ${(uploadErr as any).message}` }]).catch(() => {});
          }
        })(),
        api.cacheSelfies(allBase64s).catch((err: any) => {
          console.warn('[Profile] Backend cache failed:', err.message);
        }),
      ]);

      setStatusText('');
    } catch (err) {
      Alert.alert('Error', 'Failed to add photo.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const currentUris = useAppStore.getState().selfieUris;
          const currentKeys = useAppStore.getState().selfieS3Keys;
          const removedUri = currentUris[index];
          const newUris = currentUris.filter((_, i) => i !== index);
          const newKeys = currentKeys.filter((_, i) => i !== index);

          setUpdating(true);

          try {
            const { File } = require('expo-file-system');
            const file = new File(removedUri);
            if (file.exists) file.delete();
          } catch {}

          if (newUris.length === 0) {
            setStatusText('Resetting...');
            await deleteSelfie();
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            await AsyncStorage.removeItem('selfie_description');
            setSelfieUris([]);
            setSelfieS3Keys([]);
            setOnboardingComplete(false);
            api.cacheSelfies([]).catch(() => {});
            setUpdating(false);
            setStatusText('');
            return;
          }

          await saveSelfieUris(newUris);
          await saveSelfieS3Keys(newKeys);
          setSelfieUris(newUris);
          setSelfieS3Keys(newKeys);

          if (index === 0) {
            setStatusText('Analyzing your photo...');
            try {
              const b64 = await imageUriToBase64(newUris[0]);
              const desc = await api.describeSelfie(b64);
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              await AsyncStorage.setItem('selfie_description', desc);
            } catch (descErr: any) {
              api.sendLogs([{ tag: 'Profile', msg: `Selfie re-description failed: ${descErr.message}` }]).catch(() => {});
              Alert.alert('Warning', 'Could not re-analyze your primary photo.');
            }
          }

          setStatusText('Updating...');
          try {
            const allBase64s = await Promise.all(newUris.map(u => imageUriToBase64(u)));
            await api.cacheSelfies(allBase64s);
          } catch (err: any) {
            console.warn('[Profile] Backend cache update after delete failed:', err.message);
          }

          setUpdating(false);
          setStatusText('');
        },
      },
    ]);
  };

  const handleEmptySlotTap = useCallback(() => {
    Alert.alert('Add Photo', 'Choose a method', [
      { text: 'Take Photo', onPress: takePhotoForSlot },
      { text: 'Choose from Gallery', onPress: pickImageForSlot },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [takePhotoForSlot, pickImageForSlot]);

  const handleClearChat = () => {
    Alert.alert('Clear Chat', 'This will clear all chat history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearMessages();
          resetChat();
          setCurrentUrl(null);
        },
      },
    ]);
  };

  // Build the 3-slot array
  const slots: Array<{ uri: string | null; index: number }> = [];
  for (let i = 0; i < MAX_PHOTOS; i++) {
    slots.push({ uri: selfieUris[i] || null, index: i });
  }

  const primarySlot = slots[0];
  const secondarySlots = [slots[1], slots[2]];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerBlock}>
          <Text style={styles.headline}>
            {'all about\n'}
            <Text style={styles.headlineAccent}>you.</Text>
          </Text>
          <Text style={styles.subtitle}>
            your photos. your account. all here.
          </Text>
        </View>

        {/* Selfie Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>your photos</Text>

          {/* Row 1: Primary selfie — full width, 3:4 */}
          <View style={styles.primarySlotContainer}>
            {primarySlot.uri ? (
              <View style={styles.filledSlotLarge}>
                {Platform.OS === 'android' && (
                  <View style={[StyleSheet.absoluteFill, styles.filledSlotAndroidShadow, {
                    top: 4, left: 4, right: -4, bottom: -4,
                  }]} />
                )}
                <View style={styles.filledSlotBorder}>
                  <Image source={{ uri: primarySlot.uri }} style={styles.filledImage} resizeMode="cover" />
                </View>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => handleRemovePhoto(0)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  disabled={updating}
                  accessibilityRole="button"
                  accessibilityLabel="remove primary photo"
                >
                  <View style={styles.removeBtnInner}>
                    <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.emptySlotLarge}
                onPress={handleEmptySlotTap}
                activeOpacity={0.7}
                disabled={updating}
                accessibilityRole="button"
                accessibilityLabel="add your first photo"
              >
                <FontAwesome name="plus" size={24} color={COLORS.onSurfaceVariant} />
                <Text style={styles.emptySlotLabel}>add photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Row 2: Two square slots side by side */}
          <View style={styles.secondaryRow}>
            {secondarySlots.map((slot) => (
              <View key={slot.index} style={styles.secondarySlotContainer}>
                {slot.uri ? (
                  <View style={styles.filledSlotSquare}>
                    {Platform.OS === 'android' && (
                      <View style={[StyleSheet.absoluteFill, styles.filledSlotAndroidShadow, {
                        top: 4, left: 4, right: -4, bottom: -4,
                      }]} />
                    )}
                    <View style={styles.filledSlotBorder}>
                      <Image source={{ uri: slot.uri }} style={styles.filledImage} resizeMode="cover" />
                    </View>
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => handleRemovePhoto(slot.index)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      disabled={updating}
                      accessibilityRole="button"
                      accessibilityLabel={`remove photo ${slot.index + 1}`}
                    >
                      <View style={styles.removeBtnInner}>
                        <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                      </View>
                    </Pressable>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.emptySlotSquare}
                    onPress={handleEmptySlotTap}
                    activeOpacity={0.7}
                    disabled={updating || slot.index > selfieUris.length}
                    accessibilityRole="button"
                    accessibilityLabel="add another photo"
                  >
                    <FontAwesome name="plus" size={20} color={COLORS.onSurfaceVariant} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* Status/Loading */}
          {updating && statusText ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={COLORS.primaryContainer} />
              <Text style={styles.statusText}>{statusText.toLowerCase()}</Text>
            </View>
          ) : null}
        </View>

        {/* Account + Sign Out */}
        {!isDemoMode() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>your account</Text>
            <AccountSection selfieUri={selfieUris[0] || null} />
            <View style={{ marginTop: SPACING.md }}>
              <SignOutButton />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.xl,
  },

  // Header
  headerBlock: {
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: COLORS.onSurfaceVariant,
    lineHeight: 22,
    textTransform: 'lowercase',
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

  // Sections
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontFamily: FONTS.headline,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textTransform: 'lowercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },

  // Account card
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    gap: SPACING.md,
  },
  avatarBoxOuter: {
    width: 60,
    height: 60,
    ...Platform.select({ android: { paddingRight: 4, paddingBottom: 4, width: 64, height: 64 } }),
  },
  avatarBoxAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  avatarBox: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    overflow: 'hidden',
    ...Platform.select({ ios: SHADOWS.hardSmall }),
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontFamily: FONTS.headline,
    fontSize: 16,
    color: COLORS.onSurface,
    textTransform: 'lowercase',
    marginBottom: 2,
  },
  accountEmail: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textTransform: 'lowercase',
  },

  // Photo slots — Row 1: primary large
  primarySlotContainer: {
    marginBottom: PHOTO_ROW_GAP,
  },
  filledSlotLarge: {
    width: '100%',
    height: 300,
  },
  emptySlotLarge: {
    width: '100%',
    height: 300,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptySlotLabel: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    textTransform: 'lowercase',
  },

  // Photo slots — Row 2: two squares
  secondaryRow: {
    flexDirection: 'row',
    gap: PHOTO_ROW_GAP,
    marginBottom: SPACING.md,
  },
  secondarySlotContainer: {
    width: SMALL_SLOT_SIZE,
    height: SMALL_SLOT_SIZE,
  },
  filledSlotSquare: {
    width: '100%',
    height: '100%',
  },
  emptySlotSquare: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Shared filled-slot styles
  filledSlotAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  filledSlotBorder: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    overflow: 'hidden',
    ...Platform.select({ ios: SHADOWS.hardSmall }),
  },
  filledImage: {
    width: '100%',
    height: '100%',
  },

  // Remove button — red circle top-right
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

  // Primary badge
  primaryBadge: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: SPACING.sm,
  },
  primaryBadgeText: {
    fontFamily: FONTS.headline,
    fontSize: 10,
    color: COLORS.onPrimary,
    textTransform: 'lowercase',
    backgroundColor: COLORS.onSurface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },

  // Status row
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  statusText: {
    fontFamily: FONTS.bodyMedium,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    textTransform: 'lowercase',
  },

  // Sign out button
  signOutBtn: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  signOutText: {
    fontFamily: FONTS.headline,
    fontSize: 15,
    color: COLORS.error,
    textTransform: 'lowercase',
  },
});
