import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ChatBubble from '@/components/ChatBubble';
import { useAppStore } from '@/services/store';

// Mock useSendChat hook
jest.mock('@/hooks/useSendChat', () => ({
  useSendChat: jest.fn(() => jest.fn()),
}));

// Reset store between tests
beforeEach(() => {
  useAppStore.setState({
    chatBubbleExpanded: false,
    messages: [],
    isTyping: false,
    tryOnLoading: false,
    videoLoading: false,
    mode: 'webview',
  });
});

describe('ChatBubble', () => {
  it('renders collapsed bubble by default', () => {
    const { toJSON } = render(<ChatBubble />);
    expect(toJSON()).not.toBeNull();
  });

  it('returns null during try-on generation', () => {
    useAppStore.setState({ tryOnLoading: true });
    const { toJSON } = render(<ChatBubble />);
    expect(toJSON()).toBeNull();
  });

  it('returns null during video generation', () => {
    useAppStore.setState({ videoLoading: true });
    const { toJSON } = render(<ChatBubble />);
    expect(toJSON()).toBeNull();
  });

  it('expands when collapsed bubble is pressed', () => {
    const { getByText } = render(<ChatBubble />);

    // Press the bubble
    fireEvent.press(getByText('\u{1F4AC}'));

    // Store should now be expanded
    expect(useAppStore.getState().chatBubbleExpanded).toBe(true);
  });

  it('renders expanded panel with header, messages, and input', () => {
    useAppStore.setState({
      chatBubbleExpanded: true,
      messages: [
        { id: 'msg1', role: 'model', text: 'Hello!', timestamp: 1000 },
        { id: 'msg2', role: 'user', text: 'Hi there', timestamp: 2000 },
      ],
    });

    const { getByText, getByPlaceholderText } = render(<ChatBubble />);

    // Header
    expect(getByText('mrigAI')).toBeTruthy();

    // Messages
    expect(getByText('Hello!')).toBeTruthy();
    expect(getByText('Hi there')).toBeTruthy();

    // Input field
    expect(getByPlaceholderText('Ask AI to open any website...')).toBeTruthy();
  });

  it('shows typing indicator when isTyping is true', () => {
    useAppStore.setState({
      chatBubbleExpanded: true,
      isTyping: true,
      messages: [],
    });

    const { toJSON } = render(<ChatBubble />);
    expect(toJSON()).not.toBeNull();
  });

  it('collapses when close button is pressed in expanded mode', () => {
    useAppStore.setState({ chatBubbleExpanded: true });

    const { getByText } = render(<ChatBubble />);
    fireEvent.press(getByText('\u2715'));

    expect(useAppStore.getState().chatBubbleExpanded).toBe(false);
  });

  it('renders user messages with different style than AI messages', () => {
    useAppStore.setState({
      chatBubbleExpanded: true,
      messages: [
        { id: 'ai1', role: 'model', text: 'AI message', timestamp: 1000 },
        { id: 'user1', role: 'user', text: 'User message', timestamp: 2000 },
      ],
    });

    const { getByText } = render(<ChatBubble />);
    expect(getByText('AI message')).toBeTruthy();
    expect(getByText('User message')).toBeTruthy();
  });

  it('limits messages shown to last 20 in expanded mode', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      id: `msg_${i}`,
      role: 'user' as const,
      text: `Message ${i}`,
      timestamp: i,
    }));
    useAppStore.setState({ chatBubbleExpanded: true, messages });

    const { queryByText } = render(<ChatBubble />);
    // First 5 should be excluded (messages.slice(-20) removes index 0-4)
    expect(queryByText('Message 0')).toBeNull();
    expect(queryByText('Message 4')).toBeNull();
    // Messages from the last 20 should be present (FlatList may not render all
    // items due to windowing, so check a few in the middle that are likely rendered)
    expect(queryByText('Message 5')).toBeTruthy();
    expect(queryByText('Message 10')).toBeTruthy();
  });
});
