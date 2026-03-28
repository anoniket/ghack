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
      <View style={styles.cardOuter}>
        {Platform.OS === 'android' && (
          <View style={[StyleSheet.absoluteFill, styles.cardAndroidShadow, {
            top: 6, left: 6, right: -6, bottom: -6,
          }]} />
        )}
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
            style={styles.agreeBtnOuter}
            onPress={handleAgree}
          >
            {({ pressed }) => (
              <>
                {Platform.OS === 'android' && !pressed && (
                  <View style={[StyleSheet.absoluteFill, styles.agreeBtnAndroidShadow, {
                    top: 4, left: 4, right: -4, bottom: -4,
                  }]} />
                )}
                <View style={[styles.agreeBtn, pressed && styles.agreeBtnPressed]}>
                  <Text style={styles.agreeBtnText}>i agree & continue</Text>
                </View>
              </>
            )}
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
  cardOuter: {
    marginHorizontal: 24,
    ...Platform.select({ android: { paddingRight: 6, paddingBottom: 6 } }),
  },
  cardAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  card: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    overflow: 'hidden',
    ...Platform.select({ ios: SHADOWS.hard }),
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
  agreeBtnOuter: {
    ...Platform.select({ android: { paddingRight: 4, paddingBottom: 4 } }),
  },
  agreeBtnAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  agreeBtn: {
    backgroundColor: COLORS.primaryContainer,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: BORDERS.color,
    alignItems: 'center',
    ...Platform.select({ ios: SHADOWS.hardSmall }),
  },
  agreeBtnPressed: {
    transform: [{ translateX: 4 }, { translateY: 4 }],
    ...Platform.select({ ios: SHADOWS.none }),
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
