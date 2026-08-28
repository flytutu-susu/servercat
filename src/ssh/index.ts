/** SSH 客户端工厂：优先原生模块；Expo Go 或「演示模式」下用 Mock */

import { MockSSHClient } from './mock';
import { hasNativeSSH, NativeSSHClient } from './native';
import type { SSHClient } from './types';

import { useSettings } from '@/store/settings';

let nativeInstance: SSHClient | null = null;
let mockInstance: SSHClient | null = null;

export function isMockMode(): boolean {
  return useSettings.getState().demoMode || !hasNativeSSH();
}

/** 获取当前应使用的 SSH 客户端（每次按 demoMode 动态选择） */
export function getSSH(): SSHClient {
  if (isMockMode()) {
    if (!mockInstance) mockInstance = new MockSSHClient();
    return mockInstance;
  }
  if (!nativeInstance) nativeInstance = new NativeSSHClient();
  return nativeInstance;
}

export type { SSHClient } from './types';
export * from './types';
