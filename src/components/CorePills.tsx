/** 每核 CPU 药丸条（ServerCat 风格：一排竖向圆角条，填充高度=占用率） */

import React from 'react';
import { View } from 'react-native';

interface Props {
  /** 每核 0-100（null 视为 0） */
  cores: (number | null)[];
  activeColor: string;
  trackColor: string;
  height?: number;
}

export function CorePills({ cores, activeColor, trackColor, height = 26 }: Props) {
  if (cores.length === 0) return null;
  const width = Math.min(14, Math.max(5, Math.floor(300 / cores.length) - 3));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
      {cores.map((p, i) => {
        const v = Math.min(100, Math.max(0, p ?? 0));
        return (
          <View
            key={i}
            style={{
              width,
              height,
              borderRadius: width / 2,
              backgroundColor: trackColor,
              overflow: 'hidden',
              justifyContent: 'flex-end',
            }}>
            <View
              style={{
                height: Math.max(2, (v / 100) * height),
                borderRadius: width / 2,
                backgroundColor: activeColor,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
