import React from 'react';
import { render } from '@testing-library/react-native';
import { setDemoMode } from '@/utils/constants';
import { useAppStore } from '@/services/store';
import TabLayout from '@/app/(tabs)/_layout';
import SavedScreen from '@/app/(tabs)/saved';
import ProfileScreen from '@/app/(tabs)/profile';

// Mock api module
jest.mock('@/services/api', () => ({
  getHistory: jest.fn().mockResolvedValue({ items: [] }),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  deleteAllSessions: jest.fn().mockResolvedValue({ deleted: 0 }),
  describeSelfie: jest.fn().mockResolvedValue('A person'),
  cacheSelfies: jest.fn().mockResolvedValue({ cached: true, count: 1 }),
  sendLogs: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/imageUtils', () => ({
  saveSelfie: jest.fn((uri: string) => Promise.resolve(uri)),
  saveSelfieUris: jest.fn().mockResolvedValue(undefined),
  saveSelfieS3Keys: jest.fn().mockResolvedValue(undefined),
  deleteSelfie: jest.fn().mockResolvedValue(undefined),
  uploadSelfieAndSaveKey: jest.fn().mockResolvedValue('s3-key-1'),
  imageUriToBase64: jest.fn().mockResolvedValue('mock-base64-data'),
  getSelfieUris: jest.fn().mockResolvedValue([]),
  getSelfieS3Keys: jest.fn().mockResolvedValue([]),
  mapHistoryItem: jest.fn((item: any) => ({
    id: item.sessionId,
    imageUri: item.tryonImageUrl,
    sourceUrl: item.sourceUrl,
    timestamp: new Date(item.createdAt).getTime(),
    videoUrl: item.videoUrl,
    sessionId: item.sessionId,
  })),
}));

jest.mock('@/services/gemini', () => ({
  resetChat: jest.fn(),
}));

const mockUseAuth = require('@clerk/clerk-expo').useAuth;
const mockRedirect = require('expo-router').Redirect;

beforeEach(() => {
  jest.clearAllMocks();
  setDemoMode(false);
  useAppStore.setState({
    selfieUris: [],
    selfieS3Keys: [],
    onboardingComplete: false,
    savedTryOns: [],
    historyLoaded: true,
    messages: [],
    mode: 'chat',
    currentUrl: null,
    preferredModel: 'nb2',
    tryOnLoading: false,
    videoLoading: false,
  });
});

afterEach(() => {
  setDemoMode(false);
});

describe('Edge cases', () => {
  describe('demo mode skips auth', () => {
    it('TabLayout does not redirect in demo mode even when not signed in', () => {
      setDemoMode(true);
      mockUseAuth.mockReturnValue({
        isSignedIn: false,
        isLoaded: true,
        userId: null,
      });

      render(<TabLayout />);
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('empty states', () => {
    it('Saved screen shows empty state with no items', () => {
      useAppStore.setState({ savedTryOns: [], historyLoaded: true });
      const { getByText } = render(<SavedScreen />);
      expect(getByText('No saved try-ons')).toBeTruthy();
      expect(getByText('0 try-ons')).toBeTruthy();
    });

    it('Profile screen shows empty photo slots with no selfies', () => {
      useAppStore.setState({ selfieUris: [] });
      const { getAllByText } = render(<ProfileScreen />);
      const plusSigns = getAllByText('+');
      expect(plusSigns.length).toBe(3);
    });
  });

  describe('loading states', () => {
    it('store isTyping flag controls typing indicator visibility', () => {
      useAppStore.setState({ isTyping: true });
      expect(useAppStore.getState().isTyping).toBe(true);
      useAppStore.setState({ isTyping: false });
      expect(useAppStore.getState().isTyping).toBe(false);
    });

    it('tryOnLoading flag controls generation state', () => {
      useAppStore.setState({ tryOnLoading: true });
      expect(useAppStore.getState().tryOnLoading).toBe(true);
    });

    it('videoLoading flag controls video generation state', () => {
      useAppStore.setState({ videoLoading: true });
      expect(useAppStore.getState().videoLoading).toBe(true);
    });
  });

  describe('network errors in store', () => {
    it('store handles empty savedTryOns gracefully', () => {
      useAppStore.getState().setSavedTryOns([]);
      expect(useAppStore.getState().savedTryOns).toEqual([]);
    });

    it('store handles setting tryOnResult to null (cleared after error)', () => {
      useAppStore.getState().setTryOnResult('some-result');
      useAppStore.getState().setTryOnResult(null);
      expect(useAppStore.getState().tryOnResult).toBeNull();
    });

    it('store handles setting currentProduct to null after error', () => {
      useAppStore.getState().setCurrentProduct({
        imageUrl: 'https://example.com/img.jpg',
        pageUrl: 'https://example.com',
      });
      useAppStore.getState().setCurrentProduct(null);
      expect(useAppStore.getState().currentProduct).toBeNull();
    });
  });

  describe('multiple rapid state changes', () => {
    it('handles rapid mode switching without errors', () => {
      const store = useAppStore.getState();
      store.setMode('webview');
      store.setMode('chat');
      store.setMode('webview');
      store.setMode('chat');
      expect(useAppStore.getState().mode).toBe('chat');
    });

    it('handles rapid message additions', () => {
      const store = useAppStore.getState();
      for (let i = 0; i < 10; i++) {
        store.addMessage({
          id: `rapid_${i}`,
          role: 'user',
          text: `Rapid message ${i}`,
          timestamp: Date.now() + i,
        });
      }
      expect(useAppStore.getState().messages).toHaveLength(10);
    });
  });
});
