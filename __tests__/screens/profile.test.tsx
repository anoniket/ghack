import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';
import { useAppStore } from '@/services/store';
import { setDemoMode } from '@/utils/constants';

// Mock api module
jest.mock('@/services/api', () => ({
  describeSelfie: jest.fn().mockResolvedValue('A person with brown hair'),
  cacheSelfies: jest.fn().mockResolvedValue({ cached: true, count: 1 }),
  sendLogs: jest.fn().mockResolvedValue(undefined),
}));

// Mock imageUtils
jest.mock('@/utils/imageUtils', () => ({
  saveSelfie: jest.fn((uri: string) => Promise.resolve(uri)),
  saveSelfieUris: jest.fn().mockResolvedValue(undefined),
  saveSelfieS3Keys: jest.fn().mockResolvedValue(undefined),
  deleteSelfie: jest.fn().mockResolvedValue(undefined),
  uploadSelfieAndSaveKey: jest.fn().mockResolvedValue('s3-key-1'),
  imageUriToBase64: jest.fn().mockResolvedValue('mock-base64-data'),
}));

// Mock gemini
jest.mock('@/services/gemini', () => ({
  resetChat: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  setDemoMode(false);
  useAppStore.setState({
    selfieUris: [],
    selfieS3Keys: [],
    onboardingComplete: false,
    messages: [],
    mode: 'chat',
    currentUrl: null,
    preferredModel: 'nb2',
  });
});

afterEach(() => {
  setDemoMode(false);
});

describe('ProfileScreen', () => {
  it('renders Profile title', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('Profile')).toBeTruthy();
  });

  it('renders YOUR PHOTOS section', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('YOUR PHOTOS')).toBeTruthy();
  });

  it('renders AI MODEL section with model options', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('AI MODEL')).toBeTruthy();
    expect(getByText('NB1')).toBeTruthy();
    expect(getByText('NB2')).toBeTruthy();
    expect(getByText('Pro')).toBeTruthy();
  });

  it('renders SETTINGS section with Clear Chat History', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('SETTINGS')).toBeTruthy();
    expect(getByText('Clear Chat History')).toBeTruthy();
  });

  it('renders ABOUT section with mrigAI branding', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('ABOUT')).toBeTruthy();
    expect(getByText('mrigAI')).toBeTruthy();
    expect(getByText('v1.0.0')).toBeTruthy();
    expect(getByText('Powered by Gemini')).toBeTruthy();
  });

  it('renders account section with user info when not in demo mode', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('ACCOUNT')).toBeTruthy();
    expect(getByText('Test User')).toBeTruthy();
    expect(getByText('test@example.com')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('hides account section in demo mode', () => {
    setDemoMode(true);
    const { queryByText } = render(<ProfileScreen />);
    expect(queryByText('ACCOUNT')).toBeNull();
    expect(queryByText('Sign Out')).toBeNull();
  });

  it('renders photo slots (3 empty when no selfies)', () => {
    const { getAllByText } = render(<ProfileScreen />);
    // Should show 3 "+" empty slot placeholders
    const plusSigns = getAllByText('+');
    expect(plusSigns.length).toBe(3);
  });

  it('shows filled slots when selfie URIs exist', () => {
    useAppStore.setState({
      selfieUris: ['/photo1.jpg', '/photo2.jpg'],
    });
    const { getAllByText } = render(<ProfileScreen />);
    // Only 1 empty slot (3 total - 2 filled)
    const plusSigns = getAllByText('+');
    expect(plusSigns.length).toBe(1);
  });

  it('shows PRIMARY badge on first photo slot', () => {
    useAppStore.setState({
      selfieUris: ['/photo1.jpg'],
    });
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('PRIMARY')).toBeTruthy();
  });

  it('switches model preference when model option is pressed', () => {
    const { getByText } = render(<ProfileScreen />);

    fireEvent.press(getByText('NB1'));
    expect(useAppStore.getState().preferredModel).toBe('nb1');

    fireEvent.press(getByText('Pro'));
    expect(useAppStore.getState().preferredModel).toBe('pro');
  });

  it('renders about description', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText(/Universal virtual try-on assistant/)).toBeTruthy();
  });
});
