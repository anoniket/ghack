import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageCropPicker from 'react-native-image-crop-picker';
import { saveSelfie, saveSelfieUris, saveSelfieS3Keys, uploadSelfieAndSaveKey, imageUriToBase64 } from '@/utils/imageUtils';
import { useAppStore } from '@/services/store';
import * as api from '@/services/api';

const MAX_PHOTOS = 3;

export default function OnboardingCamera() {
  const { width: W } = useWindowDimensions();
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const { setSelfieUris, setSelfieS3Keys, setOnboardingComplete } = useAppStore();

  const thumbSize = Math.min((W - 56 - 28) / 3, 100); // 3 thumbs with gaps

  const pickImage = async () => {
    try {
      const image = await ImageCropPicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        freeStyleCropEnabled: true,
        width: 2000,
        height: 2000,
        compressImageQuality: 1,
      });
      console.log(`[Picker] width=${image.width}, height=${image.height}, size=${image.size}`);
      setImageUris((prev) => [...prev, image.path]);
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Pick failed:', err);
    }
  };

  const takePhoto = async () => {
    try {
      const image = await ImageCropPicker.openCamera({
        cropping: true,
        freeStyleCropEnabled: true,
        width: 2000,
        height: 2000,
        compressImageQuality: 1,
      });
      console.log(`[Camera] width=${image.width}, height=${image.height}, size=${image.size}`);
      setImageUris((prev) => [...prev, image.path]);
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Camera failed:', err);
    }
  };

  const removePhoto = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  const addAnotherPhoto = () => {
    Alert.alert('Add Photo', 'Choose a method', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Gallery', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmPhotos = async () => {
    if (imageUris.length === 0) return;
    setSaving(true);
    setSavingStatus('Saving photos...');
    try {
      // Save all photos locally
      const savedUris: string[] = [];
      for (const uri of imageUris) {
        const savedUri = await saveSelfie(uri);
        savedUris.push(savedUri);
      }
      await saveSelfieUris(savedUris);
      setSelfieUris(savedUris);

      // Get selfie description from Gemini on FIRST photo -- must succeed before proceeding
      setSavingStatus('Analyzing your photo...');
      try {
        const b64 = await imageUriToBase64(savedUris[0]);
        const desc = await api.describeSelfie(b64);
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('selfie_description', desc);
      } catch (descErr: any) {
        api.sendLogs([{ tag: 'Onboarding', msg: `Selfie description failed: ${descErr.message}` }]).catch(() => {});
        Alert.alert('Error', 'Could not process your selfie. Please try again.');
        setSaving(false);
        setSavingStatus('');
        return;
      }

      // Upload to S3 + cache on backend — all in parallel, don't block onboarding
      setSavingStatus('Uploading...');
      const allBase64s = await Promise.all(savedUris.map(uri => imageUriToBase64(uri)));

      // Fire all 3 in parallel: S3 uploads + backend cache
      const [s3Results] = await Promise.all([
        // S3 uploads
        Promise.all(savedUris.map(async (uri) => {
          try {
            return await uploadSelfieAndSaveKey(uri);
          } catch (uploadErr) {
            api.sendLogs([{ tag: 'Onboarding', msg: `S3 upload failed: ${(uploadErr as any).message}` }]).catch(() => {});
            return null;
          }
        })),
        // Backend cache
        api.cacheSelfies(allBase64s).catch((err: any) => {
          console.warn('[Onboarding] Backend selfie cache failed:', err.message);
        }),
      ]);

      const s3Keys = s3Results.filter((k): k is string => k !== null);
      if (s3Keys.length > 0) {
        await saveSelfieS3Keys(s3Keys);
        setSelfieS3Keys(s3Keys);
      }

      setSavingStatus('');
      setOnboardingComplete(true);
    } catch (err) {
      console.error('Error saving selfies:', err);
      alert('Failed to save photos. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasPhotos = imageUris.length > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.badge}>VIRTUAL TRY-ON</Text>
            <Text style={styles.title}>Welcome to{'\n'}mrigAI</Text>
            <Text style={styles.subtitle}>
              Upload a photo of yourself to start trying on clothes from any store
            </Text>
          </View>

          {hasPhotos ? (
            <View style={styles.previewContainer}>
              {/* Thumbnail grid */}
              <View style={styles.thumbRow}>
                {imageUris.map((uri, index) => (
                  <View key={uri + index} style={[styles.thumbWrapper, { width: thumbSize, height: thumbSize * 1.33 }]}>
                    <View style={styles.thumbBorder}>
                      <Image source={{ uri }} style={[styles.thumbImage, { width: thumbSize - 4, height: thumbSize * 1.33 - 4 }]} />
                    </View>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removePhoto(index)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <View style={styles.removeBtnInner}>
                        <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                      </View>
                    </TouchableOpacity>
                    {index === 0 && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                      </View>
                    )}
                  </View>
                ))}
                {imageUris.length < MAX_PHOTOS && (
                  <TouchableOpacity
                    style={[styles.addSlot, { width: thumbSize, height: thumbSize * 1.33 }]}
                    onPress={addAnotherPhoto}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addSlotPlus}>+</Text>
                    <Text style={styles.addSlotLabel}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.photoCount}>
                {imageUris.length} of {MAX_PHOTOS} photos{imageUris.length < MAX_PHOTOS ? ' (optional)' : ''}
              </Text>

              {/* Action buttons */}
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={confirmPhotos}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <View style={{ alignItems: 'center' }}>
                      <ActivityIndicator color="#0D0D0D" />
                      {savingStatus ? <Text style={{ color: '#0D0D0D', fontSize: 12, marginTop: 4 }}>{savingStatus}</Text> : null}
                    </View>
                  ) : (
                    <Text style={styles.btnPrimaryText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={takePhoto}
                activeOpacity={0.8}
              >
                <Text style={styles.btnPrimaryText}>Take a Selfie</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={pickImage}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSecondaryText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E8C8A0',
    letterSpacing: 3,
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#F5F5F5',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  previewContainer: {
    alignItems: 'center',
    width: '100%',
  },
  thumbRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  thumbWrapper: {
    position: 'relative',
  },
  thumbBorder: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(232,200,160,0.3)',
  },
  thumbImage: {
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
  addSlot: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlotPlus: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '300',
    lineHeight: 32,
  },
  addSlotLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 2,
  },
  photoCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 24,
  },
  previewActions: {
    width: '100%',
    gap: 14,
  },
  actions: {
    width: '100%',
    gap: 14,
  },
  btnPrimary: {
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    backgroundColor: '#E8C8A0',
  },
  btnPrimaryText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '700',
  },
  btnSecondary: {
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  btnSecondaryText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
});
