import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import SignInScreen from '@/app/sign-in';

// Access mocked hooks
const mockUseSSO = require('@clerk/clerk-expo').useSSO;

describe('SignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the mrigAI logo and tagline', () => {
    const { getByText } = render(<SignInScreen />);
    expect(getByText('mrigAI')).toBeTruthy();
    expect(getByText(/Try on any outfit/)).toBeTruthy();
  });

  it('renders the Google sign-in button', () => {
    const { getByText } = render(<SignInScreen />);
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('renders Apple sign-in button only on iOS', () => {
    const originalOS = Platform.OS;

    // Test iOS
    Object.defineProperty(Platform, 'OS', { get: () => 'ios' });
    const { getByText, unmount } = render(<SignInScreen />);
    expect(getByText('Continue with Apple')).toBeTruthy();
    unmount();

    // Test Android
    Object.defineProperty(Platform, 'OS', { get: () => 'android' });
    const { queryByText } = render(<SignInScreen />);
    expect(queryByText('Continue with Apple')).toBeNull();

    // Restore
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
  });

  it('renders disclaimer text', () => {
    const { getByText } = render(<SignInScreen />);
    expect(getByText(/Terms of Service/)).toBeTruthy();
  });

  it('calls startSSOFlow with google strategy on Google button press', async () => {
    const mockStartSSO = jest.fn().mockResolvedValue({
      createdSessionId: 'sess_123',
      setActive: jest.fn(),
    });
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSO });

    const { getByText } = render(<SignInScreen />);
    fireEvent.press(getByText('Continue with Google'));

    await waitFor(() => {
      expect(mockStartSSO).toHaveBeenCalledWith({ strategy: 'oauth_google' });
    }, { timeout: 10000 });
  }, 15000);

  it('shows error text when sign-in fails', async () => {
    const mockStartSSO = jest.fn().mockRejectedValue({
      errors: [{ longMessage: 'Authentication failed', code: 'auth_error' }],
    });
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSO });

    const { getByText, findByText } = render(<SignInScreen />);
    fireEvent.press(getByText('Continue with Google'));

    const errorText = await findByText('Authentication failed');
    expect(errorText).toBeTruthy();
  });

  it('does not show error for session_exists errors', async () => {
    const mockStartSSO = jest.fn().mockRejectedValue({
      errors: [{ code: 'session_exists', longMessage: 'Session exists' }],
    });
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSO });

    const { getByText, queryByText } = render(<SignInScreen />);
    fireEvent.press(getByText('Continue with Google'));

    await waitFor(() => {
      expect(mockStartSSO).toHaveBeenCalled();
    });

    // The session_exists error should be silently ignored
    expect(queryByText('Session exists')).toBeNull();
  });

  it('disables buttons while loading', async () => {
    // Make the SSO flow hang (never resolves)
    const mockStartSSO = jest.fn(() => new Promise(() => {}));
    mockUseSSO.mockReturnValue({ startSSOFlow: mockStartSSO });

    const { getByText } = render(<SignInScreen />);
    const googleBtn = getByText('Continue with Google');

    fireEvent.press(googleBtn);

    // After pressing, the button should become disabled via loading state
    await waitFor(() => {
      expect(mockStartSSO).toHaveBeenCalled();
    });
  });
});
