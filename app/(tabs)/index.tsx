import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import ChatInterface from '@/components/ChatInterface';
import OnboardingCamera from '@/components/OnboardingCamera';
import CrashBoundary from '@/components/CrashBoundary';
import { useAppStore } from '@/services/store';
import { getSelfieUris, getSelfieS3Keys, saveSelfieS3Keys, uploadSelfieAndSaveKey, mapHistoryItem } from '@/utils/imageUtils';
import { getDeviceId, getHistory } from '@/services/api';
import { COLORS, FONTS, SPACING } from '@/theme';

export default function HomeScreen() {
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const { setOnboardingComplete, setSelfieUris, setSelfieS3Keys, setDeviceId, setSavedTryOns, setHistoryLoaded } = useAppStore.getState();

  const [initialLoading, setInitialLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    loadInitialData().finally(() => setInitialLoading(false));
  }, []);

  const loadInitialData = async () => {
    const [, selfies] = await Promise.all([
      getDeviceId().then((id) => setDeviceId(id)).catch((err) => {
        console.error('Failed to get device ID:', err);
      }),
      getSelfieUris(),
    ]);

    if (selfies.length > 0) {
      setSelfieUris(selfies);
      setOnboardingComplete(true);

      await Promise.all([
        (async () => {
          let s3Keys = await getSelfieS3Keys();
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
        getHistory().then(({ items }) => {
          setSavedTryOns(items.map(mapHistoryItem));
          setHistoryLoaded(true);
        }).catch((err: any) => {
          console.error('Failed to load history:', err);
          if (err?.message === 'NETWORK_ERROR') setOffline(true);
        }),
      ]);
    } else {
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

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryContainer} />
      </View>
    );
  }

  if (offline) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.offlineTitle}>no internet connection</Text>
        <Text style={styles.offlineText}>check your connection and try again</Text>
        <Pressable
          style={styles.offlineBtn}
          onPress={() => {
            setOffline(false);
            setInitialLoading(true);
            loadInitialData()
              .catch(() => setOffline(true))
              .finally(() => setInitialLoading(false));
          }}
        >
          <Text style={styles.offlineBtnText}>retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!onboardingComplete) {
    return <OnboardingCamera />;
  }

  return (
    <View style={styles.container}>
      <CrashBoundary name="Chat">
        <ChatInterface />
      </CrashBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineTitle: {
    fontFamily: FONTS.headline,
    color: COLORS.onSurface,
    fontSize: 18,
    marginBottom: 8,
    textTransform: 'lowercase',
  },
  offlineText: {
    fontFamily: FONTS.body,
    color: COLORS.onSurfaceVariant,
    fontSize: 14,
    marginBottom: SPACING.xl,
    textTransform: 'lowercase',
  },
  offlineBtn: {
    backgroundColor: COLORS.primaryContainer,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 4,
    borderWidth: 3,
    borderColor: COLORS.onSurface,
  },
  offlineBtnText: {
    fontFamily: FONTS.headline,
    color: COLORS.onPrimary,
    fontSize: 15,
    textTransform: 'lowercase',
  },
});
