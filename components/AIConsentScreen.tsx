import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '@/services/store';

const AI_CONSENT_KEY = '@ai_consent_given';

export async function getAiConsent(): Promise<boolean> {
  const val = await AsyncStorage.getItem(AI_CONSENT_KEY);
  return val === 'true';
}

export default function AIConsentOverlay() {
  const insets = useSafeAreaInsets();
  const setAiConsentGiven = useAppStore((s) => s.setAiConsentGiven);

  const handleAgree = async () => {
    await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
    setAiConsentGiven(true);
  };

  const handleDecline = () => {
    Alert.alert(
      'AI Processing Required',
      'mrigAI uses AI to generate virtual try-ons. The app cannot function without processing your photos through our AI service.',
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'I Agree', onPress: handleAgree },
      ],
    );
  };

  const background = Platform.OS === 'ios' ? (
    <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)' }]} />
  );

  return (
    <View style={styles.overlay}>
      {background}
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.title}>How mrigAI Works</Text>

          <Text style={styles.body}>
            To generate virtual try-ons, mrigAI sends your selfie photos and
            product images to{' '}
            <Text style={styles.bold}>Google's AI service (Gemini)</Text> for
            processing.
          </Text>

          <Text style={styles.body}>
            We do not use your photos for any purpose other than generating
            try-on results.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.summary}>
            By tapping "I Agree & Continue", you consent to your photos being
            sent to Google's AI service for virtual try-on generation.
          </Text>
          <TouchableOpacity style={styles.agreeBtn} onPress={handleAgree}>
            <Text style={styles.agreeBtnText}>I Agree & Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.declineBtn} onPress={handleDecline}>
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>

          <View style={styles.links}>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://mrigai.com/privacy-policy')}
            >
              <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.linkSeparator}>|</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL('https://mrigai.com/terms-of-service')}
            >
              <Text style={styles.linkText}>Terms & Conditions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(26,26,26,0.95)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  content: {
    padding: 24,
    paddingTop: 28,
  },
  title: {
    color: '#F5F5F5',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  body: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 14,
  },
  bold: {
    color: '#F5F5F5',
    fontWeight: '600',
  },
  summary: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  footer: {
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  agreeBtn: {
    backgroundColor: '#E8C8A0',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  agreeBtnText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '700',
  },
  declineBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineBtnText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  linkText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  linkSeparator: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 12,
    marginHorizontal: 8,
  },
});
