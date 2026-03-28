import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { COLORS, FONTS, BORDERS, BORDER_RADIUS, SHADOWS, SPACING } from '@/theme';

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
}

export default class CrashBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(`[mrigAI] ${this.props.name || 'Component'} crashed:`, error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconOuter}>
            {Platform.OS === 'android' && (
              <View style={[StyleSheet.absoluteFill, styles.iconAndroidShadow, {
                top: 4, left: 4, right: -4, bottom: -4,
              }]} />
            )}
            <View style={styles.icon}>
              <Text style={styles.iconText}>!</Text>
            </View>
          </View>
          <Text style={styles.title}>something went wrong</Text>
          <Text style={styles.subtitle}>
            {this.props.name ? `${this.props.name} crashed` : 'an error occurred'}
          </Text>
          <View style={styles.btnOuter}>
            {Platform.OS === 'android' && (
              <View style={[StyleSheet.absoluteFill, styles.btnAndroidShadow, {
                top: 4, left: 4, right: -4, bottom: -4,
              }]} />
            )}
            <Pressable
              style={styles.btn}
              onPress={() => this.setState({ hasError: false })}
            >
              <Text style={styles.btnText}>tap to retry</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: SPACING.md,
  },
  iconOuter: {
    marginBottom: SPACING.sm,
    ...Platform.select({ android: { paddingRight: 4, paddingBottom: 4 } }),
  },
  iconAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ ios: SHADOWS.hardSmall }),
  },
  iconText: {
    color: COLORS.primaryContainer,
    fontSize: 24,
    fontWeight: '800',
  },
  title: {
    fontFamily: FONTS.headline,
    color: COLORS.onSurface,
    fontSize: 18,
    textTransform: 'lowercase',
  },
  subtitle: {
    fontFamily: FONTS.body,
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    textTransform: 'lowercase',
  },
  btnOuter: {
    marginTop: SPACING.md,
    ...Platform.select({ android: { paddingRight: 4, paddingBottom: 4 } }),
  },
  btnAndroidShadow: {
    backgroundColor: COLORS.onSurface,
    borderRadius: BORDER_RADIUS.md,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.primaryContainer,
    ...Platform.select({ ios: SHADOWS.hardSmall }),
  },
  btnText: {
    fontFamily: FONTS.headline,
    color: COLORS.onPrimary,
    fontSize: 15,
    textTransform: 'lowercase',
  },
});
