import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAppStore } from '@/services/store';
import { PRODUCT_DETECTOR_JS } from '@/services/productDetector';
import { generateTryOn, generateVideo } from '@/services/gemini';
import { saveTryOnResult, getSavedTryOns } from '@/utils/imageUtils';

const { width: W, height: H } = Dimensions.get('window');

interface WebViewMessage {
  type: string;
  imageUrl?: string;
  productName?: string;
  productPrice?: string;
  pageUrl?: string;
  url?: string;
}

interface Props {
  onTryOnRequest: (data: {
    imageUrl: string;
    productName: string;
    productPrice?: string;
    pageUrl?: string;
  }) => void;
}

export default function WebViewBrowser({ onTryOnRequest }: Props) {
  const webViewRef = useRef<WebView>(null);
  const {
    currentUrl,
    setCurrentUrl,
    setMode,
    selfieUri,
    currentProduct,
    setCurrentProduct,
    tryOnLoading,
    setTryOnLoading,
    tryOnResult,
    setTryOnResult,
    setSavedTryOns,
    videoLoading,
    setVideoLoading,
    videoDataUri,
    setVideoDataUri,
    lastTryOnBase64,
    setLastTryOnBase64,
    lastProductName,
    setLastProductName,
  } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);

  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.muted = true;
  });

  // Update video player source when videoDataUri changes
  useEffect(() => {
    if (videoDataUri && videoPlayer) {
      videoPlayer.replace(videoDataUri);
      videoPlayer.play();
    }
  }, [videoDataUri]);

  const isLocked = tryOnLoading || videoLoading;

  // Trigger try-on generation when currentProduct is set
  useEffect(() => {
    if (currentProduct && selfieUri && !tryOnResult && !tryOnLoading) {
      console.log('🎭 [TryOn] Product received, starting try-on generation');
      console.log('🎭 [TryOn] Product:', currentProduct.productName);
      console.log('🎭 [TryOn] Image URL:', currentProduct.imageUrl);
      console.log('🎭 [TryOn] Selfie URI:', selfieUri);
      startTryOn();
    }
  }, [currentProduct]);

  const startTryOn = async () => {
    if (!selfieUri || !currentProduct) return;
    setTryOnLoading(true);
    console.log('🎭 [TryOn] ---- GENERATION STARTED ----');

    // Tell WebView to show loading overlay on product image
    if (webViewRef.current) {
      console.log('🌐 [WebView] Sending tryon_loading to WebView');
      webViewRef.current.injectJavaScript(`
        window.postMessage(JSON.stringify({ type: 'tryon_loading' }), '*');
        true;
      `);
    }

    try {
      const resultBase64 = await generateTryOn(
        selfieUri,
        currentProduct.imageUrl,
        currentProduct.productName
      );
      console.log('🎭 [TryOn] Generation SUCCESS! Result base64 length:', resultBase64.length);
      setTryOnResult(resultBase64);

      // Store for video generation
      setLastTryOnBase64(resultBase64);
      setLastProductName(currentProduct.productName);

      // Auto-save to gallery
      try {
        await saveTryOnResult(resultBase64, {
          productName: currentProduct.productName,
          productPrice: currentProduct.productPrice,
          sourceUrl: currentProduct.pageUrl,
        });
        const all = await getSavedTryOns();
        setSavedTryOns(all);
        console.log('💾 [TryOn] Auto-saved to gallery! Total saved:', all.length);
      } catch (saveErr) {
        console.error('💾 [TryOn] Auto-save failed:', saveErr);
      }
    } catch (err: any) {
      console.error('🎭 [TryOn] Generation FAILED:', err.message || err);
      // Tell WebView to remove loading overlay on error
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'tryon_error' }), '*');
          true;
        `);
      }
    } finally {
      setTryOnLoading(false);
      setCurrentProduct(null);
      console.log('🎭 [TryOn] ---- GENERATION ENDED ----');
    }
  };

  // Send try-on result back to WebView to replace the product image
  useEffect(() => {
    if (tryOnResult && webViewRef.current) {
      console.log('🌐 [WebView] Sending tryon_result to WebView (base64 length: ' + tryOnResult.length + ')');
      webViewRef.current.injectJavaScript(`
        window.postMessage(JSON.stringify({ type: 'tryon_result', base64: '${tryOnResult}' }), '*');
        true;
      `);
      // Clear result after sending
      setTimeout(() => setTryOnResult(null), 500);
    }
  }, [tryOnResult]);

  const startVideoGeneration = async () => {
    if (!lastTryOnBase64 || videoLoading) return;
    setVideoLoading(true);
    console.log('🎬 [Video] ---- VIDEO GENERATION STARTED ----');

    // Tell WebView to show loading overlay
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        window.postMessage(JSON.stringify({ type: 'video_loading' }), '*');
        true;
      `);
    }

    try {
      const dataUri = await generateVideo(lastTryOnBase64, lastProductName || 'outfit');
      console.log('🎬 [Video] Generation SUCCESS!');
      setVideoDataUri(dataUri);

      // Tell WebView generation is done
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'video_done' }), '*');
          true;
        `);
      }
    } catch (err: any) {
      console.error('🎬 [Video] Generation FAILED:', err.message || err);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'video_error' }), '*');
          true;
        `);
      }
    } finally {
      setVideoLoading(false);
      console.log('🎬 [Video] ---- VIDEO GENERATION ENDED ----');
    }
  };

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data: WebViewMessage = JSON.parse(event.nativeEvent.data);
        if (data.type === 'injection_complete') {
          console.log('🌐 [WebView] Product detector injection confirmed on:', data.url);
        } else if (data.type === 'tryon_request' && data.imageUrl) {
          console.log('🌐 [WebView] Try-on request received from page');
          console.log('🌐 [WebView] Image URL:', data.imageUrl);
          console.log('🌐 [WebView] Product:', data.productName, '|', data.productPrice);
          onTryOnRequest({
            imageUrl: data.imageUrl,
            productName: data.productName || 'Product',
            productPrice: data.productPrice,
            pageUrl: data.pageUrl,
          });
        } else if (data.type === 'video_request') {
          console.log('🌐 [WebView] Video request received from page');
          startVideoGeneration();
        }
      } catch (err) {
        console.error('🌐 [WebView] Message parse error:', err);
      }
    },
    [onTryOnRequest, lastTryOnBase64, lastProductName, videoLoading]
  );

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    setPageTitle(navState.title || '');
    setCurrentUrl(navState.url);
  };

  // Block navigation during try-on or video generation
  const handleShouldStartLoad = useCallback(
    (request: any) => {
      if (isLocked && request.navigationType === 'click') {
        console.log('🚫 [WebView] Blocked navigation during generation:', request.url);
        return false;
      }
      return true;
    },
    [isLocked]
  );

  if (!currentUrl) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Navigation bar */}
      <View style={styles.navbar}>
        <TouchableOpacity
          onPress={() => !isLocked && setMode('chat')}
          style={[styles.navBtn, isLocked && styles.navBtnDisabled]}
          disabled={isLocked}
        >
          <Text style={[styles.navBtnText, isLocked && styles.navBtnTextDisabled]}>{'\u2715'}</Text>
        </TouchableOpacity>

        {canGoBack && (
          <TouchableOpacity
            onPress={() => !isLocked && webViewRef.current?.goBack()}
            style={[styles.navBtn, isLocked && styles.navBtnDisabled]}
            disabled={isLocked}
          >
            <Text style={[styles.navBtnText, isLocked && styles.navBtnTextDisabled]}>{'\u2039'}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.urlBar}>
          <View style={[styles.urlDot, isLocked && styles.urlDotLoading]} />
          <Text style={styles.urlText} numberOfLines={1}>
            {pageTitle || currentUrl}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => !isLocked && webViewRef.current?.reload()}
          style={[styles.navBtn, isLocked && styles.navBtnDisabled]}
          disabled={isLocked}
        >
          <Text style={[styles.navBtnText, isLocked && styles.navBtnTextDisabled]}>{'\u21BB'}</Text>
        </TouchableOpacity>
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          style={styles.webView}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            console.log('🌐 [WebView] Page loaded, injecting product detector');
            webViewRef.current?.injectJavaScript(PRODUCT_DETECTOR_JS);
          }}
          injectedJavaScriptBeforeContentLoaded={`
            window.__tryonInjected = false;
            true;
          `}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          allowsInlineMediaPlayback
          mixedContentMode="compatibility"
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        />

        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingSpinner}>
              <ActivityIndicator size="small" color="#0D0D0D" />
            </View>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}
      </View>

      {/* Video Player Popup */}
      <Modal
        visible={videoDataUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setVideoDataUri(null)}
      >
        <View style={styles.videoOverlay}>
          <View style={styles.videoModal}>
            <View style={styles.videoHeader}>
              <Text style={styles.videoTitle}>Try-On Video</Text>
              <TouchableOpacity
                onPress={() => setVideoDataUri(null)}
                style={styles.videoCloseBtn}
              >
                <Text style={styles.videoCloseBtnText}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
            {videoDataUri && (
              <VideoView
                player={videoPlayer}
                style={styles.videoPlayer}
                contentFit="contain"
                nativeControls={false}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
    fontWeight: '500',
  },
  navBtnTextDisabled: {
    color: 'rgba(255,255,255,0.25)',
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  urlDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ade80',
  },
  urlDotLoading: {
    backgroundColor: '#E8C8A0',
  },
  urlText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,13,13,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingSpinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8C8A0',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
  // Video popup styles
  videoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModal: {
    width: W * 0.9,
    height: H * 0.7,
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
    width: 34,
    height: 34,
    borderRadius: 17,
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
