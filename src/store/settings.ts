/** 全局设置（持久化） */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  /** 演示模式：强制使用 Mock SSH 数据（真实安装包里也可体验界面） */
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      demoMode: false,
      setDemoMode: (v) => set({ demoMode: v }),
    }),
    {
      name: 'servercat.settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
