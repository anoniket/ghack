import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import ChatInterface from '@/components/ChatInterface';
import WebViewBrowser from '@/components/WebViewBrowser';
import ChatBubble from '@/components/ChatBubble';
import OnboardingCamera from '@/components/OnboardingCamera';
import { useAppStore } from '@/services/store';
import { getSelfieUri, getSavedTryOns } from '@/utils/imageUtils';

export default function HomeScreen() {
  const {
    onboardingComplete,
    setOnboardingComplete,
    setSelfieUri,
    setSavedTryOns,
    mode,
    setCurrentProduct,
  } = useAppStore();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    const selfie = await getSelfieUri();
    if (selfie) {
      setSelfieUri(selfie);
      setOnboardingComplete(true);
    }
    const tryOns = await getSavedTryOns();
    setSavedTryOns(tryOns);
  };

  const handleTryOnRequest = (data: {
    imageUrl: string;
    productName: string;
    productPrice?: string;
    pageUrl?: string;
  }) => {
    console.log('🏠 [Home] Try-on request received from WebView');
    console.log('🏠 [Home] Product:', data.productName, '| Price:', data.productPrice);
    console.log('🏠 [Home] Image:', data.imageUrl);
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
