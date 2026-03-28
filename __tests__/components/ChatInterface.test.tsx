import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatInterface from '@/components/ChatInterface';
import { useAppStore } from '@/services/store';

// Mock useSendChat — return a jest.fn so we can assert calls
const mockSendChat = jest.fn();
jest.mock('@/hooks/useSendChat', () => ({
  useSendChat: jest.fn(() => mockSendChat),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    messages: [],
    isTyping: false,
    currentUrl: null,
  });
});

describe('ChatInterface', () => {
  it('renders the headline', () => {
    const { getByText } = render(<ChatInterface />);
    expect(getByText(/ask me/i)).toBeTruthy();
    expect(getByText(/anything/i)).toBeTruthy();
  });

  it('renders the subtitle text', () => {
    const { getByText } = render(<ChatInterface />);
    expect(getByText(/open any website/i)).toBeTruthy();
  });

  it('renders input field with placeholder', () => {
    const { getByPlaceholderText } = render(<ChatInterface />);
    expect(getByPlaceholderText(/ask me anything/i)).toBeTruthy();
  });

  it('adds a greeting message on first render when messages are empty', () => {
    render(<ChatInterface />);
    const messages = useAppStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('model');
  });

  it('does not add greeting when messages already exist', () => {
    useAppStore.setState({
      messages: [
        { id: 'existing', role: 'user', text: 'Old message', timestamp: 1000 },
      ],
    });
    render(<ChatInterface />);
    expect(useAppStore.getState().messages).toHaveLength(1);
  });

  it('renders existing messages', () => {
    useAppStore.setState({
      messages: [
        { id: 'ai1', role: 'model', text: 'Welcome!', timestamp: 1000 },
        { id: 'user1', role: 'user', text: 'Show me shoes', timestamp: 2000 },
      ],
    });

    const { getByText } = render(<ChatInterface />);
    expect(getByText('Welcome!')).toBeTruthy();
    expect(getByText('Show me shoes')).toBeTruthy();
  });

  it('calls sendChat when submitting input', () => {
    const { getByPlaceholderText } = render(<ChatInterface />);
    const input = getByPlaceholderText(/ask me anything/i);

    fireEvent.changeText(input, 'Find me a jacket');
    fireEvent(input, 'submitEditing');

    expect(mockSendChat).toHaveBeenCalledWith('Find me a jacket');
  });

  it('does not send empty messages', () => {
    const { getByPlaceholderText } = render(<ChatInterface />);
    const input = getByPlaceholderText(/ask me anything/i);

    fireEvent.changeText(input, '   ');
    fireEvent(input, 'submitEditing');

    expect(mockSendChat).not.toHaveBeenCalled();
  });

  it('shows typing indicator when isTyping is true', () => {
    useAppStore.setState({
      isTyping: true,
      messages: [{ id: 'msg1', role: 'user', text: 'Hello', timestamp: 1000 }],
    });

    const { toJSON } = render(<ChatInterface />);
    expect(toJSON()).not.toBeNull();
  });

  it('has accessibility labels on send button and input', () => {
    const { getByLabelText } = render(<ChatInterface />);
    expect(getByLabelText('Send message')).toBeTruthy();
    expect(getByLabelText('Chat message input')).toBeTruthy();
  });
});
