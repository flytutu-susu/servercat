/** 进度条（内存/磁盘用量展示） */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

interface Props {
  /** 0-100 */
  percent: number;
  color?: string;
  label?: string;
  valueLabel?: string;
  height?: number;
}

export function UsageBar({ percent, color = '#30D158', label, valueLabel, height = 6 }: Props) {
  return (
    <View>
      {(label || valueLabel) && (
        <View style={styles.row}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {valueLabel ? <Text style={styles.value}>{valueLabel}</Text> : null}
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: Radius.pill }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: color, borderRadius: Radius.pill },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: Colors.dark.textSecondary, fontSize: 12 },
  value: { color: Colors.dark.text, fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { backgroundColor: Colors.dark.backgroundSelected, overflow: 'hidden' },
  fill: { height: '100%' },
});
