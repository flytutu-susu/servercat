/** SSH 客户端工厂：优先原生模块，Expo Go 下自动退回 Mock */

import { MockSSHClient } from './mock';
import { hasNativeSSH, NativeSSHClient } from './native';
import type { SSHClient } from './types';

let instance: SSHClient | null = null;
let usingMock = false;

export function getSSH(): SSHClient {
  if (!instance) {
    usingMock = !hasNativeSSH();
    instance = usingMock ? new MockSSHClient() : new NativeSSHClient();
  }
  return instance;
}

/** 当前是否运行在 Mock 模式（无原生 SSH 模块，如 Expo Go） */
export function isMockMode(): boolean {
  getSSH();
  return usingMock;
}

export type { SSHClient } from './types';
export * from './types';
