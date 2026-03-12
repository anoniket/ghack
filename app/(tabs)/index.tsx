import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import ChatInterface from '@/components/ChatInterface';
import WebViewBrowser from '@/components/WebViewBrowser';
import ChatBubble from '@/components/ChatBubble';
import OnboardingCamera from '@/components/OnboardingCamera';
import CrashBoundary from '@/components/CrashBoundary';
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

  // SS-8: Track loading state to prevent onboarding flash
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    loadInitialData().finally(() => setInitialLoading(false));
  }, []);

  const loadInitialData = async () => {
    // PERF-10: Run independent ops in parallel
    const [, selfie] = await Promise.all([
      // Initialize device ID
      getDeviceId().then((id) => setDeviceId(id)).catch((err) => {
        console.error('Failed to get device ID:', err);
      }),
      // Load selfie URI
      getSelfieUri(),
    ]);

    if (selfie) {
      setSelfieUri(selfie);
      setOnboardingComplete(true);

      // S3 key + history can load in parallel
      await Promise.all([
        // Load S3 key (or upload if missing)
        (async () => {
          let s3Key = await getSelfieS3Key();
          if (!s3Key) {
            try { s3Key = await uploadSelfieAndSaveKey(selfie); }
            catch (err) { console.error('Failed to upload selfie to S3:', err); }
          }
          if (s3Key) setSelfieS3Key(s3Key);
        })(),
        // Load saved try-ons from cloud
        getHistory().then(({ items }) => {
          setSavedTryOns(items.map((item) => ({
            id: item.sessionId,
            imageUri: item.tryonImageUrl,
            sourceUrl: item.sourceUrl,
            timestamp: new Date(item.createdAt).getTime(),
            videoUrl: item.videoUrl,
            sessionId: item.sessionId,
          })));
        }).catch((err) => {
          console.error('Failed to load history:', err);
        }),
      ]);
    } else {
      // No selfie — still try loading history (device may have data)
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
    }
  };

  const handleTryOnRequest = (data: {
    imageUrl: string;
    pageUrl?: string;
    retry?: boolean;
  }) => {
    setCurrentProduct(data);
  };

  // SS-8: Show loading state until initial data is loaded to prevent onboarding flash
  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E8C8A0" />
      </View>
    );
  }

  if (!onboardingComplete) {
    return <OnboardingCamera />;
  }

  return (
    <View style={styles.container}>
      {mode === 'chat' ? (
        <CrashBoundary name="Chat">
          <ChatInterface />
        </CrashBoundary>
      ) : (
        <CrashBoundary name="Browser">
          <View style={styles.webviewContainer}>
            <WebViewBrowser onTryOnRequest={handleTryOnRequest} />
            <ChatBubble />
          </View>
        </CrashBoundary>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewContainer: {
    flex: 1,
  },
});
