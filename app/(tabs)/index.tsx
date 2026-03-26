import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import ChatInterface from '@/components/ChatInterface';
import WebViewBrowser from '@/components/WebViewBrowser';
import ChatBubble from '@/components/ChatBubble';
import OnboardingCamera from '@/components/OnboardingCamera';
import CrashBoundary from '@/components/CrashBoundary';
import { useAppStore } from '@/services/store';
import { getSelfieUris, getSelfieS3Keys, saveSelfieS3Keys, uploadSelfieAndSaveKey, mapHistoryItem } from '@/utils/imageUtils';
import { getDeviceId, getHistory } from '@/services/api';

export default function HomeScreen() {
  // H16: Individual selectors for read-state, getState() for setters
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const mode = useAppStore((s) => s.mode);
  const { setOnboardingComplete, setSelfieUris, setSelfieS3Keys, setDeviceId, setSavedTryOns, setHistoryLoaded, setCurrentProduct } = useAppStore.getState();

  // SS-8: Track loading state to prevent onboarding flash
  const [initialLoading, setInitialLoading] = useState(true);
  // ERR-11: Offline detection on cold start
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    loadInitialData().finally(() => setInitialLoading(false));
  }, []);

  const loadInitialData = async () => {
    // PERF-10: Run independent ops in parallel
    const [, selfies] = await Promise.all([
      // Initialize device ID (logging only — not used for auth)
      getDeviceId().then((id) => setDeviceId(id)).catch((err) => {
        console.error('Failed to get device ID:', err);
      }),
      // Load selfie URIs (migrates from legacy single-key automatically)
      getSelfieUris(),
    ]);

    if (selfies.length > 0) {
      setSelfieUris(selfies);
      setOnboardingComplete(true);

      // S3 keys + history can load in parallel
      await Promise.all([
        // Load S3 keys (or upload selfies that don't have corresponding keys)
        (async () => {
          let s3Keys = await getSelfieS3Keys();
          // Upload any selfie URIs that don't yet have a corresponding S3 key
          if (s3Keys.length < selfies.length) {
            const updated = [...s3Keys];
            for (let i = s3Keys.length; i < selfies.length; i++) {
              try {
                const key = await uploadSelfieAndSaveKey(selfies[i]);
                updated.push(key);
              } catch (err) {
                console.error(`Failed to upload selfie ${i} to S3:`, err);
              }
            }
            s3Keys = updated;
          }
          if (s3Keys.length > 0) {
            await saveSelfieS3Keys(s3Keys);
            setSelfieS3Keys(s3Keys);
          }
        })(),
        // Load saved try-ons from cloud
        getHistory().then(({ items }) => {
          setSavedTryOns(items.map(mapHistoryItem));
          setHistoryLoaded(true);
        }).catch((err: any) => {
          console.error('Failed to load history:', err);
          // ERR-11: Detect offline on cold start
          if (err?.message === 'NETWORK_ERROR') setOffline(true);
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
        setHistoryLoaded(true);
      } catch (err: any) {
        console.error('Failed to load history:', err);
        if (err?.message === 'NETWORK_ERROR') setOffline(true);
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
        <ActivityIndicator size="large" color="#DB313F" />
      </View>
    );
  }

  // ERR-11: Offline banner on cold start — let user retry
  if (offline) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.offlineTitle}>No internet connection</Text>
        <Text style={styles.offlineText}>Check your connection and try again</Text>
        <TouchableOpacity
          style={styles.offlineBtn}
          onPress={() => {
            setOffline(false);
            setInitialLoading(true);
            loadInitialData()
              .catch(() => setOffline(true))
              .finally(() => setInitialLoading(false));
          }}
        >
          <Text style={styles.offlineBtnText}>Retry</Text>
        </TouchableOpacity>
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
    backgroundColor: '#FAF8F5',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewContainer: {
    flex: 1,
  },
  offlineTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  offlineText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginBottom: 24,
  },
  offlineBtn: {
    backgroundColor: '#E8C8A0',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  offlineBtnText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
});
