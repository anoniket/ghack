import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '@/services/store';
import { COLORS, FONTS, BORDERS, BORDER_RADIUS, SHADOWS } from '@/theme';

const AI_CONSENT_KEY = '@ai_consent_given';

export async function getAiConsent(): Promise<boolean> {
  const val = await AsyncStorage.getItem(AI_CONSENT_KEY);
  return val === 'true';
}

export async function saveAiConsent(): Promise<void> {
  await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
}

interface Props {
  onAgree: () => void;
  onDecline?: () => void;
}

export default function AIConsentOverlay({ onAgree, onDecline }: Props) {
  const setAiConsentGiven = useAppStore((s) => s.setAiConsentGiven);

  const handleAgree = async () => {
    await saveAiConsent();
    setAiConsentGiven(true);
    onAgree();
  };

  const handleDecline = () => {
    if (onDecline) {
      onDecline();
      return;
    }
    Alert.alert(
      'ai processing required',
      'mrigAI uses AI to generate virtual try-ons. the app cannot function without processing your photos through our AI service.',
      [
        { text: 'go back', style: 'cancel' },
        { text: 'i agree', onPress: handleAgree },
      ],
    );
  };

  const background = Platform.OS === 'ios' ? (
    <BlurView tint="light" intensity={40} style={StyleSheet.absoluteFill} />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(250,248,245,0.92)' }]} />
  );

  return (
    <View style={styles.overlay}>
      {background}
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={styles.title}>
            before we start.
          </Text>

          <Text style={styles.body}>
            mrigAI sends your selfie photos and product images to{' '}
            <Text style={styles.bold}>google's AI (gemini)</Text> to generate
            virtual try-on results.
          </Text>

          <Text style={styles.body}>
            we do not use your photos for any other purpose.
          </Text>

          <Text style={styles.summary}>
            by tapping "i agree", you consent to your photos being sent to
            google's AI service for virtual try-on generation.
          </Text>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [
              styles.agreeBtn,
              pressed && styles.agreeBtnPressed,
            ]}
            onPress={handleAgree}
          >
            <Text style={styles.agreeBtnText}>i agree & continue</Text>
          </Pressable>

          <Pressable
            style={styles.declineBtn}
            onPress={handleDecline}
            hitSlop={8}
          >
            <Text style={styles.declineBtnText}>decline</Text>
          </Pressable>

          <View style={styles.links}>
            <Pressable
              onPress={() => Linking.openURL('https://mrigai.com/privacy-policy')}
              hitSlop={8}
            >
              <Text style={styles.linkText}>privacy policy</Text>
            </Pressable>
            <Text style={styles.linkSeparator}>|</Text>
            <Pressable
              onPress={() => Linking.openURL('https://mrigai.com/terms-of-service')}
              hitSlop={8}
            >
              <Text style={styles.linkText}>terms & conditions</Text>
            </Pressable>
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
    marginHorizontal: 24,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    overflow: 'hidden',
    ...SHADOWS.hard,
    ...Platform.select({ android: { elevation: 8 } }),
  },
  content: {
    padding: 24,
    paddingTop: 28,
  },
  title: {
    fontFamily: FONTS.headline,
    fontSize: 28,
    color: COLORS.onSurface,
    letterSpacing: -1,
    marginBottom: 18,
    textTransform: 'lowercase',
  },
  body: {
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 23,
    color: COLORS.onSurfaceVariant,
    marginBottom: 12,
  },
  bold: {
    fontFamily: FONTS.bodySemiBold,
    color: COLORS.onSurface,
  },
  summary: {
    fontFamily: FONTS.body,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.onSurfaceVariant,
    opacity: 0.6,
    marginTop: 4,
  },
  footer: {
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: COLORS.surfaceContainerHigh,
  },
  agreeBtn: {
    backgroundColor: COLORS.primaryContainer,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    alignItems: 'center',
    ...SHADOWS.hardSmall,
    ...Platform.select({ android: { elevation: 4 } }),
  },
  agreeBtnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
    ...SHADOWS.none,
  },
  agreeBtnText: {
    fontFamily: FONTS.headline,
    fontSize: 16,
    color: COLORS.onPrimary,
    textTransform: 'lowercase',
  },
  declineBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineBtnText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    opacity: 0.5,
    textTransform: 'lowercase',
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  linkText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    opacity: 0.4,
    textDecorationLine: 'underline',
  },
  linkSeparator: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    opacity: 0.2,
    marginHorizontal: 8,
  },
});
