/** 环形占比图（ServerCat 风格 donut） */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  /** 0-100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  /** 中心文字（默认显示百分比整数） */
  label?: string;
  labelColor: string;
}

export function Donut({
  percent,
  size = 64,
  strokeWidth = 8,
  color,
  trackColor,
  label,
  labelColor,
}: Props) {
  const p = Math.min(100, Math.max(0, percent));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const filled = (p / 100) * c;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${filled} ${c - filled}`}
          strokeLinecap="round"
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill as object, styles.center]}>
        <Text style={[styles.label, { color: labelColor, fontSize: size * 0.24 }]}>
          {label ?? `${Math.round(p)}%`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
