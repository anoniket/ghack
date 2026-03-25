import React from 'react';
import { render } from '@testing-library/react-native';
import { setDemoMode } from '@/utils/constants';
import { useAppStore } from '@/services/store';
import TabLayout from '@/app/(tabs)/_layout';

const mockUseAuth = require('@clerk/clerk-expo').useAuth;
const mockRedirect = require('expo-router').Redirect;

describe('TabLayout / AuthGate', () => {
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

  it('does not redirect in demo mode even when not signed in', () => {
    setDemoMode(true);
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      userId: null,
    });

    render(<TabLayout />);
    // In demo mode, AuthGate is bypassed entirely, so Redirect should not be called
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when user is not signed in (non-demo mode)', () => {
    setDemoMode(false);
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      userId: null,
    });

    render(<TabLayout />);

    // AuthGate should render <Redirect href="/sign-in" />
    expect(mockRedirect).toHaveBeenCalled();
    // Check the href prop
    const call = mockRedirect.mock.calls[0];
    expect(call[0]).toEqual({ href: '/sign-in' });
  });

  it('does not redirect when user is signed in', () => {
    setDemoMode(false);
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      userId: 'user_123',
    });

    render(<TabLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('does not redirect while auth is still loading', () => {
    setDemoMode(false);
    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      isLoaded: false,
      userId: null,
    });

    render(<TabLayout />);
    // AuthGate returns null when isLoaded is false (before deciding to redirect)
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
