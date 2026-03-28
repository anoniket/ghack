import { useAppStore, SavedTryOn, ChatMessage } from '@/services/store';

// Reset the store between tests
beforeEach(() => {
  useAppStore.setState({
    deviceId: null,
    selfieUris: [],
    selfieS3Keys: [],
    onboardingComplete: false,
    messages: [],
    isTyping: false,
    currentUrl: null,
    tryOnLoading: false,
    tryOnResult: null,
    currentProduct: null,
    savedTryOns: [],
    historyLoaded: false,
    videoLoading: false,
    videoDataUri: null,
    lastSessionId: null,
    lastTryonS3Key: null,
    preferredModel: 'nb2',
  });
});

describe('useAppStore', () => {
  describe('device', () => {
    it('initializes with null deviceId', () => {
      expect(useAppStore.getState().deviceId).toBeNull();
    });

    it('setDeviceId updates deviceId', () => {
      useAppStore.getState().setDeviceId('device-123');
      expect(useAppStore.getState().deviceId).toBe('device-123');
    });
  });

  describe('onboarding / selfie', () => {
    it('initializes with empty selfie arrays and incomplete onboarding', () => {
      const state = useAppStore.getState();
      expect(state.selfieUris).toEqual([]);
      expect(state.selfieS3Keys).toEqual([]);
      expect(state.onboardingComplete).toBe(false);
    });

    it('setSelfieUris stores URIs', () => {
      useAppStore.getState().setSelfieUris(['/photo1.jpg', '/photo2.jpg']);
      expect(useAppStore.getState().selfieUris).toEqual(['/photo1.jpg', '/photo2.jpg']);
    });

    it('setSelfieS3Keys stores keys', () => {
      useAppStore.getState().setSelfieS3Keys(['key1', 'key2']);
      expect(useAppStore.getState().selfieS3Keys).toEqual(['key1', 'key2']);
    });

    it('setOnboardingComplete toggles onboarding state', () => {
      useAppStore.getState().setOnboardingComplete(true);
      expect(useAppStore.getState().onboardingComplete).toBe(true);
      useAppStore.getState().setOnboardingComplete(false);
      expect(useAppStore.getState().onboardingComplete).toBe(false);
    });
  });

  describe('messages', () => {
    it('initializes with empty messages', () => {
      expect(useAppStore.getState().messages).toEqual([]);
    });

    it('addMessage appends a message', () => {
      const msg: ChatMessage = {
        id: 'msg1',
        role: 'user',
        text: 'Hello',
        timestamp: Date.now(),
      };
      useAppStore.getState().addMessage(msg);
      expect(useAppStore.getState().messages).toHaveLength(1);
      expect(useAppStore.getState().messages[0].text).toBe('Hello');
    });

    it('addMessage caps at 100 messages', () => {
      // Add 101 messages
      for (let i = 0; i < 101; i++) {
        useAppStore.getState().addMessage({
          id: `msg_${i}`,
          role: 'user',
          text: `Message ${i}`,
          timestamp: i,
        });
      }
      const state = useAppStore.getState();
      expect(state.messages.length).toBe(100);
      // The first message (index 0) should have been dropped
      expect(state.messages[0].text).toBe('Message 1');
      expect(state.messages[99].text).toBe('Message 100');
    });

    it('clearMessages empties the array', () => {
      useAppStore.getState().addMessage({
        id: 'msg1',
        role: 'user',
        text: 'Hello',
        timestamp: Date.now(),
      });
      useAppStore.getState().clearMessages();
      expect(useAppStore.getState().messages).toEqual([]);
    });

    it('setIsTyping toggles typing state', () => {
      expect(useAppStore.getState().isTyping).toBe(false);
      useAppStore.getState().setIsTyping(true);
      expect(useAppStore.getState().isTyping).toBe(true);
    });
  });

  describe('webview', () => {
    it('currentUrl defaults to null', () => {
      expect(useAppStore.getState().currentUrl).toBeNull();
    });

    it('setCurrentUrl updates the URL', () => {
      useAppStore.getState().setCurrentUrl('https://www.nike.com');
      expect(useAppStore.getState().currentUrl).toBe('https://www.nike.com');
    });

    it('setCurrentUrl can be set back to null', () => {
      useAppStore.getState().setCurrentUrl('https://example.com');
      useAppStore.getState().setCurrentUrl(null);
      expect(useAppStore.getState().currentUrl).toBeNull();
    });
  });

  describe('try-on', () => {
    it('tryOnLoading defaults to false', () => {
      expect(useAppStore.getState().tryOnLoading).toBe(false);
    });

    it('setTryOnLoading toggles loading state', () => {
      useAppStore.getState().setTryOnLoading(true);
      expect(useAppStore.getState().tryOnLoading).toBe(true);
    });

    it('currentProduct defaults to null', () => {
      expect(useAppStore.getState().currentProduct).toBeNull();
    });

    it('setCurrentProduct stores product data', () => {
      const product = { imageUrl: 'https://img.com/shirt.jpg', pageUrl: 'https://myntra.com/shirt' };
      useAppStore.getState().setCurrentProduct(product);
      expect(useAppStore.getState().currentProduct).toEqual(product);
    });

    it('setTryOnResult stores and clears result', () => {
      useAppStore.getState().setTryOnResult('base64data');
      expect(useAppStore.getState().tryOnResult).toBe('base64data');
      useAppStore.getState().setTryOnResult(null);
      expect(useAppStore.getState().tryOnResult).toBeNull();
    });
  });

  describe('saved try-ons', () => {
    it('defaults to empty array', () => {
      expect(useAppStore.getState().savedTryOns).toEqual([]);
    });

    it('setSavedTryOns replaces the saved list', () => {
      const items: SavedTryOn[] = [
        { id: '1', imageUri: 'uri1', timestamp: 1000, sessionId: 's1' },
        { id: '2', imageUri: 'uri2', timestamp: 2000, sessionId: 's2' },
      ];
      useAppStore.getState().setSavedTryOns(items);
      expect(useAppStore.getState().savedTryOns).toHaveLength(2);
      expect(useAppStore.getState().savedTryOns[0].id).toBe('1');
    });

    it('historyLoaded tracks fetch status', () => {
      expect(useAppStore.getState().historyLoaded).toBe(false);
      useAppStore.getState().setHistoryLoaded(true);
      expect(useAppStore.getState().historyLoaded).toBe(true);
    });
  });

  describe('video', () => {
    it('videoLoading defaults to false', () => {
      expect(useAppStore.getState().videoLoading).toBe(false);
    });

    it('setVideoDataUri stores a URL', () => {
      useAppStore.getState().setVideoDataUri('https://cdn.com/video.mp4');
      expect(useAppStore.getState().videoDataUri).toBe('https://cdn.com/video.mp4');
    });

    it('lastSessionId and lastTryonS3Key track the latest generation', () => {
      useAppStore.getState().setLastSessionId('sess-123');
      useAppStore.getState().setLastTryonS3Key('s3-key-456');
      expect(useAppStore.getState().lastSessionId).toBe('sess-123');
      expect(useAppStore.getState().lastTryonS3Key).toBe('s3-key-456');
    });
  });

  describe('model preference', () => {
    it('defaults to nb2', () => {
      expect(useAppStore.getState().preferredModel).toBe('nb2');
    });

    it('can be changed to any valid model', () => {
      useAppStore.getState().setPreferredModel('nb1');
      expect(useAppStore.getState().preferredModel).toBe('nb1');
      useAppStore.getState().setPreferredModel('pro');
      expect(useAppStore.getState().preferredModel).toBe('pro');
    });
  });
});
