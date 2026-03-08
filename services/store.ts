import { create } from 'zustand';
import { ChatMessage } from './gemini';
import { SavedTryOn } from '@/utils/imageUtils';

export type AppMode = 'chat' | 'webview';

interface AppState {
  // Onboarding
  selfieUri: string | null;
  setSelfieUri: (uri: string | null) => void;
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
  tryOnResult: string | null; // base64
  setTryOnResult: (result: string | null) => void;
  currentProduct: {
    imageUrl: string;
    productName: string;
    productPrice?: string;
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
  videoDataUri: string | null; // data:video/mp4;base64,...
  setVideoDataUri: (uri: string | null) => void;
  lastTryOnBase64: string | null; // keep the try-on result for video generation
  setLastTryOnBase64: (base64: string | null) => void;
  lastProductName: string | null;
  setLastProductName: (name: string | null) => void;

  // Chat bubble visibility (when in webview mode)
  chatBubbleExpanded: boolean;
  setChatBubbleExpanded: (expanded: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selfieUri: null,
  setSelfieUri: (uri) => set({ selfieUri: uri }),
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
  lastTryOnBase64: null,
  setLastTryOnBase64: (base64) => set({ lastTryOnBase64: base64 }),
  lastProductName: null,
  setLastProductName: (name) => set({ lastProductName: name }),

  chatBubbleExpanded: false,
  setChatBubbleExpanded: (expanded) => set({ chatBubbleExpanded: expanded }),
}));
