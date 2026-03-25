import React from 'react';
import { render } from '@testing-library/react-native';
import OnboardingCamera from '@/components/OnboardingCamera';
import { useAppStore } from '@/services/store';

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
  uploadSelfieAndSaveKey: jest.fn().mockResolvedValue('s3-key-1'),
  imageUriToBase64: jest.fn().mockResolvedValue('mock-base64-data'),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    selfieUris: [],
    selfieS3Keys: [],
    onboardingComplete: false,
  });
});

describe('OnboardingCamera', () => {
  it('renders welcome badge and title text', () => {
    const { getByText } = render(<OnboardingCamera />);
    expect(getByText('VIRTUAL TRY-ON')).toBeTruthy();
    expect(getByText(/Welcome to/)).toBeTruthy();
    // "mrigAI" is inside the same Text node as "Welcome to\nmrigAI"
    // So we search for the combined text
    expect(getByText(/mrigAI/)).toBeTruthy();
  });

  it('renders subtitle with instructions', () => {
    const { getByText } = render(<OnboardingCamera />);
    expect(getByText(/Upload a photo of yourself/)).toBeTruthy();
  });

  it('shows Take a Selfie and Choose from Gallery buttons when no photos', () => {
    const { getByText } = render(<OnboardingCamera />);
    expect(getByText('Take a Selfie')).toBeTruthy();
    expect(getByText('Choose from Gallery')).toBeTruthy();
  });

  it('does not show Continue button when no photos taken', () => {
    const { queryByText } = render(<OnboardingCamera />);
    expect(queryByText('Continue')).toBeNull();
  });
});
