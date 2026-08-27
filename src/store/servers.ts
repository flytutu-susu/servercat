/** 服务器记录存储：元数据存 AsyncStorage（zustand persist），凭据存 Keychain */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SSHAuth } from '@/ssh';

export interface ServerRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  /** 备注/分组，可选 */
  group?: string;
  createdAt: number;
}

interface ServersState {
  servers: ServerRecord[];
  hydrated: boolean;
  addServer: (s: Omit<ServerRecord, 'id' | 'createdAt'>, auth: SSHAuth) => Promise<ServerRecord>;
  updateServer: (id: string, patch: Partial<ServerRecord>, auth?: SSHAuth) => Promise<void>;
  removeServer: (id: string) => Promise<void>;
  /** 读取某台服务器的凭据 */
  getAuth: (id: string) => Promise<SSHAuth | null>;
}

const KEY = {
  password: (id: string) => `srv_${id}_password`,
  privateKey: (id: string) => `srv_${id}_privatekey`,
  passphrase: (id: string) => `srv_${id}_passphrase`,
};

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function saveAuth(id: string, auth: SSHAuth): Promise<void> {
  if (auth.type === 'password') {
    await SecureStore.setItemAsync(KEY.password(id), auth.password);
  } else {
    await SecureStore.setItemAsync(KEY.privateKey(id), auth.privateKey);
    if (auth.passphrase) {
      await SecureStore.setItemAsync(KEY.passphrase(id), auth.passphrase);
    } else {
      await SecureStore.deleteItemAsync(KEY.passphrase(id)).catch(() => {});
    }
  }
}

async function deleteAuth(id: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY.password(id)).catch(() => {}),
    SecureStore.deleteItemAsync(KEY.privateKey(id)).catch(() => {}),
    SecureStore.deleteItemAsync(KEY.passphrase(id)).catch(() => {}),
  ]);
}

export const useServers = create<ServersState>()(
  persist(
    (set, get) => ({
      servers: [],
      hydrated: false,

      async addServer(data, auth) {
        const record: ServerRecord = { ...data, id: genId(), createdAt: Date.now() };
        await saveAuth(record.id, auth);
        set((s) => ({ servers: [...s.servers, record] }));
        return record;
      },

      async updateServer(id, patch, auth) {
        set((s) => ({
          servers: s.servers.map((srv) => (srv.id === id ? { ...srv, ...patch, id } : srv)),
        }));
        if (auth) await saveAuth(id, auth);
      },

      async removeServer(id) {
        await deleteAuth(id);
        set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }));
      },

      async getAuth(id) {
        const srv = get().servers.find((s) => s.id === id);
        if (!srv) return null;
        if (srv.authType === 'password') {
          const password = await SecureStore.getItemAsync(KEY.password(id));
          return password ? { type: 'password', password } : null;
        }
        const privateKey = await SecureStore.getItemAsync(KEY.privateKey(id));
        if (!privateKey) return null;
        const passphrase = (await SecureStore.getItemAsync(KEY.passphrase(id))) ?? undefined;
        return { type: 'key', privateKey, passphrase };
      },
    }),
    {
      name: 'servercat.servers',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ servers: s.servers }),
      onRehydrateStorage: () => (state) => {
        state && (useServers.setState({ hydrated: true }));
      },
    }
  )
);
