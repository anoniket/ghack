import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { saveSelfie, uploadSelfieAndSaveKey } from '@/utils/imageUtils';
import { useAppStore } from '@/services/store';

export default function OnboardingCamera() {
  const { width: W } = useWindowDimensions();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { setSelfieUri, setSelfieS3Key, setOnboardingComplete } = useAppStore();

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Camera permission is needed for selfie capture.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const confirmPhoto = async () => {
    if (!imageUri) return;
    setSaving(true);
    try {
      const savedUri = await saveSelfie(imageUri);
      setSelfieUri(savedUri);

      // Upload to S3 in background
      try {
        const s3Key = await uploadSelfieAndSaveKey(savedUri);
        setSelfieS3Key(s3Key);
      } catch (uploadErr) {
        console.error('S3 selfie upload failed:', uploadErr);
        // Continue anyway — will retry on next app launch
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
