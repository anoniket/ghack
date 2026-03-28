import { create } from 'zustand';


export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface SavedTryOn {
  id: string;
  imageUri: string; // CDN URL or local URI
  sourceUrl?: string;
  timestamp: number;
  videoUrl?: string;
  sessionId?: string;
}

interface AppState {
  // Device
  deviceId: string | null;
  setDeviceId: (id: string) => void;

  // AI consent
  aiConsentGiven: boolean;
  setAiConsentGiven: (given: boolean) => void;

  // Onboarding (multi-selfie)
  selfieUris: string[];
  setSelfieUris: (uris: string[]) => void;
  selfieS3Keys: string[];
  setSelfieS3Keys: (keys: string[]) => void;
  onboardingComplete: boolean;
  setOnboardingComplete: (complete: boolean) => void;

  // Chat
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;

  // WebView
  currentUrl: string | null;
  setCurrentUrl: (url: string | null) => void;

  // Try-On
  tryOnLoading: boolean;
  setTryOnLoading: (loading: boolean) => void;
  tryOnResult: string | null; // CDN URL (was base64)
  setTryOnResult: (result: string | null) => void;
  currentProduct: {
    imageUrl: string;
    pageUrl?: string;
    retry?: boolean;
  } | null;
  setCurrentProduct: (product: AppState['currentProduct']) => void;

  // Saved try-ons
  savedTryOns: SavedTryOn[];
  setSavedTryOns: (tryOns: SavedTryOn[]) => void;
  historyLoaded: boolean;
  setHistoryLoaded: (loaded: boolean) => void;

  // Video generation
  videoLoading: boolean;
  setVideoLoading: (loading: boolean) => void;
  videoDataUri: string | null;
  setVideoDataUri: (uri: string | null) => void;
  lastSessionId: string | null;
  setLastSessionId: (id: string | null) => void;
  lastTryonS3Key: string | null;
  setLastTryonS3Key: (key: string | null) => void;

  // Model preference (debug)
  preferredModel: 'nb1' | 'nb2' | 'pro';
  setPreferredModel: (model: 'nb1' | 'nb2' | 'pro') => void;
}

export const useAppStore = create<AppState>((set) => ({
  deviceId: null,
  setDeviceId: (id) => set({ deviceId: id }),

  aiConsentGiven: false,
  setAiConsentGiven: (given) => set({ aiConsentGiven: given }),

  selfieUris: [],
  setSelfieUris: (uris) => set({ selfieUris: uris }),
  selfieS3Keys: [],
  setSelfieS3Keys: (keys) => set({ selfieS3Keys: keys }),
  onboardingComplete: false,
  setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages.slice(-99), message] })),
  clearMessages: () => set({ messages: [] }),
  isTyping: false,
  setIsTyping: (typing) => set({ isTyping: typing }),

  currentUrl: null,
  setCurrentUrl: (url) => set({ currentUrl: url }),

  tryOnLoading: false,
  setTryOnLoading: (loading) => set({ tryOnLoading: loading }),
  tryOnResult: null,
  setTryOnResult: (result) => set({ tryOnResult: result }),
  currentProduct: null,
  setCurrentProduct: (product) => set({ currentProduct: product }),

  savedTryOns: [],
  setSavedTryOns: (tryOns) => set({ savedTryOns: tryOns }),
  historyLoaded: false,
  setHistoryLoaded: (loaded) => set({ historyLoaded: loaded }),

  videoLoading: false,
  setVideoLoading: (loading) => set({ videoLoading: loading }),
  videoDataUri: null,
  setVideoDataUri: (uri) => set({ videoDataUri: uri }),
  lastSessionId: null,
  setLastSessionId: (id) => set({ lastSessionId: id }),
  lastTryonS3Key: null,
  setLastTryonS3Key: (key) => set({ lastTryonS3Key: key }),

  preferredModel: 'nb2',
  setPreferredModel: (model) => set({ preferredModel: model }),
}));
