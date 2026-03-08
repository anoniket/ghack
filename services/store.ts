import { create } from 'zustand';

export type AppMode = 'chat' | 'webview';

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

  // Onboarding
  selfieUri: string | null;
  setSelfieUri: (uri: string | null) => void;
  selfieS3Key: string | null;
  setSelfieS3Key: (key: string | null) => void;
  onboardingComplete: boolean;
  setOnboardingComplete: (complete: boolean) => void;

  // Chat
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;

  // App mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

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

  // Video generation
  videoLoading: boolean;
  setVideoLoading: (loading: boolean) => void;
  videoDataUri: string | null;
  setVideoDataUri: (uri: string | null) => void;
  videoJobId: string | null;
  setVideoJobId: (id: string | null) => void;
  lastSessionId: string | null;
  setLastSessionId: (id: string | null) => void;
  lastTryonS3Key: string | null;
  setLastTryonS3Key: (key: string | null) => void;

  // Chat bubble visibility (when in webview mode)
  chatBubbleExpanded: boolean;
  setChatBubbleExpanded: (expanded: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  deviceId: null,
  setDeviceId: (id) => set({ deviceId: id }),

  selfieUri: null,
  setSelfieUri: (uri) => set({ selfieUri: uri }),
  selfieS3Key: null,
  setSelfieS3Key: (key) => set({ selfieS3Key: key }),
  onboardingComplete: false,
  setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  isTyping: false,
  setIsTyping: (typing) => set({ isTyping: typing }),

  mode: 'chat',
  setMode: (mode) => set({ mode }),

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

  videoLoading: false,
  setVideoLoading: (loading) => set({ videoLoading: loading }),
  videoDataUri: null,
  setVideoDataUri: (uri) => set({ videoDataUri: uri }),
  videoJobId: null,
  setVideoJobId: (id) => set({ videoJobId: id }),
  lastSessionId: null,
  setLastSessionId: (id) => set({ lastSessionId: id }),
  lastTryonS3Key: null,
  setLastTryonS3Key: (key) => set({ lastTryonS3Key: key }),

  chatBubbleExpanded: false,
  setChatBubbleExpanded: (expanded) => set({ chatBubbleExpanded: expanded }),
}));
