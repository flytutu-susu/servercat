/** 标签 + 数值 的小格子（详情页统计网格用） */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

interface Props {
  label: string;
  value: string;
  sub?: string;
  labelColor: string;
  valueColor: string;
  dot?: string; // 左侧色点
  style?: StyleProp<ViewStyle>;
}

export function StatCell({ label, value, sub, labelColor, valueColor, dot, style }: Props) {
  return (
    <View style={[styles.cell, style]}>
      <View style={styles.labelRow}>
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {sub ? <Text style={[styles.sub, { color: labelColor }]}> {sub}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { minWidth: 60 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12 },
  value: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12, fontWeight: '400' },
});

export const statCellGap = Spacing.three;
