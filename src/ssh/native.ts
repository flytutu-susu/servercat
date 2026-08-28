/** 原生 SSH 模块（NMSSH）的 JS 封装 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import type {
  ExecResult,
  KeyGenOptions,
  KeyPair,
  ShellClosedEvent,
  ShellDataEvent,
  SSHClient,
  SSHConnectOptions,
} from './types';

interface RNSshNativeModule {
  connect(opts: {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    timeout?: number;
  }): Promise<string>;
  exec(sessionId: string, command: string, timeoutSec: number): Promise<ExecResult>;
  startShell(sessionId: string, cols: number, rows: number): Promise<void>;
  writeShell(sessionId: string, dataBase64: string): void;
  resizeShell(sessionId: string, cols: number, rows: number): void;
  close(sessionId: string): void;
  generateKeyPair(opts: {
    type: string;
    bits: number;
    passphrase?: string;
    comment?: string;
  }): Promise<{ privateKey: string; publicKey: string; fingerprint: string }>;
}

const native: RNSshNativeModule | undefined = NativeModules.RNSsh;

export function hasNativeSSH(): boolean {
  return !!native && Platform.OS === 'ios';
}

export class NativeSSHClient implements SSHClient {
  private emitter = new NativeEventEmitter(NativeModules.RNSsh);

  async connect(opts: SSHConnectOptions): Promise<string> {
    if (!native) throw new Error('原生 SSH 模块不可用');
    const { auth, ...rest } = opts;
    return native.connect({
      ...rest,
      password: auth.type === 'password' ? auth.password : undefined,
      privateKey: auth.type === 'key' ? auth.privateKey : undefined,
      passphrase: auth.type === 'key' ? auth.passphrase : undefined,
      timeout: opts.timeout ?? 15,
    });
  }

  exec(sessionId: string, command: string, timeoutSec = 15): Promise<ExecResult> {
    if (!native) return Promise.reject(new Error('原生 SSH 模块不可用'));
    return native.exec(sessionId, command, timeoutSec);
  }

  startShell(sessionId: string, cols: number, rows: number): Promise<void> {
    if (!native) return Promise.reject(new Error('原生 SSH 模块不可用'));
    return native.startShell(sessionId, cols, rows);
  }

  writeShell(sessionId: string, dataBase64: string): void {
    native?.writeShell(sessionId, dataBase64);
  }

  resizeShell(sessionId: string, cols: number, rows: number): void {
    native?.resizeShell(sessionId, cols, rows);
  }

  close(sessionId: string): void {
    native?.close(sessionId);
  }

  generateKeyPair(opts: KeyGenOptions): Promise<KeyPair> {
    if (!native) return Promise.reject(new Error('原生 SSH 模块不可用'));
    return native.generateKeyPair({
      type: opts.type,
      bits: opts.bits ?? 2048,
      passphrase: opts.passphrase,
      comment: opts.comment,
    });
  }

  onShellData(cb: (e: ShellDataEvent) => void): () => void {
    const sub = this.emitter.addListener('RNSshShellData', cb);
    return () => sub.remove();
  }

  onShellClosed(cb: (e: ShellClosedEvent) => void): () => void {
    const sub = this.emitter.addListener('RNSshShellClosed', cb);
    return () => sub.remove();
  }
}
