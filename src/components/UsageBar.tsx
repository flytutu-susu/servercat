/** 进度条（内存/磁盘用量展示，主题化） */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, useColors } from '@/constants/theme';

interface Props {
  /** 0-100 */
  percent: number;
  color?: string;
  label?: string;
  valueLabel?: string;
  height?: number;
  trackColor?: string;
  labelColor?: string;
  valueColor?: string;
}

export function UsageBar({ percent, color, label, valueLabel, height = 6, trackColor, labelColor, valueColor }: Props) {
  const c = useColors();
  const track = trackColor ?? c.backgroundSelected;
  return (
    <View>
      {(label || valueLabel) && (
        <View style={styles.row}>
          {label ? <Text style={[styles.label, { color: labelColor ?? c.textSecondary }]}>{label}</Text> : <View />}
          {valueLabel ? <Text style={[styles.value, { color: valueColor ?? c.text }]}>{valueLabel}</Text> : null}
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: Radius.pill, backgroundColor: track }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color ?? c.green, borderRadius: Radius.pill },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 12 },
  value: { fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { overflow: 'hidden' },
  fill: { height: '100%' },
});
