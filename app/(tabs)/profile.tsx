import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageCropPicker from 'react-native-image-crop-picker';
import { useAppStore } from '@/services/store';
import { saveSelfie, deleteSelfie, saveSelfieUris, saveSelfieS3Keys, uploadSelfieAndSaveKey, imageUriToBase64 } from '@/utils/imageUtils';
import { resetChat } from '@/services/gemini';
import * as api from '@/services/api';

const MAX_PHOTOS = 3;
const SLOT_WIDTH = 100;
const SLOT_HEIGHT = 133; // ~3:4 ratio

export default function ProfileScreen() {
  const {
    selfieUris,
    setSelfieUris,
    selfieS3Keys,
    setSelfieS3Keys,
    setOnboardingComplete,
    clearMessages,
    setMode,
    setCurrentUrl,
    preferredModel,
    setPreferredModel,
  } = useAppStore();
  const [updating, setUpdating] = useState(false);
  const [statusText, setStatusText] = useState('');

  const pickImageForSlot = async () => {
    try {
      const image = await ImageCropPicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        freeStyleCropEnabled: true,
        width: 2000,
        height: 2000,
        compressImageQuality: 1,
      });
      await handleAddPhoto(image.path);
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Pick failed:', err);
    }
  };

  const takePhotoForSlot = async () => {
    try {
      const image = await ImageCropPicker.openCamera({
        cropping: true,
        freeStyleCropEnabled: true,
        width: 2000,
        height: 2000,
        compressImageQuality: 1,
      });
      await handleAddPhoto(image.path);
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Camera failed:', err);
    }
  };

  const handleAddPhoto = async (uri: string) => {
    if (!uri || selfieUris.length >= MAX_PHOTOS) return;
    setUpdating(true);
    setStatusText('Saving photo...');
    try {
      const savedUri = await saveSelfie(uri);
      const newUris = [...selfieUris, savedUri];
      await saveSelfieUris(newUris);
      setSelfieUris(newUris);
      setOnboardingComplete(true);

      // If this is the first photo (slot 0), run describeSelfie
      if (newUris.length === 1) {
        setStatusText('Analyzing your photo...');
        try {
          const b64 = await imageUriToBase64(savedUri);
          const desc = await api.describeSelfie(b64);
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem('selfie_description', desc);
        } catch (descErr: any) {
          api.sendLogs([{ tag: 'Profile', msg: `Selfie description failed: ${descErr.message}` }]).catch(() => {});
          Alert.alert('Error', 'Could not process your selfie. Please try again.');
          setUpdating(false);
          setStatusText('');
          return;
        }
      }

      // Upload to S3 + update backend cache — in parallel
      setStatusText('Uploading...');
      const allBase64s = await Promise.all(newUris.map(u => imageUriToBase64(u)));
      await Promise.all([
        // S3 upload
        (async () => {
          try {
            const s3Key = await uploadSelfieAndSaveKey(savedUri);
            const newKeys = [...selfieS3Keys, s3Key];
            await saveSelfieS3Keys(newKeys);
            setSelfieS3Keys(newKeys);
          } catch (uploadErr) {
            api.sendLogs([{ tag: 'Profile', msg: `S3 upload failed: ${(uploadErr as any).message}` }]).catch(() => {});
          }
        })(),
        // Backend cache update
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
          const newUris = selfieUris.filter((_, i) => i !== index);
          const newKeys = selfieS3Keys.filter((_, i) => i !== index);

          // If all photos removed, reset onboarding
          if (newUris.length === 0) {
            setUpdating(true);
            setStatusText('Resetting...');
            await deleteSelfie();
            setSelfieUris([]);
            setSelfieS3Keys([]);
            setOnboardingComplete(false);
            setUpdating(false);
            setStatusText('');
            return;
          }

          // If primary (index 0) was removed, re-run describeSelfie on new first photo
          if (index === 0) {
            setUpdating(true);
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
            setUpdating(false);
            setStatusText('');
          }

          await saveSelfieUris(newUris);
          await saveSelfieS3Keys(newKeys);
          setSelfieUris(newUris);
          setSelfieS3Keys(newKeys);
        },
      },
    ]);
  };

  const handleEmptySlotTap = () => {
    Alert.alert('Add Photo', 'Choose a method', [
      { text: 'Take Photo', onPress: takePhotoForSlot },
      { text: 'Choose from Gallery', onPress: pickImageForSlot },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleClearChat = () => {
    Alert.alert('Clear Chat', 'This will clear all chat history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearMessages();
          resetChat();
          setMode('chat');
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

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Profile</Text>

          {/* Selfie section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YOUR PHOTOS</Text>
            <View style={styles.slotRow}>
              {slots.map((slot) => (
                <View key={slot.index} style={styles.slotContainer}>
                  {slot.uri ? (
                    <View style={styles.filledSlot}>
                      <View style={styles.slotBorder}>
                        <Image source={{ uri: slot.uri }} style={styles.slotImage} />
                      </View>
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => handleRemovePhoto(slot.index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        disabled={updating}
                      >
                        <View style={styles.removeBtnInner}>
                          <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                        </View>
                      </TouchableOpacity>
                      {slot.index === 0 && (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.emptySlot}
                      onPress={handleEmptySlotTap}
                      activeOpacity={0.7}
                      disabled={updating || slot.index > selfieUris.length}
                    >
                      <Text style={styles.emptySlotPlus}>+</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
            {updating && statusText ? (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color="#E8C8A0" />
                <Text style={styles.statusText}>{statusText}</Text>
              </View>
            ) : null}
          </View>

          {/* Model Switcher */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI MODEL</Text>
            <View style={styles.modelSwitcher}>
              {([
                { key: 'nb1' as const, label: 'NB1', sub: '2.5 Flash · max 2 selfies' },
                { key: 'nb2' as const, label: 'NB2', sub: '3.1 Flash · max 3 selfies' },
                { key: 'pro' as const, label: 'Pro', sub: '3 Pro · max 3 selfies' },
              ]).map(({ key, label, sub }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.modelOption, preferredModel === key && styles.modelOptionActive]}
                  onPress={() => setPreferredModel(key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modelLabel, preferredModel === key && styles.modelLabelActive]}>{label}</Text>
                  <Text style={[styles.modelSub, preferredModel === key && styles.modelSubActive]}>{sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SETTINGS</Text>
            <TouchableOpacity style={styles.settingItem} onPress={handleClearChat}>
              <Text style={styles.settingLabel}>Clear Chat History</Text>
              <Text style={styles.settingArrow}>{'\u2192'}</Text>
            </TouchableOpacity>
          </View>

          {/* About */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ABOUT</Text>
            <View style={styles.aboutCard}>
              <View style={styles.aboutLogo}>
                <Text style={styles.aboutLogoText}>AI</Text>
              </View>
              <Text style={styles.aboutName}>mrigAI</Text>
              <Text style={styles.aboutDesc}>
                Universal virtual try-on assistant.{'\n'}Works on any e-commerce website in any language.
              </Text>
              <View style={styles.aboutMeta}>
                <Text style={styles.aboutVersion}>v1.0.0</Text>
                <View style={styles.aboutDot} />
                <Text style={styles.aboutPowered}>Powered by Gemini</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    padding: 22,
    paddingBottom: 120,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F5F5F5',
    marginBottom: 28,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2,
    marginBottom: 16,
  },
  slotRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 16,
  },
  slotContainer: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
  },
  filledSlot: {
    flex: 1,
    position: 'relative',
  },
  slotBorder: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(232,200,160,0.25)',
  },
  slotImage: {
    flex: 1,
    borderRadius: 12,
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
  },
  removeBtnInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,60,60,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  primaryBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#E8C8A0',
    letterSpacing: 1,
    backgroundColor: 'rgba(13,13,13,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  emptySlot: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotPlus: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '300',
    lineHeight: 32,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  modelSwitcher: {
    flexDirection: 'row',
    gap: 10,
  },
  modelOption: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modelOptionActive: {
    borderColor: '#E8C8A0',
    backgroundColor: 'rgba(232,200,160,0.08)',
  },
  modelLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  modelLabelActive: {
    color: '#E8C8A0',
  },
  modelSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },
  modelSubActive: {
    color: 'rgba(232,200,160,0.6)',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1A1A',
    padding: 17,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  settingLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
  },
  settingArrow: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 18,
  },
  aboutCard: {
    backgroundColor: '#1A1A1A',
    padding: 24,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  aboutLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#E8C8A0',
  },
  aboutLogoText: {
    color: '#0D0D0D',
    fontSize: 14,
    fontWeight: '900',
  },
  aboutName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F5F5F5',
    marginBottom: 8,
  },
  aboutDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  aboutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aboutVersion: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
  aboutDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  aboutPowered: {
    fontSize: 12,
    color: '#E8C8A0',
    fontWeight: '600',
  },
});
