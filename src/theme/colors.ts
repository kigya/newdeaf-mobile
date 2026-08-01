export const colors = {
  bg: '#090C10',
  bgElevated: '#11161D',
  bgCard: '#151B24',
  bgMuted: '#1C2430',
  border: '#243041',
  text: '#F2F5F8',
  textSecondary: '#9AA8BC',
  textMuted: '#6B7A8F',
  accent: '#FFBB00',
  accentSoft: '#FFBB0033',
  accentPressed: '#E6A800',
  danger: '#E85D4C',
  success: '#3DCF8E',
  kp: '#FF6600',
  imdb: '#F5C518',
  overlay: 'rgba(9, 12, 16, 0.72)',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorName = keyof typeof colors;
