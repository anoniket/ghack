import React from 'react';
import { render } from '@testing-library/react-native';
import { setDemoMode, isDemoMode } from '@/utils/constants';
import { useAppStore } from '@/services/store';
import TabLayout from '@/app/(tabs)/_layout';

const mockUseAuth = require('@clerk/clerk-expo').useAuth;
const mockUseUser = require('@clerk/clerk-expo').useUser;
const mockPostHog = require('posthog-react-native').usePostHog();
const mockRedirect = require('expo-router').Redirect;

describe('Auth flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setDemoMode(false);
    useAppStore.setState({
      tryOnLoading: false,
      videoLoading: false,
    });
  });

  afterEach(() => {
    setDemoMode(false);
  });

  describe('demo mode bypass', () => {
    it('isDemoMode returns false by default', () => {
      expect(isDemoMode()).toBe(false);
    });

    it('demo mode can be enabled', () => {
      setDemoMode(true);
      expect(isDemoMode()).toBe(true);
    });

    it('demo mode skips auth gate entirely', () => {
      setDemoMode(true);
      mockUseAuth.mockReturnValue({
        isSignedIn: false,
        isLoaded: true,
        userId: null,
      });

      render(<TabLayout />);
      // Should not redirect even though not signed in
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe('PostHog identify on sign in', () => {
    it('calls posthog.identify when user is signed in', () => {
      setDemoMode(false);
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        userId: 'user_abc123',
      });

      mockUseUser.mockReturnValue({
        user: {
          fullName: 'John Doe',
          primaryEmailAddress: { emailAddress: 'john@example.com' },
          imageUrl: 'https://example.com/avatar.jpg',
        },
      });

      render(<TabLayout />);

      expect(mockPostHog.identify).toHaveBeenCalledWith('user_abc123', {
        email: 'john@example.com',
        name: 'John Doe',
      });
    });

    it('does not call posthog.identify when user is not signed in', () => {
      setDemoMode(false);
      mockUseAuth.mockReturnValue({
        isSignedIn: false,
        isLoaded: true,
        userId: null,
      });

      render(<TabLayout />);

      expect(mockPostHog.identify).not.toHaveBeenCalled();
    });
  });
});

describe('Sentry initialization', () => {
  it('Sentry.init is available as a function', () => {
    const Sentry = require('@sentry/react-native');
    expect(Sentry.init).toBeDefined();
    expect(typeof Sentry.init).toBe('function');
  });

  it('Sentry.wrap is available as a function', () => {
    const Sentry = require('@sentry/react-native');
    expect(Sentry.wrap).toBeDefined();
    expect(typeof Sentry.wrap).toBe('function');
  });
});
