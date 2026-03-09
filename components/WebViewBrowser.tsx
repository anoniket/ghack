import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAppStore } from '@/services/store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRODUCT_DETECTOR_JS } from '@/services/productDetector';
import * as api from '@/services/api';
import { imageUriToBase64 } from '@/utils/imageUtils';
import { rlog } from '@/services/logger';

const { width: W, height: H } = Dimensions.get('window');

interface WebViewMessage {
  type: string;
  imageUrl?: string;
  pageUrl?: string;
  url?: string;
  retry?: boolean;
}

interface Props {
  onTryOnRequest: (data: {
    imageUrl: string;
    pageUrl?: string;
    retry?: boolean;
  }) => void;
}

export default function WebViewBrowser({ onTryOnRequest }: Props) {
  const webViewRef = useRef<WebView>(null);
  const {
    currentUrl,
    setCurrentUrl,
    setMode,
    selfieUri,
    selfieS3Key,
    currentProduct,
    setCurrentProduct,
    tryOnLoading,
    setTryOnLoading,
    tryOnResult,
    setTryOnResult,
    savedTryOns,
    setSavedTryOns,
    videoLoading,
    setVideoLoading,
    videoDataUri,
    setVideoDataUri,
    lastSessionId,
    setLastSessionId,
    lastTryonS3Key,
    setLastTryonS3Key,
    setSelfieS3Key,
    setSelfieUri,
  } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const videoLoadingRef = useRef(false);

  const videoPlayer = useVideoPlayer(videoDataUri, (player) => {
    player.loop = true;
    player.muted = false;
    player.play();
  });

  const isLocked = tryOnLoading || videoLoading;

  // Trigger try-on generation when currentProduct is set
  useEffect(() => {
    if (currentProduct && selfieUri && !tryOnResult && !tryOnLoading) {
      rlog('TryOn', 'product received, starting generation');
      startTryOn();
    } else if (currentProduct && !selfieUri) {
      // Selfie missing — tell WebView to unlock and reset
      rlog('TryOn', 'product received but no selfie — aborting');
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'tryon_no_retry', errorText: 'Take a selfie first' }), '*');
          true;
        `);
      }
      setCurrentProduct(null);
    }
  }, [currentProduct, selfieUri]);

  const startTryOn = async () => {
    if (!selfieUri || !currentProduct) return;
    setTryOnLoading(true);
    rlog('TryOn', 'GENERATION STARTED');

    // Show loading overlay immediately via direct call (postMessage can be unreliable on some sites)
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.__tryonShowLoading) {
          window.__tryonShowLoading();
        } else {
          window.postMessage(JSON.stringify({ type: 'tryon_loading' }), '*');
        }
        true;
      `);
    }

    try {
      // Read selfie from local file — no S3 round trip
      const selfieBase64 = await imageUriToBase64(selfieUri);

      // On retry, use pro model — update duration to 45s
      if (currentProduct.retry && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.__tryonSetDuration) { window.__tryonSetDuration(45000); }
          true;
        `);
      }

      // Single-step V2 — no zone detection, no prepare
      const result = await api.tryOnV2({
        selfieBase64,
        productImageUrl: currentProduct.imageUrl,
        selfieS3Key: selfieS3Key || undefined,
        sourceUrl: currentProduct.pageUrl,
        retry: currentProduct.retry,
      });

      rlog('TryOn', `SUCCESS model=${result.model} session=${result.sessionId}`);

      // Store for video generation
      setLastSessionId(result.sessionId);
      setLastTryonS3Key(result.tryonS3Key);

      // Inject base64 immediately — S3 upload happens in background on server
      setTryOnResult(result.resultBase64);

      // Optimistically add to saved try-ons immediately (CDN URL replaces base64 on next tab focus)
      setSavedTryOns([
        {
          id: result.sessionId,
          imageUri: `data:image/png;base64,${result.resultBase64}`,
          sourceUrl: currentProduct.pageUrl,
          timestamp: Date.now(),
          sessionId: result.sessionId,
        },
        ...savedTryOns,
      ]);
    } catch (err: any) {
      rlog('TryOn', `FAILED: ${err.message || err}`);

      if (err.message === 'SELFIE_NOT_FOUND') {
        // Selfie was deleted from S3 — clear both zustand AND AsyncStorage
        setSelfieS3Key(null);
        setSelfieUri(null);
        AsyncStorage.removeItem('selfie_s3_key').catch(() => {});
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            window.postMessage(JSON.stringify({ type: 'tryon_no_retry', errorText: 'Selfie expired, please retake' }), '*');
            true;
          `);
        }
        Alert.alert('Selfie not found', 'Your selfie has expired. Please go to the Profile tab and take a new selfie.');
      } else {
        const isTimeout = err.message === 'TIMEOUT';
        const timeoutQuips = [
          'took too long, retry?',
          'AI froze up, again?',
          'timed out, one more shot?',
        ];
        const errorQuips = [
          'faah, retry? \u{1F972}',
          'AI tripped lol, again?',
          'oops, one more time?',
          'servers ghosted us, retry?',
          'bruh moment, try again?',
        ];
        const quips = isTimeout ? timeoutQuips : errorQuips;
        const errorText = quips[Math.floor(Math.random() * quips.length)];
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            window.postMessage(JSON.stringify({ type: 'tryon_error', errorText: ${JSON.stringify(errorText)} }), '*');
            true;
          `);
        }
      }
    } finally {
      setTryOnLoading(false);
      setCurrentProduct(null);
      rlog('TryOn', 'GENERATION ENDED');
    }
  };

  // Send try-on result back to WebView to replace the product image
  useEffect(() => {
    if (tryOnResult && webViewRef.current) {
      rlog('TryOn', `sending result to WebView (base64 length=${tryOnResult.length})`);
      // Call __tryonReplaceImage directly — avoids postMessage + JSON.stringify overhead
      // which can silently fail on 3MB+ base64 strings in WKWebView
      webViewRef.current.injectJavaScript(`
        try {
          if (window.__tryonReplaceImage) {
            window.__tryonReplaceImage(${JSON.stringify(tryOnResult)});
            console.log('[mrigAI] replaceImage called successfully');
          } else {
            console.log('[mrigAI] __tryonReplaceImage not found, removing overlay');
            var ov = document.getElementById('__tryon-loading-overlay');
            if (ov) ov.remove();
          }
        } catch(e) {
          console.log('[mrigAI] inject error: ' + e.message);
          var ov = document.getElementById('__tryon-loading-overlay');
          if (ov) ov.remove();
        }
        true;
      `);
      // Clear immediately — WebView already has the data
      setTryOnResult(null);
    }
  }, [tryOnResult]);

  const startVideoGeneration = async () => {
    if (!lastTryonS3Key || !lastSessionId) return;
    // Use ref for atomic double-tap guard (React state is async)
    if (videoLoadingRef.current) return;
    videoLoadingRef.current = true;
    setVideoLoading(true);
    rlog('Video', 'GENERATION STARTED');

    // Tell WebView to show loading overlay
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        window.postMessage(JSON.stringify({ type: 'video_loading' }), '*');
        true;
      `);
    }

    try {
      // Start video job
      const { jobId } = await api.startVideo({
        sessionId: lastSessionId,
        tryonS3Key: lastTryonS3Key,
      });
      rlog('Video', `job=${jobId} started, polling`);

      // Poll for completion — max 10 minutes
      const MAX_POLL_MS = 10 * 60 * 1000;
      const pollStart = Date.now();
      let status = 'pending';
      let videoUrl: string | undefined;
      let pollCount = 0;
      while (status === 'pending') {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          throw new Error('Video generation timed out');
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
        pollCount++;
        try {
          const poll = await api.pollVideo(jobId);
          status = poll.status;
          videoUrl = poll.videoUrl;
          rlog('Video', `poll #${pollCount} status=${poll.status}`);
          if (poll.status === 'failed') {
            throw new Error(poll.error || 'Video generation failed');
          }
        } catch (pollErr: any) {
          // Network error during poll — retry up to 3 consecutive failures
          if (pollErr.message?.includes('generation failed') || pollErr.message?.includes('timed out')) {
            throw pollErr; // Real failure, don't retry
          }
          rlog('Video', `poll #${pollCount} network error: ${pollErr.message}, retrying`);
          // Don't throw — let the while loop retry on next iteration
        }
      }

      rlog('Video', 'SUCCESS');
      setVideoDataUri(videoUrl || null);

      // Tell WebView generation is done
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'video_done' }), '*');
          true;
        `);
      }
    } catch (err: any) {
      rlog('Video', `FAILED: ${err.message || err}`);
      const videoErrorQuips = [
        'video said nah, retry?',
        'director walked off set, again?',
        'the reel flopped, one more?',
        'veo ghosted us, try again?',
        'cut! bad take, retry?',
      ];
      const errorText = videoErrorQuips[Math.floor(Math.random() * videoErrorQuips.length)];
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({ type: 'video_error', errorText: ${JSON.stringify(errorText)} }), '*');
          true;
        `);
      }
      Alert.alert('Video failed', errorText);
    } finally {
      videoLoadingRef.current = false;
      setVideoLoading(false);
      rlog('Video', 'GENERATION ENDED');
    }
  };

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data: WebViewMessage = JSON.parse(event.nativeEvent.data);
        if (data.type === 'injection_complete') {
          rlog('WebView', `detector injected on ${data.url}`);
        } else if (data.type === 'tryon_request' && data.imageUrl) {
          rlog('WebView', `tryon request from ${data.pageUrl}`);
          onTryOnRequest({
            imageUrl: data.imageUrl,
            pageUrl: data.pageUrl,
            retry: data.retry,
          });
        } else if (data.type === 'video_request') {
          rlog('WebView', 'video request');
          startVideoGeneration();
        } else if (data.type === 'product_detected' && data.pageUrl) {
          // Check if this product was already tried on
          checkPreviousTryOn(data.pageUrl);
        }
      } catch (err) {
        // ignore non-JSON messages
      }
    },
    [onTryOnRequest, lastTryonS3Key, lastSessionId, videoLoading, selfieUri]
  );

  const checkPreviousTryOn = async (pageUrl: string) => {
    try {
      const result = await api.checkProductTryOn(pageUrl);
      if (result.found && result.tryonImageUrl && webViewRef.current) {
        rlog('WebView', `previous tryon found for ${pageUrl}`);
        // Store for video generation
        if (result.sessionId) setLastSessionId(result.sessionId);
        if (result.tryonS3Key) setLastTryonS3Key(result.tryonS3Key);

        webViewRef.current.injectJavaScript(`
          window.postMessage(JSON.stringify({
            type: 'previous_tryon',
            imageUrl: ${JSON.stringify(result.tryonImageUrl)},
            hasVideo: ${!!result.videoUrl}
          }), '*');
          true;
        `);
      }
    } catch (err) {
      // Non-critical, ignore
    }
  };

  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNavigationStateChange = (navState: any) => {
    // Ignore internal WebView frames (iframes, injected scripts)
    if (navState.url === 'about:srcdoc' || navState.url === 'about:blank') return;
    setCanGoBack(navState.canGoBack);
    setPageTitle(navState.title || '');
    if (navState.url !== currentUrl) {
      initialLoadDone.current = false;
      if (navState.loading) {
        setLoading(true);
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
          setLoading(false);
          initialLoadDone.current = true;
          navTimeoutRef.current = null;
        }, 3000);
      }
    }
    setCurrentUrl(navState.url);
  };

  const handleShouldStartLoad = useCallback(
    (request: any) => {
      if (isLocked && request.navigationType === 'click') {
        rlog('WebView', 'blocked nav during generation');
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
          onLoadStart={() => {
            if (!initialLoadDone.current) {
              setLoading(true);
            }
            if (loadTimerRef.current) {
              clearTimeout(loadTimerRef.current);
              loadTimerRef.current = null;
            }
          }}
          onLoadEnd={() => {
            initialLoadDone.current = true;
            setLoading(false);
            if (navTimeoutRef.current) {
              clearTimeout(navTimeoutRef.current);
              navTimeoutRef.current = null;
            }
            if (loadTimerRef.current) {
              clearTimeout(loadTimerRef.current);
              loadTimerRef.current = null;
            }
            rlog('WebView', 'injecting product detector');
            webViewRef.current?.injectJavaScript(PRODUCT_DETECTOR_JS);
          }}
          injectedJavaScriptBeforeContentLoaded={`
            window.__tryonInjected = false;
            window.__historyDepth = 0;
            var origPushState = history.pushState;
            var origReplaceState = history.replaceState;
            history.pushState = function() {
              window.__historyDepth++;
              return origPushState.apply(this, arguments);
            };
            history.replaceState = function() {
              return origReplaceState.apply(this, arguments);
            };
            window.addEventListener('popstate', function() {
              window.__historyDepth = Math.max(0, window.__historyDepth - 1);
            });
            var origBack = history.back;
            history.back = function() {
              if (window.__historyDepth <= 0) {
                var homepage = location.protocol + '//' + location.hostname;
                location.href = homepage;
              } else {
                origBack.apply(this, arguments);
              }
            };
            var origGo = history.go;
            history.go = function(n) {
              if (n < 0 && window.__historyDepth <= 0) {
                var homepage = location.protocol + '//' + location.hostname;
                location.href = homepage;
              } else {
                origGo.apply(this, arguments);
              }
            };
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
                nativeControls
                allowsFullscreen
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
