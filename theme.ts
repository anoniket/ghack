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
  primaryMuted: '#C62828',
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

// Store accent colors — consistent across stores tab and closet
export const STORE_COLORS: Record<string, string> = {
  myntra: '#1D1B19',   // black
  ajio: '#DB313F',     // red
  zara: '#00685F',     // teal
  hm: '#8136C4',       // purple
  nike: '#B7102A',     // deep red
  puma: '#70F8E8',     // mint
  snitch: '#BA70FE',   // light purple
  westside: '#1D1B19', // black
  tatacliq: '#DB313F', // red
  fabindia: '#00685F', // teal
  shein: '#8136C4',    // purple
  amazon: '#B7102A',   // deep red
};

export function getStoreAccentColor(storeName: string): string {
  const key = storeName.toLowerCase().replace(/[^a-z]/g, '');
  if (STORE_COLORS[key]) return STORE_COLORS[key];
  // Fallback for unknown stores — hash to pick a color
  const accents = [COLORS.primaryContainer, COLORS.tertiary, COLORS.secondary, COLORS.primary, COLORS.tertiaryFixed, COLORS.secondaryContainer];
  let hash = 0;
  for (let i = 0; i < storeName.length; i++) hash = storeName.charCodeAt(i) + ((hash << 5) - hash);
  return accents[Math.abs(hash) % accents.length];
}

// Store logo map — for use in saved/closet cards
export const STORE_LOGOS: Record<string, any> = {
  myntra: require('@/assets/images/store-logos/myntra.png'),
  ajio: require('@/assets/images/store-logos/ajio.png'),
  zara: require('@/assets/images/store-logos/zara.png'),
  hm: require('@/assets/images/store-logos/hm.png'),
  nike: require('@/assets/images/store-logos/nike.png'),
  puma: require('@/assets/images/store-logos/puma.png'),
  snitch: require('@/assets/images/store-logos/snitch.png'),
  westside: require('@/assets/images/store-logos/westside.png'),
  tatacliq: require('@/assets/images/store-logos/tatacliq.png'),
  fabindia: require('@/assets/images/store-logos/fabindia.png'),
  shein: require('@/assets/images/store-logos/shein.png'),
  amazon: require('@/assets/images/store-logos/amazon.png'),
};

export function getStoreLogo(storeName: string): any | null {
  const key = storeName.toLowerCase().replace(/[^a-z]/g, '');
  return STORE_LOGOS[key] || null;
}

export const BORDERS = {
  thick: 3,   // neo-brutalist standard
  medium: 2,
  thin: 1,
  color: COLORS.onSurface,
} as const;
