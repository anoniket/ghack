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
import { saveSelfie, uploadSelfieAndSaveKey, imageUriToBase64 } from '@/utils/imageUtils';
import { useAppStore } from '@/services/store';
import * as api from '@/services/api';

export default function OnboardingCamera() {
  const { width: W } = useWindowDimensions();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { setSelfieUri, setSelfieS3Key, setOnboardingComplete } = useAppStore();

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
      setImageUri(image.path);
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
      setImageUri(image.path);
    } catch (err: any) {
      if (err.code !== 'E_PICKER_CANCELLED') console.warn('Camera failed:', err);
    }
  };

  const confirmPhoto = async () => {
    if (!imageUri) return;
    setSaving(true);
    try {
      const savedUri = await saveSelfie(imageUri);
      setSelfieUri(savedUri);

      // Get selfie description from Gemini — must succeed before proceeding
      try {
        const b64 = await imageUriToBase64(savedUri);
        console.log('[Onboarding] Getting selfie description...');
        const desc = await api.describeSelfie(b64);
        console.log('[Onboarding] Selfie description:', desc);
        // Store in AsyncStorage so WebViewBrowser can read it
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('selfie_description', desc);
      } catch (descErr: any) {
        console.error('[Onboarding] Selfie description failed:', descErr.message);
        Alert.alert('Error', 'Could not process your selfie. Please try again.');
        setSaving(false);
        return; // Block — don't proceed without description
      }

      // Upload to S3 in background
      try {
        const s3Key = await uploadSelfieAndSaveKey(savedUri);
        setSelfieS3Key(s3Key);
      } catch (uploadErr) {
        console.error('S3 selfie upload failed:', uploadErr);
      }

      setOnboardingComplete(true);
    } catch (err) {
      console.error('Error saving selfie:', err);
      alert('Failed to save photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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

          {imageUri ? (
            <View style={styles.previewContainer}>
              <View style={styles.imageFrame}>
                <View style={styles.imageBorder}>
                  <Image source={{ uri: imageUri }} style={[styles.preview, { width: W * 0.55, height: W * 0.55 * 1.33 }]} />
                </View>
              </View>
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => setImageUri(null)}
                >
                  <Text style={styles.btnSecondaryText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={confirmPhoto}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#0D0D0D" />
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
  imageFrame: {
    marginBottom: 32,
  },
  imageBorder: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(232,200,160,0.3)',
  },
  preview: {
    borderRadius: 18,
  },
  previewActions: {
    flexDirection: 'row',
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
