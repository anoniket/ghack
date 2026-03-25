import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SavedScreen from '@/app/(tabs)/saved';
import { useAppStore, SavedTryOn } from '@/services/store';

// Mock api module
jest.mock('@/services/api', () => ({
  getHistory: jest.fn().mockResolvedValue({ items: [] }),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  deleteAllSessions: jest.fn().mockResolvedValue({ deleted: 0 }),
}));

// Mock imageUtils
jest.mock('@/utils/imageUtils', () => ({
  mapHistoryItem: jest.fn((item: any) => ({
    id: item.sessionId,
    imageUri: item.tryonImageUrl,
    sourceUrl: item.sourceUrl,
    timestamp: new Date(item.createdAt).getTime(),
    videoUrl: item.videoUrl,
    sessionId: item.sessionId,
  })),
}));

const NOW = Date.now();

const mockSavedItems: SavedTryOn[] = [
  {
    id: 'tryon-1',
    imageUri: 'https://cdn.example.com/tryon1.jpg',
    sourceUrl: 'https://www.myntra.com/shirts/12345',
    timestamp: NOW,
    sessionId: 'sess-1',
  },
  {
    id: 'tryon-2',
    imageUri: 'https://cdn.example.com/tryon2.jpg',
    sourceUrl: 'https://www.zara.com/in/dress-p999',
    timestamp: NOW - 86400000, // yesterday
    sessionId: 'sess-2',
    videoUrl: 'https://cdn.example.com/video.mp4',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    savedTryOns: [],
    historyLoaded: true,
    mode: 'chat',
    currentUrl: null,
  });
});

describe('SavedScreen', () => {
  it('renders Saved title', () => {
    const { getByText } = render(<SavedScreen />);
    expect(getByText('Saved')).toBeTruthy();
  });

  it('shows empty state when no saved try-ons', () => {
    const { getByText } = render(<SavedScreen />);
    expect(getByText('No saved try-ons')).toBeTruthy();
    expect(getByText(/Browse products and tap/)).toBeTruthy();
  });

  it('shows try-on count', () => {
    const { getByText } = render(<SavedScreen />);
    expect(getByText('0 try-ons')).toBeTruthy();
  });

  it('displays saved items when they exist', () => {
    useAppStore.setState({ savedTryOns: mockSavedItems });
    const { getByText } = render(<SavedScreen />);
    expect(getByText('2 try-ons')).toBeTruthy();
    // Store names derived from URLs
    expect(getByText('Myntra')).toBeTruthy();
    expect(getByText('Zara')).toBeTruthy();
  });

  it('shows Delete All button only when items exist', () => {
    const { queryByText, rerender } = render(<SavedScreen />);
    // No items — no Delete All
    expect(queryByText('Delete All')).toBeNull();

    useAppStore.setState({ savedTryOns: mockSavedItems });
    rerender(<SavedScreen />);
    expect(queryByText('Delete All')).toBeTruthy();
  });

  it('shows empty state elements correctly', () => {
    const { getByText } = render(<SavedScreen />);
    // Empty circle with "+"
    expect(getByText('+')).toBeTruthy();
    expect(getByText('No saved try-ons')).toBeTruthy();
  });

  it('groups items by timeline', () => {
    useAppStore.setState({ savedTryOns: mockSavedItems });
    const { getByText } = render(<SavedScreen />);
    // First item is "today", second is "yesterday"
    // Note: textTransform: 'uppercase' applies at render time, raw text is titlecase
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('Yesterday')).toBeTruthy();
  });

  it('has accessible Delete All button', () => {
    useAppStore.setState({ savedTryOns: mockSavedItems });
    const { getByLabelText } = render(<SavedScreen />);
    expect(getByLabelText('Delete all try-ons')).toBeTruthy();
  });
});
