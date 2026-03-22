import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useVideoPlayer } from 'expo-video';
import VideoModal from '@/components/VideoModal';
import { useAppStore } from '@/services/store';
import { PRODUCT_DETECTOR_JS } from '@/services/productDetector';
import * as api from '@/services/api';
import { imageUriToBase64 } from '@/utils/imageUtils';
import { rlog } from '@/services/logger';


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
  const { width: W, height: H } = useWindowDimensions();
  const webViewRef = useRef<WebView>(null);

  // PERF-1: Individual selectors — only re-render when the specific field changes
  const currentUrl = useAppStore((s) => s.currentUrl);
  const selfieUris = useAppStore((s) => s.selfieUris);
  const currentProduct = useAppStore((s) => s.currentProduct);
  const tryOnLoading = useAppStore((s) => s.tryOnLoading);
  const tryOnResult = useAppStore((s) => s.tryOnResult);
  const videoLoading = useAppStore((s) => s.videoLoading);
  const videoDataUri = useAppStore((s) => s.videoDataUri);

  // PERF-1: Setters via getState() — stable references, no re-renders
  const {
    setCurrentUrl,
    setMode,
    setCurrentProduct,
    setTryOnLoading,
    setTryOnResult,
    setSavedTryOns,
    setVideoLoading,
    setVideoDataUri,
    setLastSessionId,
    setLastTryonS3Key,
  } = useAppStore.getState();
  const [loading, setLoading] = useState(true);
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const videoLoadingRef = useRef(false);
  const tryOnLoadingRef = useRef(false); // SS-16: double-tap guard
  const selfieDescriptionRef = useRef<string | null>(null);

  // Load selfie description from AsyncStorage (set during onboarding/profile update)
  // Only depends on primary selfie (selfieUris[0]) — description is derived from the first photo
  useEffect(() => {
    if (selfieUris.length === 0) return;
    (async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const desc = await AsyncStorage.getItem('selfie_description');
        selfieDescriptionRef.current = desc;
        rlog('Selfie', `Description loaded: ${desc}`);
      } catch (err: any) {
        rlog('Selfie', `Description load failed: ${err.message}`);
        selfieDescriptionRef.current = null;
      }
    })();
  }, [selfieUris[0]]);

  const videoPlayer = useVideoPlayer(videoDataUri, (player) => {
    player.loop = true;
    player.muted = false;
    player.play();
  });

  const isLocked = tryOnLoading || videoLoading;

  // SS-9/ERR-6: Reset transient state + timers on unmount
  useEffect(() => {
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      // Reset loading flags so ChatBubble isn't permanently hidden
      setTryOnLoading(false);
      setVideoLoading(false);
      tryOnLoadingRef.current = false;
      videoLoadingRef.current = false;
    };
  }, []);

  // PLAT-3: Android hardware back button — go back in WebView history instead of exiting
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (isLocked) return true; // block during generation
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // handled
      }
      // No history — let default behavior (exit to chat) happen
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [canGoBack, isLocked]);

  // Trigger try-on generation when currentProduct is set
  useEffect(() => {
    if (currentProduct && selfieUris.length > 0 && !tryOnResult && !tryOnLoading) {
      rlog('TryOn', 'product received, starting generation');
      startTryOn();
    } else if (currentProduct && selfieUris.length === 0) {
      // Selfie missing — tell WebView to unlock and reset
      rlog('TryOn', 'product received but no selfie — aborting');
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.__tryonShowNoRetryError) { window.__tryonShowNoRetryError('Take a selfie first'); }
          true;
        `);
      }
      setCurrentProduct(null);
    }
  }, [currentProduct, selfieUris]);

  const startTryOn = async () => {
    if (selfieUris.length === 0 || !currentProduct) return;
    // SS-16: Ref-based double-tap guard (same pattern as videoLoadingRef)
    if (tryOnLoadingRef.current) return;
    tryOnLoadingRef.current = true;
    setTryOnLoading(true);
    // SS-12: Clear old video so it doesn't play for wrong product
    setVideoDataUri(null);
    rlog('TryOn', 'GENERATION STARTED');

    // Show loading overlay immediately via direct call (postMessage can be unreliable on some sites)
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.__tryonShowLoading) { window.__tryonShowLoading(); }
        true;
      `);
    }

    try {
      // On retry, keep same 30s duration
      if (currentProduct.retry && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.__tryonSetDuration) { window.__tryonSetDuration(30000); }
          true;
        `);
      }

      // Get model preference and limit selfies accordingly
      const preferredModel = useAppStore.getState().preferredModel;
      // NB1 supports max 3 images total (2 selfies + 1 product), NB2/Pro support more
      const maxSelfies = preferredModel === 'nb1' ? 2 : 3;
      const selfiesToUse = selfieUris.slice(0, maxSelfies);

      // Convert selfie URIs to base64
      const selfieBase64s = await Promise.all(
        selfiesToUse.map(uri => imageUriToBase64(uri))
      );

      // Single-step V2 with auto-retry on SERVER_BUSY (503)
      const MAX_BUSY_RETRIES = 2;
      let result: Awaited<ReturnType<typeof api.tryOnV2>> | null = null;
      for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt++) {
        try {
          result = await api.tryOnV2({
            selfieBase64s,
            productImageUrl: currentProduct.imageUrl,
            sourceUrl: currentProduct.pageUrl,
            retry: currentProduct.retry,
            selfieDescription: selfieDescriptionRef.current || undefined,
            model: preferredModel,
          });
          break; // success
        } catch (busyErr: any) {
          const isRetryable = (busyErr.message === 'SERVER_BUSY' || busyErr.message === 'TIMEOUT') && attempt < MAX_BUSY_RETRIES;
          if (isRetryable) {
            const reason = busyErr.message === 'SERVER_BUSY' ? 'server busy' : 'timed out';
            rlog('TryOn', `${reason}, auto-retrying (${attempt + 1}/${MAX_BUSY_RETRIES})`);
            // Show "retrying" message in overlay for 3s, then reset loading
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                (function() {
                  var status = document.querySelector('.__tryon-status-text');
                  if (status) status.textContent = '${reason}, retrying...';
                })();
                true;
              `);
            }
            await new Promise(r => setTimeout(r, 3000));
            // Reset loading overlay fresh
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                if (window.__tryonShowLoading) { window.__tryonShowLoading(); }
                true;
              `);
            }
            continue;
          }
          throw busyErr; // not SERVER_BUSY or out of retries
        }
      }
      if (!result) throw new Error('SERVER_BUSY'); // all retries failed

      rlog('TryOn', `SUCCESS model=${result.model} session=${result.sessionId}`);

      // Store for video generation
      setLastSessionId(result.sessionId);
      setLastTryonS3Key(result.tryonS3Key);

      // Inject base64 immediately — S3 upload happens in background on server
      setTryOnResult(result.resultBase64);

      // Save with CDN URL (not base64) — avoids memory bloat
      // CDN URL may 404 for 1-2s while S3 upload finishes in background,
      // but user is viewing WebView result, not the Saved tab
      // SS-1: Read fresh savedTryOns from store to avoid stale closure
      const currentSaved = useAppStore.getState().savedTryOns;
      setSavedTryOns([
        {
          id: result.sessionId,
          imageUri: result.resultCdnUrl,
          sourceUrl: currentProduct.pageUrl,
          timestamp: Date.now(),
          sessionId: result.sessionId,
        },
        ...currentSaved,
      ]);
    } catch (err: any) {
      rlog('TryOn', `FAILED: ${err.message || err}`);

      if (err.message === 'SERVER_BUSY') {
        // All retry attempts got 503
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (window.__tryonShowError) { window.__tryonShowError('servers are packed rn, try again in a bit'); }
            true;
          `);
        }
        Alert.alert('Servers busy', 'AI servers are at capacity. Try again in a minute.');
      } else if (err.message === 'RATE_LIMITED') {
        // AC-3: Show cooldown message
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (window.__tryonShowError) { window.__tryonShowError('chill, too many requests — try again in a min'); }
            true;
          `);
        }
        Alert.alert('Slow down', 'Too many requests — try again in a minute.');
      } else if (err.message === 'NETWORK_ERROR') {
        // ERR-22: Specific message for network failures
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (window.__tryonShowError) { window.__tryonShowError('no internet — check your connection'); }
            true;
          `);
        }
        Alert.alert('No connection', 'Check your internet and try again.');
      } else if (err.message === 'IMAGE_BLOCKED') {
        // Safety filter — retrying won't help
        const blockedText = 'AI couldn\'t generate this — try a different product or photo';
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (window.__tryonShowError) { window.__tryonShowError(${JSON.stringify(blockedText)}); }
            true;
          `);
        }
        Alert.alert('Blocked by AI', blockedText);
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
            if (window.__tryonShowError) { window.__tryonShowError(${JSON.stringify(errorText)}); }
            true;
          `);
        }
        Alert.alert('Try-on failed', errorText);
      }
    } finally {
      tryOnLoadingRef.current = false;
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
    // Read from store directly to avoid stale closure
    const { lastTryonS3Key: s3Key, lastSessionId: sessId } = useAppStore.getState();
    if (!s3Key || !sessId) return;
    // Use ref for atomic double-tap guard (React state is async)
    if (videoLoadingRef.current) return;
    videoLoadingRef.current = true;
    setVideoLoading(true);
    rlog('Video', 'GENERATION STARTED');

    // Tell WebView to show loading overlay
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.__tryonShowVideoLoading) { window.__tryonShowVideoLoading(); }
        true;
      `);
    }

    try {
      // Start video job
      const { jobId } = await api.startVideo({
        sessionId: sessId,
        tryonS3Key: s3Key,
      });
      rlog('Video', `job=${jobId} started, polling`);

      // Poll for completion — max 3min, 10s fetch timeout, exponential backoff
      const MAX_POLL_MS = 3 * 60 * 1000;
      const FETCH_TIMEOUT_MS = 10 * 1000;
      const pollStart = Date.now();
      let status = 'pending';
      let videoUrl: string | undefined;
      let pollCount = 0;
      let consecutiveErrors = 0;
      let pollInterval = 3000; // start at 3s, backoff to 10s
      while (status === 'pending') {
        if (Date.now() - pollStart > MAX_POLL_MS) {
          throw new Error('Video generation timed out');
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        pollInterval = Math.min(pollInterval * 1.5, 10000);
        pollCount++;
        // Fetch the poll — network errors are transient, status errors are terminal
        let poll: { status: string; videoUrl?: string; error?: string };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
          poll = await api.pollVideo(jobId, controller.signal);
          clearTimeout(timeoutId);
          consecutiveErrors = 0;
        } catch (networkErr: any) {
          consecutiveErrors++;
          rlog('Video', `poll #${pollCount} network error (${consecutiveErrors}/5): ${networkErr.message}`);
          if (consecutiveErrors >= 5) {
            throw new Error('Video polling failed — check your connection');
          }
          continue;
        }

        // Poll succeeded — check job status
        status = poll.status;
        videoUrl = poll.videoUrl;
        rlog('Video', `poll #${pollCount} status=${poll.status}`);

        if (poll.status === 'failed') {
          // Terminal — server said the job is dead, no point retrying
          throw new Error(poll.error || 'Video generation failed');
        }
      }

      // Guard: if loop exited with non-pending status but no video, it's a failure
      if (status === 'failed' || !videoUrl) {
        throw new Error('Video generation failed');
      }

      rlog('Video', 'SUCCESS');
      setVideoDataUri(videoUrl);

      // Update savedTryOns with video URL so Saved tab has it without refetching
      if (videoUrl) {
        const current = useAppStore.getState().savedTryOns;
        setSavedTryOns(current.map(t =>
          t.sessionId === sessId ? { ...t, videoUrl } : t
        ));
      }

      // Tell WebView generation is done
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.__tryonVideoDone) { window.__tryonVideoDone(); }
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
          if (window.__tryonVideoError) { window.__tryonVideoError(${JSON.stringify(errorText)}); }
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
    [onTryOnRequest]
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
          if (window.__tryonPreviousTryon) { window.__tryonPreviousTryon(${JSON.stringify(result.tryonImageUrl)}); }
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
      // Block navigation to different pages during generation
      // Use URL comparison — navigationType is iOS-only
      if (isLocked && request.url !== currentUrl) {
        rlog('WebView', 'blocked nav during generation');
        return false;
      }
      return true;
    },
    [isLocked, currentUrl]
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
          accessibilityLabel="Close browser"
          accessibilityRole="button"
        >
          <Text style={[styles.navBtnText, isLocked && styles.navBtnTextDisabled]}>{'\u2715'}</Text>
        </TouchableOpacity>

        {canGoBack && (
          <TouchableOpacity
            onPress={() => !isLocked && webViewRef.current?.goBack()}
            style={[styles.navBtn, isLocked && styles.navBtnDisabled]}
            disabled={isLocked}
            accessibilityLabel="Go back"
            accessibilityRole="button"
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
          accessibilityLabel="Reload page"
          accessibilityRole="button"
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
            // H6: Re-inject history patches on Android (injectedJavaScriptBeforeContentLoaded is unreliable)
            if (Platform.OS === 'android') {
              webViewRef.current?.injectJavaScript(`
                if (!window.__historyPatched) {
                  window.__historyPatched = true;
                  window.__historyDepth = window.__historyDepth || 0;
                  var origPushState = history.pushState;
                  var origReplaceState = history.replaceState;
                  history.pushState = function() {
                    window.__historyDepth++;
                    var r = origPushState.apply(this, arguments);
                    window.dispatchEvent(new Event('__tryon_nav'));
                    return r;
                  };
                  history.replaceState = function() {
                    var r = origReplaceState.apply(this, arguments);
                    window.dispatchEvent(new Event('__tryon_nav'));
                    return r;
                  };
                  window.addEventListener('popstate', function() {
                    window.__historyDepth = Math.max(0, window.__historyDepth - 1);
                    window.dispatchEvent(new Event('__tryon_nav'));
                  });
                }
                true;
              `);
            }
          }}
          injectedJavaScriptBeforeContentLoaded={`
            window.__tryonInjected = false;
            window.__historyDepth = 0;
            var origPushState = history.pushState;
            var origReplaceState = history.replaceState;
            history.pushState = function() {
              window.__historyDepth++;
              var r = origPushState.apply(this, arguments);
              window.dispatchEvent(new Event('__tryon_nav'));
              return r;
            };
            history.replaceState = function() {
              var r = origReplaceState.apply(this, arguments);
              window.dispatchEvent(new Event('__tryon_nav'));
              return r;
            };
            window.addEventListener('popstate', function() {
              window.__historyDepth = Math.max(0, window.__historyDepth - 1);
              window.dispatchEvent(new Event('__tryon_nav'));
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
          mixedContentMode="never"
          userAgent={Platform.OS === 'ios'
            ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36'
          }
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
      <VideoModal
        visible={videoDataUri !== null}
        player={videoPlayer}
        onClose={() => setVideoDataUri(null)}
      />
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
});
