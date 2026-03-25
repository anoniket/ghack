/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native' +
      '|@react-native' +
      '|expo' +
      '|@expo' +
      '|expo-.*' +
      '|@expo/.*' +
      '|react-native-.*' +
      '|@react-native-async-storage/async-storage' +
      '|@react-native-community/netinfo' +
      '|@clerk/clerk-expo' +
      '|@clerk/.*' +
      '|posthog-react-native' +
      '|posthog-react-native-session-replay' +
      '|@sentry/react-native' +
      '|@gorhom/bottom-sheet' +
      '|zustand' +
      '|@react-navigation/.*' +
      ')/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/backend/',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: [
    '**/__tests__/**/*.(test|spec).(ts|tsx|js|jsx)',
    '**/*.(test|spec).(ts|tsx|js|jsx)',
  ],
  collectCoverageFrom: [
    'utils/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
};
