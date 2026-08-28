/**
 * 主题：跟随系统（ServerCat 风格浅色 + 深色）
 */

import '@/global.css';

import { useColorScheme } from 'react-native';

export interface Palette {
  text: string;
  background: string;
  /** 卡片/分组背景 */
  card: string;
  backgroundSelected: string;
  textSecondary: string;
  border: string;
  /** 图表与状态色 */
  green: string;
  red: string;
  orange: string;
  yellow: string;
  blue: string;
  purple: string;
  teal: string;
  pink: string;
}

export const Light: Palette = {
  text: '#1C1C1E',
  background: '#F2F2F6',
  card: '#FFFFFF',
  backgroundSelected: '#E8E8ED',
  textSecondary: '#8A8A8E',
  border: '#E6E6EB',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  blue: '#007AFF',
  purple: '#AF52DE',
  teal: '#5AC8FA',
  pink: '#FF2D55',
};

export const Dark: Palette = {
  text: '#F5F5F7',
  background: '#0B0B0E',
  card: '#17181D',
  backgroundSelected: '#23242B',
  textSecondary: '#8E9199',
  border: '#26272E',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  blue: '#0A84FF',
  purple: '#BF5AF2',
  teal: '#64D2FF',
  pink: '#FF375F',
};

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? Dark : Light;
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
  card: 16,
  small: 10,
  pill: 999,
} as const;
