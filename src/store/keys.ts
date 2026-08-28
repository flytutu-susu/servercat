/** 密钥管理存储：元数据存 AsyncStorage，私钥/口令存 Keychain */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getSSH, type KeyGenOptions, type KeyPair } from '@/ssh';

export interface KeyMeta {
  id: string;
  name: string;
  type: 'ed25519' | 'rsa';
  bits: number;
  fingerprint: string;
  /** OpenSSH 公钥行（非敏感，可展示/复制） */
  publicKey: string;
  hasPassphrase: boolean;
  createdAt: number;
}

interface KeysState {
  keys: KeyMeta[];
  hydrated: boolean;
  /** 生成并保存新密钥，返回元数据 */
  generate: (name: string, opts: KeyGenOptions) => Promise<KeyMeta>;
  remove: (id: string) => Promise<void>;
  /** 取私钥（Keychain） */
  getPrivateKey: (id: string) => Promise<{ privateKey: string; passphrase?: string } | null>;
}

const SKEY = {
  priv: (id: string) => `key_${id}_private`,
  pass: (id: string) => `key_${id}_pass`,
};

function genId(): string {
  return `k${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useKeys = create<KeysState>()(
  persist(
    (set, get) => ({
      keys: [],
      hydrated: false,

      async generate(name, opts) {
        const pair: KeyPair = await getSSH().generateKeyPair({
          ...opts,
          comment: opts.comment ?? `servercat ${name}`.trim(),
        });
        const meta: KeyMeta = {
          id: genId(),
          name: name.trim() || (opts.type === 'rsa' ? 'RSA 密钥' : 'ED25519 密钥'),
          type: opts.type,
          bits: opts.type === 'rsa' ? (opts.bits ?? 2048) : 256,
          fingerprint: pair.fingerprint,
          publicKey: pair.publicKey,
          hasPassphrase: !!opts.passphrase,
          createdAt: Date.now(),
        };
        await SecureStore.setItemAsync(SKEY.priv(meta.id), pair.privateKey);
        if (opts.passphrase) {
          await SecureStore.setItemAsync(SKEY.pass(meta.id), opts.passphrase);
        }
        set((s) => ({ keys: [...s.keys, meta] }));
        return meta;
      },

      async remove(id) {
        await SecureStore.deleteItemAsync(SKEY.priv(id)).catch(() => {});
        await SecureStore.deleteItemAsync(SKEY.pass(id)).catch(() => {});
        set((s) => ({ keys: s.keys.filter((k) => k.id !== id) }));
      },

      async getPrivateKey(id) {
        const privateKey = await SecureStore.getItemAsync(SKEY.priv(id));
        if (!privateKey) return null;
        const passphrase = (await SecureStore.getItemAsync(SKEY.pass(id))) ?? undefined;
        return { privateKey, passphrase };
      },
    }),
    {
      name: 'servercat.keys',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ keys: s.keys }),
      onRehydrateStorage: () => () => {
        useKeys.setState({ hydrated: true });
      },
    }
  )
);
