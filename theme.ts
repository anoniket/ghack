// ---------------------------------------------------------------------------
// mrigAI Design Token System — sourced from Stitch project
// ---------------------------------------------------------------------------

export const COLORS = {
  // Surfaces
  background: '#FAF8F5',
  surface: '#FAF8F5',
  surfaceBright: '#FAF8F5',
  surfaceContainer: '#F2EDE8',
  surfaceContainerLow: '#F8F3EE',
  surfaceContainerHigh: '#ECE7E2',
  surfaceContainerHighest: '#E6E2DD',
  surfaceContainerLowest: '#FFFFFF',
  surfaceDim: '#DED9D4',
  surfaceVariant: '#E6E2DD',

  // Primary (deep red)
  primary: '#B7102A',
  primaryContainer: '#DB313F',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#FFFBFF',

  // Secondary (purple)
  secondary: '#8136C4',
  secondaryContainer: '#BA70FE',
  onSecondary: '#FFFFFF',
  onSecondaryContainer: '#440076',

  // Tertiary (teal)
  tertiary: '#00685F',
  tertiaryContainer: '#008379',
  tertiaryFixed: '#70F8E8',
  onTertiary: '#FFFFFF',

  // On-surface
  onSurface: '#1D1B19',
  onSurfaceVariant: '#5B403F',
  onBackground: '#1D1B19',

  // Outline
  outline: '#8F6F6E',
  outlineVariant: '#E4BEBC',

  // Error
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onError: '#FFFFFF',

  // Inverse
  inverseSurface: '#32302D',
  inverseOnSurface: '#F5F0EB',
  inversePrimary: '#FFB3B1',
} as const;

export const FONTS = {
  headline: 'SpaceGrotesk_700Bold',
  headlineMedium: 'SpaceGrotesk_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  label: 'Inter_500Medium',
} as const;

// Fallback fonts before custom fonts load
export const FONTS_FALLBACK = {
  headline: undefined, // system default
  body: undefined,
} as const;

export const FONT_SIZES = {
  displayLg: 36,
  displayMd: 30,
  displaySm: 24,
  headlineLg: 28,
  headlineMd: 22,
  headlineSm: 18,
  bodyLg: 16,
  bodyMd: 14,
  bodySm: 13,
  labelLg: 14,
  labelMd: 12,
  labelSm: 11,
  caption: 10,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const BORDER_RADIUS = {
  sm: 2,
  md: 4,   // default — boxy neo-brutalist
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

export const SHADOWS = {
  hard: {
    shadowOffset: { width: 6, height: 6 },
    shadowColor: COLORS.onSurface,
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  hardPrimary: {
    shadowOffset: { width: 6, height: 6 },
    shadowColor: COLORS.primary,
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  hardSmall: {
    shadowOffset: { width: 4, height: 4 },
    shadowColor: COLORS.onSurface,
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  ambient: {
    shadowOffset: { width: 0, height: 20 },
    shadowColor: '#3C3228',
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  none: {
    shadowOffset: { width: 0, height: 0 },
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
} as const;

export const BORDERS = {
  thick: 3,   // neo-brutalist standard
  medium: 2,
  thin: 1,
  color: COLORS.onSurface,
} as const;
