import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { COLORS, SHADOWS } from '@/theme';

interface HardShadowBoxProps {
  children: React.ReactNode;
  shadow?: 'hard' | 'hardSmall' | 'hardPrimary';
  style?: ViewStyle;
  innerStyle?: ViewStyle;
}

const SHADOW_CONFIG = {
  hard: {
    offset: 6,
    color: COLORS.onSurface,
    iosShadow: SHADOWS.hard,
  },
  hardSmall: {
    offset: 4,
    color: COLORS.onSurface,
    iosShadow: SHADOWS.hardSmall,
  },
  hardPrimary: {
    offset: 6,
    color: COLORS.primary,
    iosShadow: SHADOWS.hardPrimary,
  },
} as const;

export default function HardShadowBox({
  children,
  shadow = 'hardSmall',
  style,
  innerStyle,
}: HardShadowBoxProps) {
  const config = SHADOW_CONFIG[shadow];
  const borderRadius =
    (innerStyle?.borderRadius as number | undefined) ?? 0;

  if (Platform.OS === 'ios') {
    return (
      <View style={[config.iosShadow, style]}>
        <View style={innerStyle}>{children}</View>
      </View>
    );
  }

  // Android: render a colored offset view behind the content
  const offset = config.offset;

  return (
    <View
      style={[
        styles.wrapper,
        // Reserve space for the shadow so it doesn't clip
        { paddingRight: offset, paddingBottom: offset },
        style,
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.shadowBack,
          {
            top: offset,
            left: offset,
            right: -offset,
            bottom: -offset,
            backgroundColor: config.color,
            borderRadius,
          },
          // Inherit border width/color from innerStyle so the shadow
          // outline matches the content box exactly
          innerStyle?.borderWidth != null && {
            borderWidth: innerStyle.borderWidth,
            borderColor: config.color,
          },
        ]}
      />
      <View style={innerStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  shadowBack: {
    position: 'absolute',
  },
});
