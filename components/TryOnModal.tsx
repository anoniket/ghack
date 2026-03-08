import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useAppStore } from '@/services/store';
import { prepareTryOn, generateTryOn } from '@/services/gemini';
import { saveTryOnResult, getSavedTryOns } from '@/utils/imageUtils';

const { width: W, height: H } = Dimensions.get('window');

export default function TryOnModal() {
  const {
    selfieUri,
    currentProduct,
    setCurrentProduct,
    tryOnLoading,
    setTryOnLoading,
    tryOnResult,
    setTryOnResult,
    setSavedTryOns,
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);
  const [loadingQuip, setLoadingQuip] = useState('');
  const quipInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const visible = currentProduct !== null;

  const LOADING_QUIPS = [
    'mentally undressing you...',
    'its giving main character...',
    'okay u kinda ate that...',
    'checking you out... for science...',
    'not me blushing at pixels...',
    'ur outfit has trust issues...',
    'stripping... the old clothes off...',
    'the AI said wow btw...',
    'fitting room but make it AI...',
    'this is fashion not a crime...',
    'wardrobe malfunction loading...',
    'drip check in progress...',
    'styling you like my crush...',
    'be honest u look expensive...',
    'AI went feral for this one...',
    'the fit is fitting...',
    'gaslight gatekeep girlboss...',
    'ur giving rich auntie vibes...',
    'alexa play sexy back...',
    'mirror mirror on the wall...',
    'no thoughts just drip...',
    'ur card declined but u still ate...',
    'downloading rizz...',
    'AI caught feelings ngl...',
    'objectifying you respectfully...',
    'hold my pixels...',
    'ur body said yes already...',
    'this is legal i promise...',
    'the mannequin is shaking rn...',
    'couture but make it unhinged...',
    'outfit so fire calling 911...',
    'dressing u up like my sim...',
    'the algorithm has a crush...',
    'serving cunt honestly...',
    'ur closet could never...',
    'AI is down bad for u...',
  ];

  const lastQuipRef = useRef('');
  const pickQuip = useCallback(() => {
    let next = LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)];
    while (next === lastQuipRef.current) {
      next = LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)];
    }
    lastQuipRef.current = next;
    return next;
  }, []);

  // Cycle quips fast (every 2s) while loading
  useEffect(() => {
    if (tryOnLoading) {
      setLoadingQuip(pickQuip());
      quipInterval.current = setInterval(() => setLoadingQuip(pickQuip()), 2000);
    } else if (quipInterval.current) {
      clearInterval(quipInterval.current);
      quipInterval.current = null;
    }
    return () => { if (quipInterval.current) clearInterval(quipInterval.current); };
  }, [tryOnLoading]);

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
    setError(null);
    console.log('🎭 [TryOn] ---- GENERATION STARTED ----');
    try {
      const { selfieBase64, productBase64, usePhotoshoot } = await prepareTryOn(
        selfieUri,
        currentProduct.imageUrl
      );
      const resultBase64 = await generateTryOn(selfieBase64, productBase64, usePhotoshoot);
      console.log('🎭 [TryOn] Generation SUCCESS! Result base64 length:', resultBase64.length);
      setTryOnResult(resultBase64);
      // Result will be picked up by WebViewBrowser useEffect and sent to the page
    } catch (err: any) {
      console.error('🎭 [TryOn] Generation FAILED:', err.message || err);
      setError(err.message || 'Failed to generate try-on. Please try again.');
    } finally {
      setTryOnLoading(false);
      console.log('🎭 [TryOn] ---- GENERATION ENDED ----');
    }
  };

  const handleSave = async () => {
    if (!tryOnResult || !currentProduct) return;
    console.log('💾 [TryOn] Saving try-on result to gallery...');
    try {
      await saveTryOnResult(tryOnResult, {
        productName: currentProduct.productName,
        productPrice: currentProduct.productPrice,
        sourceUrl: currentProduct.pageUrl,
      });
      const all = await getSavedTryOns();
      setSavedTryOns(all);
      console.log('💾 [TryOn] Saved successfully! Total saved:', all.length);
      Alert.alert('Saved!', 'Try-on saved to your gallery.');
    } catch (err) {
      console.error('💾 [TryOn] Save FAILED:', err);
      Alert.alert('Error', 'Failed to save try-on.');
    }
  };

  const handleClose = () => {
    console.log('🎭 [TryOn] Modal closed, clearing state');
    setCurrentProduct(null);
    setTryOnResult(null);
    setError(null);
  };

  const handleRetry = () => {
    console.log('🔄 [TryOn] Retrying try-on generation...');
    setTryOnResult(null);
    setError(null);
    startTryOn();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Handle bar */}
          <View style={styles.handleBar}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {currentProduct?.productName || 'Virtual Try-On'}
              </Text>
              {currentProduct?.productPrice && (
                <Text style={styles.price}>{currentProduct.productPrice}</Text>
              )}
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {tryOnLoading && (
              <View style={styles.loadingContainer}>
                <View style={styles.loadingCircle}>
                  <ActivityIndicator size="large" color="#0D0D0D" />
                </View>
                <Text style={styles.loadingText}>{loadingQuip}</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>!</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={handleRetry}
                >
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {tryOnResult && !tryOnLoading && (
              <ScrollView contentContainerStyle={styles.resultContainer}>
                <View style={styles.resultBorder}>
                  <Image
                    source={{ uri: `data:image/png;base64,${tryOnResult}` }}
                    style={styles.resultImage}
                    resizeMode="contain"
                  />
                </View>
              </ScrollView>
            )}
          </View>

          {/* Actions */}
          {tryOnResult && !tryOnLoading && (
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.actionBtn, styles.saveBtn]}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>Save to Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.retryActionBtn]}
                onPress={handleRetry}
                activeOpacity={0.8}
              >
                <Text style={styles.retryActionText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: H * 0.88,
    minHeight: H * 0.5,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 0,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F5F5F5',
  },
  price: {
    fontSize: 14,
    color: '#E8C8A0',
    fontWeight: '600',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
  },
  content: {
    flex: 1,
    minHeight: 300,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: '#E8C8A0',
  },
  loadingText: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingSubtext: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ef4444',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.12)',
    textAlign: 'center',
    lineHeight: 56,
    overflow: 'hidden',
    marginBottom: 16,
  },
  errorText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#E8C8A0',
  },
  retryBtnText: {
    color: '#0D0D0D',
    fontWeight: '700',
    fontSize: 15,
  },
  resultContainer: {
    alignItems: 'center',
    padding: 20,
  },
  resultBorder: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(232,200,160,0.25)',
  },
  resultImage: {
    width: W - 72,
    height: (W - 72) * 1.33,
    borderRadius: 18,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingBottom: 36,
    gap: 12,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionBtn: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#E8C8A0',
  },
  saveBtnText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
  retryActionBtn: {
    paddingHorizontal: 24,
    backgroundColor: '#1A1A1A',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  retryActionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600',
  },
});
