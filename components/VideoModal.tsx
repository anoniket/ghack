import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { VideoView, VideoPlayer } from 'expo-video';
import { COLORS, FONTS, BORDERS, BORDER_RADIUS, SPACING } from '@/theme';

interface Props {
  visible: boolean;
  player: VideoPlayer;
  onClose: () => void;
}

export default function VideoModal({ visible, player, onClose }: Props) {
  const { width: W, height: H } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.videoOverlay}>
        <View style={[styles.videoModal, { width: W * 0.9, height: H * 0.7 }]}>
          <View style={styles.videoHeader}>
            <Text style={styles.videoTitle}>try-on video</Text>
            <Pressable onPress={onClose} style={styles.videoCloseBtn}>
              <Text style={styles.videoCloseBtnText}>{'\u2715'}</Text>
            </Pressable>
          </View>
          {visible && (
            <VideoView
              player={player}
              style={styles.videoPlayer}
              contentFit="contain"
              nativeControls
              allowsFullscreen
              {...(Platform.OS === 'android' ? { surfaceType: 'textureView' } : {})}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  videoOverlay: {
    flex: 1,
    backgroundColor: `${COLORS.background}EB`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModal: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    overflow: 'hidden',
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: BORDERS.medium,
    borderBottomColor: COLORS.surfaceContainerHigh,
  },
  videoTitle: {
    fontFamily: FONTS.headline,
    color: COLORS.onSurface,
    fontSize: 17,
    textTransform: 'lowercase',
  },
  videoCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCloseBtnText: {
    color: COLORS.onSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  videoPlayer: {
    flex: 1,
    backgroundColor: COLORS.onSurface,
  },
});
