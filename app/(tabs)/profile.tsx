import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/services/store';
import { saveSelfie, deleteSelfie, uploadSelfieAndSaveKey } from '@/utils/imageUtils';
import { resetChat } from '@/services/gemini';

export default function ProfileScreen() {
  const {
    selfieUri,
    setSelfieUri,
    setSelfieS3Key,
    clearMessages,
    setMode,
    setCurrentUrl,
  } = useAppStore();
  const [updating, setUpdating] = useState(false);

  const retakeSelfie = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setUpdating(true);
      try {
        await deleteSelfie();
        const newUri = await saveSelfie(result.assets[0].uri);
        setSelfieUri(newUri);
        try {
          const s3Key = await uploadSelfieAndSaveKey(newUri);
          setSelfieS3Key(s3Key);
        } catch (uploadErr) {
          console.error('☁️ [Profile] S3 selfie upload failed:', uploadErr);
        }
        Alert.alert('Updated!', 'Your selfie has been updated.');
      } catch (err) {
        Alert.alert('Error', 'Failed to update selfie.');
      } finally {
        setUpdating(false);
      }
    }
  };

  const takeNewSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setUpdating(true);
      try {
        await deleteSelfie();
        const newUri = await saveSelfie(result.assets[0].uri);
        setSelfieUri(newUri);
        try {
          const s3Key = await uploadSelfieAndSaveKey(newUri);
          setSelfieS3Key(s3Key);
        } catch (uploadErr) {
          console.error('☁️ [Profile] S3 selfie upload failed:', uploadErr);
        }
        Alert.alert('Updated!', 'Your selfie has been updated.');
      } catch (err) {
        Alert.alert('Error', 'Failed to update selfie.');
      } finally {
        setUpdating(false);
      }
    }
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

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Profile</Text>

          {/* Selfie section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>YOUR PHOTO</Text>
            <View style={styles.selfieContainer}>
              {selfieUri ? (
                <View style={styles.selfieBorder}>
                  <Image source={{ uri: selfieUri }} style={styles.selfie} />
                </View>
              ) : (
                <View style={[styles.selfie, styles.selfiePlaceholder]}>
                  <Text style={styles.placeholderText}>No photo</Text>
                </View>
              )}
            </View>
            <View style={styles.selfieActions}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={takeNewSelfie}
                disabled={updating}
              >
                <Text style={styles.btnPrimaryText}>Take New Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={retakeSelfie}
                disabled={updating}
              >
                <Text style={styles.btnSecondaryText}>Choose from Gallery</Text>
              </TouchableOpacity>
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
    letterSpacing: -0.5,
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
  selfieContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  selfieBorder: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(232,200,160,0.25)',
  },
  selfie: {
    width: 150,
    height: 200,
    borderRadius: 18,
  },
  selfiePlaceholder: {
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 14,
  },
  selfieActions: {
    gap: 10,
  },
  btnPrimary: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#E8C8A0',
  },
  btnPrimaryText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  btnSecondaryText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
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
