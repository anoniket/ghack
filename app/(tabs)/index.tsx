import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import ChatInterface from '@/components/ChatInterface';
import WebViewBrowser from '@/components/WebViewBrowser';
import ChatBubble from '@/components/ChatBubble';
import OnboardingCamera from '@/components/OnboardingCamera';
import { useAppStore } from '@/services/store';
import { getSelfieUri, getSelfieS3Key, uploadSelfieAndSaveKey } from '@/utils/imageUtils';
import { getDeviceId, getHistory } from '@/services/api';

export default function HomeScreen() {
  const {
    onboardingComplete,
    setOnboardingComplete,
    setSelfieUri,
    setSelfieS3Key,
    setDeviceId,
    setSavedTryOns,
    mode,
    setCurrentProduct,
  } = useAppStore();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    // Initialize device ID
    try {
      const id = await getDeviceId();
      setDeviceId(id);
    } catch (err) {
      console.error('Failed to get device ID:', err);
    }

    // Load selfie
    const selfie = await getSelfieUri();
    if (selfie) {
      setSelfieUri(selfie);
      setOnboardingComplete(true);

      // Load S3 key (or upload if missing)
      let s3Key = await getSelfieS3Key();
      if (!s3Key) {
        try {
          s3Key = await uploadSelfieAndSaveKey(selfie);
        } catch (err) {
          console.error('Failed to upload selfie to S3:', err);
        }
      }
      if (s3Key) setSelfieS3Key(s3Key);
    }

    // Load saved try-ons from cloud
    try {
      const { items } = await getHistory();
      setSavedTryOns(items.map((item) => ({
        id: item.sessionId,
        imageUri: item.tryonImageUrl,
        sourceUrl: item.sourceUrl,
        timestamp: new Date(item.createdAt).getTime(),
        videoUrl: item.videoUrl,
        sessionId: item.sessionId,
      })));
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleTryOnRequest = (data: {
    imageUrl: string;
    pageUrl?: string;
    retry?: boolean;
  }) => {
    setCurrentProduct(data);
  };

  if (!onboardingComplete) {
    return <OnboardingCamera />;
  }

  return (
    <View style={styles.container}>
      {mode === 'chat' ? (
        <ChatInterface />
      ) : (
        <View style={styles.webviewContainer}>
          <WebViewBrowser onTryOnRequest={handleTryOnRequest} />
          <ChatBubble />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  webviewContainer: {
    flex: 1,
  },
});
