import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { VideoView, VideoPlayer } from 'expo-video';

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
            <Text style={styles.videoTitle}>Try-On Video</Text>
            <TouchableOpacity onPress={onClose} style={styles.videoCloseBtn}>
              <Text style={styles.videoCloseBtnText}>{'\u2715'}</Text>
            </TouchableOpacity>
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

export const styles = StyleSheet.create({
  videoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModal: {
    backgroundColor: '#141414',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  videoTitle: {
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '700',
  },
  videoCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCloseBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  videoPlayer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
});
