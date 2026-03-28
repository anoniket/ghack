import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
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
import { usePostHog } from 'posthog-react-native';
import { ANALYTICS_EVENTS, getStoreName } from '@/utils/analytics';
import { COLORS, FONTS, BORDER_RADIUS, BORDERS, SHADOWS } from '@/theme';
import { TAB_BAR_BASE_HEIGHT } from '@/utils/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


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
  onClose?: () => void;
}

export default function WebViewBrowser({ onTryOnRequest, onClose }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const webViewRef = useRef<WebView>(null);
  const tryOnStartTimeRef = useRef<number>(0);
  const videoStartTimeRef = useRef<number>(0);
  const lastBrowsedDomainRef = useRef<string>('');

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
  const [detectedProduct, setDetectedProduct] = useState<{ imageUrl: string; pageUrl: string } | null>(null);
  const [tryOnProgress, setTryOnProgress] = useState(0);
  const [tryOnQuip, setTryOnQuip] = useState('');
  const tryOnProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tryOnQuipRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tryOnPageUrlRef = useRef<string | null>(null);
  const [tryOnThumbUrl, setTryOnThumbUrl] = useState<string | null>(null);
  const tryOnThumbAngle = useRef(0);
  const [flyingImage, setFlyingImage] = useState<string | null>(null);
  const flyAnim = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);
  const startVideoGenerationRef = useRef<(() => void) | null>(null);
  const posthogRef = useRef(posthog);
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      if (tryOnProgressRef.current) clearInterval(tryOnProgressRef.current);
      if (tryOnQuipRef.current) clearInterval(tryOnQuipRef.current);
      // Reset loading flags on unmount
      setTryOnLoading(false);
      setVideoLoading(false);
      tryOnLoadingRef.current = false;
      videoLoadingRef.current = false;
    };
  }, []);

  // Keep refs fresh for stable callbacks
  posthogRef.current = posthog;

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

  const TRYON_QUIPS = [
    'its giving main character...',
    'okay u kinda ate that...',
    'the AI said wow btw...',
    'fitting room but make it AI...',
    'drip check in progress...',
    'be honest u look expensive...',
    'AI went feral for this one...',
    'the fit is fitting...',
    'no thoughts just drip...',
    'downloading rizz...',
    'hold my pixels...',
    'outfit so fire calling 911...',
    'the algorithm has a crush...',
    'ur closet could never...',
    'god tier fit incoming...',
    'adding drip... please wait...',
    'confidence.exe loading...',
    'cooking up the look...',
    'AI doing its thing rn...',
    'fitting the drip...',
  ];

  const startProgressBar = (pageUrl: string) => {
    tryOnPageUrlRef.current = pageUrl;
    setTryOnProgress(0);
    // Pick random starting quip
    const shuffled = [...TRYON_QUIPS].sort(() => Math.random() - 0.5);
    let idx = 0;
    setTryOnQuip(shuffled[0]);

    // Progress: 0→95% over 30s
    const startTime = Date.now();
    tryOnProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(95, Math.round((elapsed / 30000) * 100));
      setTryOnProgress(pct);
      if (pct >= 95 && tryOnProgressRef.current) {
        clearInterval(tryOnProgressRef.current);
        tryOnProgressRef.current = null;
      }
    }, 500);

    // Quips: cycle every 2s
    tryOnQuipRef.current = setInterval(() => {
      idx = (idx + 1) % shuffled.length;
      setTryOnQuip(shuffled[idx]);
    }, 2000);
  };

  const stopProgressBar = () => {
    if (tryOnProgressRef.current) { clearInterval(tryOnProgressRef.current); tryOnProgressRef.current = null; }
    if (tryOnQuipRef.current) { clearInterval(tryOnQuipRef.current); tryOnQuipRef.current = null; }
    setTryOnProgress(0);
    setTryOnQuip('');
    setTryOnThumbUrl(null);
  };

  const startTryOn = async () => {
    if (selfieUris.length === 0 || !currentProduct) return;
    // SS-16: Ref-based double-tap guard (same pattern as videoLoadingRef)
    if (tryOnLoadingRef.current) return;
    tryOnLoadingRef.current = true;
    setTryOnLoading(true);
    // SS-12: Clear old video so it doesn't play for wrong product
    setVideoDataUri(null);
    tryOnStartTimeRef.current = Date.now();
    const storeName = currentProduct.pageUrl ? getStoreName(currentProduct.pageUrl) : 'unknown';
    posthog?.capture(ANALYTICS_EVENTS.TRYON_STARTED, { store_name: storeName });
    rlog('TryOn', 'GENERATION STARTED');

    // Start native progress bar in the bottom CTA area
    startProgressBar(currentProduct.pageUrl || '');

    // OLD: Show loading overlay in WebView (commented out — using native progress bar now)
    // if (webViewRef.current) {
    //   webViewRef.current.injectJavaScript(`
    //     if (window.__tryonShowLoading) { window.__tryonShowLoading(); }
    //     true;
    //   `);
    // }

    try {
      // OLD: On retry, keep same 30s duration (commented out — using native progress bar)
      // if (currentProduct.retry && webViewRef.current) {
      //   webViewRef.current.injectJavaScript(`
      //     if (window.__tryonSetDuration) { window.__tryonSetDuration(30000); }
      //     true;
      //   `);
      // }

      // Get model preference
      const preferredModel = useAppStore.getState().preferredModel;

      // Check if backend has cached selfies — if not, send them as fallback
      let selfieBase64sFallback: string[] | undefined;
      try {
        const cacheStatus = await api.checkSelfieCache();
        if (!cacheStatus.cached) {
          rlog('TryOn', 'Backend cache miss — sending selfies');
          const maxSelfies = preferredModel === 'nb1' ? 2 : 3;
          selfieBase64sFallback = await Promise.all(
            selfieUris.slice(0, maxSelfies).map(uri => imageUriToBase64(uri))
          );
        } else {
          rlog('TryOn', `Backend has ${cacheStatus.count} cached selfies`);
        }
      } catch {
        // Cache check failed — send selfies as fallback
        rlog('TryOn', 'Cache check failed — sending selfies');
        const maxSelfies = preferredModel === 'nb1' ? 2 : 3;
        selfieBase64sFallback = await Promise.all(
          selfieUris.slice(0, maxSelfies).map(uri => imageUriToBase64(uri))
        );
      }

      // Single-step V2 with auto-retry on SERVER_BUSY (503)
      const MAX_BUSY_RETRIES = 2;
      let result: Awaited<ReturnType<typeof api.tryOnV2>> | null = null;
      for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt++) {
        try {
          result = await api.tryOnV2({
            productImageUrl: currentProduct.imageUrl,
            sourceUrl: currentProduct.pageUrl,
            retry: currentProduct.retry,
            selfieDescription: selfieDescriptionRef.current || undefined,
            model: preferredModel,
            selfieBase64s: selfieBase64sFallback,
          });
          break; // success
        } catch (busyErr: any) {
          const isRetryable = (busyErr.message === 'SERVER_BUSY' || busyErr.message === 'TIMEOUT' || busyErr.message === 'NETWORK_ERROR') && attempt < MAX_BUSY_RETRIES;
          if (isRetryable) {
            const reason = busyErr.message === 'SERVER_BUSY' ? 'server busy' : busyErr.message === 'NETWORK_ERROR' ? 'reconnecting' : 'timed out';
            rlog('TryOn', `${reason}, auto-retrying (${attempt + 1}/${MAX_BUSY_RETRIES})`);
            // Show "retrying" in native progress bar
            setTryOnQuip(`${reason}, retrying...`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          throw busyErr; // not SERVER_BUSY or out of retries
        }
      }
      if (!result) throw new Error('SERVER_BUSY'); // all retries failed
      if (!mountedRef.current) return; // Component unmounted during API call

      rlog('TryOn', `SUCCESS model=${result.model} session=${result.sessionId}`);
      posthog?.capture(ANALYTICS_EVENTS.TRYON_COMPLETED, {
        store_name: storeName,
        duration_ms: Date.now() - tryOnStartTimeRef.current,
      });

      // Store for video generation
      setLastSessionId(result.sessionId);
      setLastTryonS3Key(result.tryonS3Key);

      // Store result for in-page injection (kept for fallback)
      setTryOnResult(result.resultBase64);

      // Complete the progress bar
      setTryOnProgress(100);
      setTryOnQuip('done!');

      // Stop progress bar after a short delay, then the tryOnResult useEffect
      // handles URL check → visibility check → inject or refresh
      setTimeout(() => {
        stopProgressBar();
      }, 800);

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
      posthog?.capture(ANALYTICS_EVENTS.TRYON_FAILED, {
        store_name: storeName,
        error_type: err.message || 'unknown',
      });

      // Stop native progress bar on error
      if (mountedRef.current) stopProgressBar();

      if (err.message === 'SERVER_BUSY') {
        Alert.alert('Servers busy', 'AI servers are at capacity. Try again in a minute.');
      } else if (err.message === 'RATE_LIMITED') {
        Alert.alert('Slow down', 'Too many requests — try again in a minute.');
      } else if (err.message === 'NETWORK_ERROR') {
        Alert.alert('No connection', 'Check your internet and try again.');
      } else if (err.message === 'IMAGE_BLOCKED') {
        const blockedQuips = [
          'This outfit is a bit too revealing for our AI to process. Try something with a little more coverage!',
          'Our AI got shy, this one shows a bit too much skin. Pick something less revealing and try again!',
          'The AI safety filter flagged this outfit as too exposed. Try a different product!',
          'Too much skin for our AI to handle right now. It works best with outfits that have more fabric!',
          'Our AI needs outfits with a bit more going on. This one is too minimal for it to process!',
          'The AI politely declined, this outfit is too revealing for it to work with. Try another one!',
        ];
        Alert.alert('Can\'t try this one on', blockedQuips[Math.floor(Math.random() * blockedQuips.length)]);
      } else {
        const isTimeout = err.message === 'TIMEOUT';
        Alert.alert('Try-on failed', isTimeout ? 'Took too long, try again?' : 'Something went wrong, try again?');
      }
    } finally {
      tryOnLoadingRef.current = false;
      setTryOnLoading(false);
      setCurrentProduct(null);
      rlog('TryOn', 'GENERATION ENDED');
    }
  };

  // Send try-on result back to WebView
  // Step 1: Check URL. If different → navigate back, done.
  // Step 2: If same URL → check image visibility. Visible → inject. Not visible → refresh.
  useEffect(() => {
    if (!tryOnResult || !webViewRef.current || !mountedRef.current) return;
    rlog('TryOn', `try-on result ready (base64 length=${tryOnResult.length}), checking URL...`);

    // Step 1: Ask WebView for current URL
    webViewRef.current.injectJavaScript(`
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: '__tryon_url_check',
        currentUrl: window.location.href,
      }));
      true;
    `);
  }, [tryOnResult]);

  const startVideoGeneration = async () => {
    // Read from store directly to avoid stale closure
    const { lastTryonS3Key: s3Key, lastSessionId: sessId } = useAppStore.getState();
    if (!s3Key || !sessId) return;
    // Use ref for atomic double-tap guard (React state is async)
    if (videoLoadingRef.current) return;
    videoLoadingRef.current = true;
    setVideoLoading(true);
    videoStartTimeRef.current = Date.now();
    const videoStoreName = currentUrl ? getStoreName(currentUrl) : 'unknown';
    posthog?.capture(ANALYTICS_EVENTS.VIDEO_STARTED, { store_name: videoStoreName });
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
      posthog?.capture(ANALYTICS_EVENTS.VIDEO_COMPLETED, {
        store_name: videoStoreName,
        duration_ms: Date.now() - videoStartTimeRef.current,
      });
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
      posthog?.capture(ANALYTICS_EVENTS.VIDEO_FAILED, {
        store_name: videoStoreName,
        error_type: err.message || 'unknown',
      });
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
  startVideoGenerationRef.current = startVideoGeneration;

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data: WebViewMessage = JSON.parse(event.nativeEvent.data);
        if (data.type === 'injection_complete') {
          rlog('WebView', `detector injected on ${data.url}`);
        } else if (data.type === 'tryon_request' && data.imageUrl) {
          rlog('WebView', `tryon request from ${data.pageUrl}`);
          if (data.retry) {
            posthogRef.current?.capture(ANALYTICS_EVENTS.RETRY_AFTER_ERROR, { error_type: 'tryon' });
          }
          onTryOnRequest({
            imageUrl: data.imageUrl,
            pageUrl: data.pageUrl,
            retry: data.retry,
          });
        } else if (data.type === 'video_request') {
          rlog('WebView', 'video request');
          // Call via ref-like pattern to avoid stale closure
          startVideoGenerationRef.current?.();
        } else if (data.type === 'product_detected' && data.pageUrl) {
          posthogRef.current?.capture(ANALYTICS_EVENTS.PRODUCT_DETECTED, {
            store_name: getStoreName(data.pageUrl),
            product_url: data.pageUrl,
          });
          setDetectedProduct({ imageUrl: data.imageUrl || '', pageUrl: data.pageUrl });
          // Check if this product was already tried on
          checkPreviousTryOn(data.pageUrl);
        } else if (data.type === 'product_cleared') {
          setDetectedProduct(null);
        } else if (data.type === '__tryon_url_check') {
          // Step 1: URL check
          const origUrl = tryOnPageUrlRef.current;
          const webViewUrl = data.currentUrl || '';
          let samePage = false;
          try { samePage = !!(origUrl && webViewUrl && new URL(origUrl).pathname === new URL(webViewUrl).pathname); } catch { samePage = false; }

          if (!samePage) {
            // URL changed — navigate back to original, checkPreviousTryOn handles injection on load
            rlog('TryOn', `URL changed (${webViewUrl} → ${origUrl}) — navigating back`);
            setTryOnResult(null);
            if (origUrl && webViewRef.current) setCurrentUrl(origUrl);
            return;
          }

          // Step 2: Same URL — check if product image is visible
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
              try {
                var img = window.__tryonProductImg;
                var visible = false;
                if (img && img.isConnected) {
                  var rect = img.getBoundingClientRect();
                  var vh = window.innerHeight || document.documentElement.clientHeight;
                  visible = rect.height > 0 && rect.top < vh && rect.bottom > 0;
                }
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: '__tryon_visibility_check',
                  visible: visible,
                }));
              } catch(e) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: '__tryon_visibility_check',
                  visible: false,
                }));
              }
              true;
            `);
          }
        } else if (data.type === '__tryon_visibility_check') {
          if (data.visible) {
            // Image visible on same page — inject directly
            rlog('TryOn', 'Same URL, image visible — injecting directly');
            const result = useAppStore.getState().tryOnResult;
            if (result && webViewRef.current && mountedRef.current) {
              webViewRef.current.injectJavaScript(`
                try {
                  if (window.__tryonReplaceImage) {
                    window.__tryonReplaceImage(${JSON.stringify(result)});
                  }
                } catch(e) {}
                true;
              `);
              setTryOnResult(null);
            }
          } else {
            // Same page but image not visible (scrolled/carousel) — refresh
            rlog('TryOn', 'Same URL, image not visible — refreshing');
            setTryOnResult(null);
            if (webViewRef.current) webViewRef.current.reload();
          }
        }
      } catch (err) {
        // ignore non-JSON messages
      }
    },
    [onTryOnRequest, setTryOnResult, setCurrentUrl]
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
        // Hide native try-on CTA — WebView retry button handles retries
        setDetectedProduct(null);
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
      // Track store browsed when navigating to a new domain
      try {
        const newDomain = new URL(navState.url).hostname;
        if (newDomain !== lastBrowsedDomainRef.current) {
          lastBrowsedDomainRef.current = newDomain;
          posthog?.capture(ANALYTICS_EVENTS.STORE_BROWSED, {
            store_name: getStoreName(navState.url),
            url: navState.url,
          });
        }
      } catch {}
      initialLoadDone.current = false;
      setDetectedProduct(null); // Clear until new page detects product
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
        {/* Left: close + back */}
        <View style={styles.navLeft}>
          <TouchableOpacity
            onPress={() => { if (!isLocked && onClose) onClose(); }}
            style={[styles.navBtn, isLocked && styles.navBtnDisabled]}
            disabled={isLocked}
            accessibilityLabel="Close browser"
            accessibilityRole="button"
          >
            <Text style={[styles.navBtnText, styles.navCloseText, isLocked && styles.navBtnTextDisabled]}>{'\u2715'}</Text>
          </TouchableOpacity>

          {canGoBack && (
            <TouchableOpacity
              onPress={() => !isLocked && webViewRef.current?.goBack()}
              style={[styles.navBtn, isLocked && styles.navBtnDisabled]}
              disabled={isLocked}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Text style={[styles.navBtnText, styles.navBackText, isLocked && styles.navBtnTextDisabled]}>{'\u2190'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Center: title + domain */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleText} numberOfLines={1}>
            {pageTitle || 'loading'}
          </Text>
          <Text style={styles.domainText} numberOfLines={1}>
            {currentUrl ? new URL(currentUrl).hostname.replace(/^www\./, '') : ''}
          </Text>
        </View>

        {/* Right: reload */}
        <View style={styles.navRight}>
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
      </View>

      {/* WebView */}
      <View style={[styles.webViewContainer, { marginBottom: (detectedProduct || tryOnLoading) ? 0 : TAB_BAR_BASE_HEIGHT + insets.bottom }]}>
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
              <ActivityIndicator size="small" color={COLORS.primaryContainer} />
            </View>
          </View>
        )}
      </View>

      {/* Native try-on button OR progress bar — between WebView and tab bar */}
      {tryOnLoading ? (
        <View style={{ marginBottom: TAB_BAR_BASE_HEIGHT + insets.bottom, overflow: 'visible' }}>
          {tryOnThumbUrl && (
            <View
              style={[
                styles.tryOnThumb,
                { transform: [{ rotate: `${tryOnThumbAngle.current}deg` }] },
              ]}
            >
              <Image
                source={{ uri: tryOnThumbUrl }}
                style={{ width: '100%', height: '100%', borderRadius: BORDER_RADIUS.md }}
                resizeMode="cover"
              />
            </View>
          )}
          <View style={styles.tryOnProgressBar}>
            <View style={[styles.tryOnProgressFill, { width: `${tryOnProgress}%` }]} />
            <Text style={styles.tryOnProgressText}>{tryOnQuip}</Text>
          </View>
        </View>
      ) : detectedProduct ? (
        <View style={{ marginBottom: TAB_BAR_BASE_HEIGHT + insets.bottom }}>
          <TouchableOpacity
            style={styles.tryOnBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (detectedProduct.imageUrl) {
                const imgUrl = detectedProduct.imageUrl;
                const pgUrl = detectedProduct.pageUrl;
                // Set thumb for progress bar (stays visible throughout)
                tryOnThumbAngle.current = -12 + Math.random() * 24; // random -12 to 12 degrees
                setTryOnThumbUrl(imgUrl);
                // Start fly-down animation
                setFlyingImage(imgUrl);
                flyAnim.setValue(0);
                Animated.timing(flyAnim, {
                  toValue: 1,
                  duration: 1400,
                  useNativeDriver: true,
                  easing: (t: number) => t * (2 - t),
                }).start(() => {
                  setFlyingImage(null); // Remove overlay, thumb in bar takes over
                });
                // Fire try-on after animation is mostly visible
                setTimeout(() => {
                  setDetectedProduct(null);
                  onTryOnRequest({ imageUrl: imgUrl, pageUrl: pgUrl });
                }, 900);
              }
            }}
          >
            <Text style={styles.tryOnBtnText}>{'\u2728'} try this on</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Flying image animation — shrinks from center to bottom-left into progress bar */}
      {flyingImage && (
        <Animated.Image
          source={{ uri: flyingImage }}
          style={[
            styles.flyingImage,
            {
              transform: [
                {
                  translateX: flyAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, -(W * 0.15), -(W * 0.38)],
                  }),
                },
                {
                  translateY: flyAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, H * 0.3, H * 0.7],
                  }),
                },
                {
                  scale: flyAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [1, 0.5, 0.18],
                  }),
                },
                {
                  rotate: flyAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${tryOnThumbAngle.current}deg`],
                  }),
                },
              ],
            },
          ]}
        />
      )}

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
    backgroundColor: COLORS.background,
  },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: BORDERS.medium,
    borderBottomColor: COLORS.surfaceContainerHigh,
    backgroundColor: COLORS.background,
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.25,
  },
  navBtnText: {
    color: COLORS.onSurface,
    fontSize: 22,
    fontWeight: '500',
  },
  navCloseText: {
    fontWeight: '800',
  },
  navBackText: {
    fontSize: 24,
  },
  navBtnTextDisabled: {
    color: COLORS.outline,
  },
  titleBlock: {
    flex: 1,
    paddingHorizontal: 14,
  },
  titleText: {
    color: COLORS.onSurface,
    fontSize: 15,
    fontWeight: '700',
  },
  domainText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '400',
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingSpinner: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryOnBtn: {
    backgroundColor: COLORS.primaryContainer,
    borderTopWidth: BORDERS.medium,
    borderTopColor: COLORS.onSurface,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  tryOnBtnText: {
    fontFamily: FONTS.headline,
    fontSize: 16,
    color: COLORS.onPrimary,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tryOnProgressBar: {
    height: 52,
    backgroundColor: COLORS.surfaceContainerHighest,
    borderTopWidth: BORDERS.medium,
    borderTopColor: COLORS.onSurface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  tryOnThumb: {
    position: 'absolute',
    left: 8,
    bottom: 16,
    width: 72,
    height: 96,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.medium,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    zIndex: 2,
    ...SHADOWS.hard,
    ...Platform.select({ android: { elevation: 8 } }),
  },
  tryOnProgressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: COLORS.primary,
    borderRightWidth: BORDERS.medium,
    borderRightColor: COLORS.onSurface,
  },
  flyingImage: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    marginLeft: -70,
    width: 140,
    height: 185,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: BORDERS.thick,
    borderColor: COLORS.onSurface,
    backgroundColor: COLORS.surfaceContainerLowest,
    zIndex: 9999,
    ...SHADOWS.hard,
    ...Platform.select({ android: { elevation: 12 } }),
  },
  tryOnProgressText: {
    fontFamily: FONTS.headline,
    fontSize: 14,
    color: COLORS.onSurface,
    letterSpacing: -0.3,
    textTransform: 'lowercase',
    includeFontPadding: false,
    textAlignVertical: 'center',
    zIndex: 1,
  },
});
