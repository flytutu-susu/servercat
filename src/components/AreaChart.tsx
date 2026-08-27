/** 面积折线图（react-native-svg 手写，轻量无额外依赖） */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface Props {
  data: number[];
  color: string;
  width: number;
  height: number;
  /** 固定最大值；不传则按数据最大值 */
  max?: number;
  strokeWidth?: number;
}

let gradientSeq = 0;

export function AreaChart({ data, color, width, height, max, strokeWidth = 1.5 }: Props) {
  const gid = useMemo(() => `g${++gradientSeq}`, []);
  const { line, area } = useMemo(() => {
    if (data.length < 2 || width <= 0 || height <= 0) return { line: '', area: '' };
    const upper = max ?? Math.max(...data, 1);
    const stepX = width / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - Math.min(1, Math.max(0, v / upper)) * (height - 2);
      return [x, y] as const;
    });
    // 简单平滑（catmull-rom → bezier）
    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    const areaPath = `${d} L ${width} ${height} L 0 ${height} Z`;
    return { line: d, area: areaPath };
  }, [data, width, height, max]);

  if (!line) return <View style={{ width, height }} />;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.35" />
          <Stop offset="1" stopColor={color} stopOpacity="0.02" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gid})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
