/**
 * ServerCat 风格暗色主题
 */

import '@/global.css';

export const Colors = {
  light: {
    text: '#111114',
    background: '#F2F2F6',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E4E4EA',
    textSecondary: '#6B6F76',
    border: '#D8D8DE',
  },
  dark: {
    text: '#F5F5F7',
    background: '#0B0B0E',
    backgroundElement: '#17181D',
    backgroundSelected: '#23242B',
    textSecondary: '#8E9199',
    border: '#26272E',
  },
} as const;

/** 语义色（与亮暗模式无关，图表/状态统一使用） */
export const Accent = {
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  blue: '#0A84FF',
  purple: '#BF5AF2',
  teal: '#64D2FF',
  pink: '#FF375F',
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ColorScheme = keyof typeof Colors;

export function useThemeColors(): (typeof Colors)['dark'] {
  // 应用固定暗色主题（类 ServerCat 风格）
  return Colors.dark;
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  card: 14,
  small: 8,
  pill: 999,
} as const;
