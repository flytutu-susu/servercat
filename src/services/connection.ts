/** SSH 连接管理：每台服务器一个长连会话（监控用），终端按需另开会话 */

import { create } from 'zustand';

import { getSSH, type SSHConnectOptions } from '@/ssh';
import type { ServerRecord } from '@/store/servers';
import { useServers } from '@/store/servers';

export type ConnStatus = 'offline' | 'connecting' | 'online' | 'error';

interface ConnEntry {
  sessionId: string | null;
  status: ConnStatus;
  error?: string;
  connecting?: Promise<string> | null;
  /** 最近一次连接尝试时间（用于失败退避） */
  lastAttempt?: number;
}

const RETRY_BACKOFF_MS = 15000;

interface ConnectionsState {
  entries: Record<string, ConnEntry>;
  /** 确保某台服务器已连接，返回 sessionId */
  ensureConnected: (serverId: string) => Promise<string>;
  /** 标记会话失效（exec 报错后调用），下次 ensureConnected 会重连 */
  invalidate: (serverId: string) => void;
  disconnect: (serverId: string) => void;
  disconnectAll: () => void;
  statusOf: (serverId: string) => ConnStatus;
}

export const useConnections = create<ConnectionsState>()((set, get) => ({
  entries: {},

  async ensureConnected(serverId) {
    const existing = get().entries[serverId];
    if (existing?.status === 'online' && existing.sessionId) return existing.sessionId;
    if (existing?.connecting) return existing.connecting;
    // 失败退避：刚失败过的服务器，短时间内直接报错，避免重连风暴
    if (
      existing?.status === 'error' &&
      existing.lastAttempt &&
      Date.now() - existing.lastAttempt < RETRY_BACKOFF_MS
    ) {
      throw new Error(existing.error ?? '连接失败（稍后自动重试）');
    }

    const server = useServers.getState().servers.find((s) => s.id === serverId);
    if (!server) throw new Error('服务器不存在');

    set((s) => ({
      entries: {
        ...s.entries,
        [serverId]: { sessionId: null, status: 'connecting', connecting: undefined, lastAttempt: Date.now() },
      },
    }));

    const promise = (async () => {
      try {
        const auth = await useServers.getState().getAuth(serverId);
        if (!auth) throw new Error('凭据缺失，请重新编辑服务器并填写密码/密钥');
        const opts: SSHConnectOptions = {
          host: server.host,
          port: server.port,
          username: server.username,
          auth,
          timeout: 15,
        };
        const sessionId = await getSSH().connect(opts);
        set((s) => ({
          entries: { ...s.entries, [serverId]: { sessionId, status: 'online' } },
        }));
        return sessionId;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set((s) => ({
          entries: {
            ...s.entries,
            [serverId]: {
              sessionId: null,
              status: 'error',
              error: message,
              lastAttempt: s.entries[serverId]?.lastAttempt,
            },
          },
        }));
        throw e;
      }
    })();

    set((s) => ({
      entries: {
        ...s.entries,
        [serverId]: { ...(s.entries[serverId] ?? { sessionId: null, status: 'connecting' }), connecting: promise },
      },
    }));

    try {
      return await promise;
    } finally {
      set((s) => {
        const cur = s.entries[serverId];
        if (!cur) return s;
        return { entries: { ...s.entries, [serverId]: { ...cur, connecting: null } } };
      });
    }
  },

  invalidate(serverId) {
    const cur = get().entries[serverId];
    if (cur?.sessionId) {
      try {
        getSSH().close(cur.sessionId);
      } catch {
        // 忽略
      }
    }
    set((s) => ({
      entries: {
        ...s.entries,
        [serverId]: { sessionId: null, status: 'offline', error: cur?.error },
      },
    }));
  },

  disconnect(serverId) {
    get().invalidate(serverId);
  },

  disconnectAll() {
    for (const id of Object.keys(get().entries)) get().invalidate(id);
  },

  statusOf(serverId) {
    return get().entries[serverId]?.status ?? 'offline';
  },
}));

/** 终端使用：建立一条独立会话（不走共享池），调用方负责 close */
export async function openDedicatedSession(server: ServerRecord): Promise<string> {
  const auth = await useServers.getState().getAuth(server.id);
  if (!auth) throw new Error('凭据缺失');
  return getSSH().connect({
    host: server.host,
    port: server.port,
    username: server.username,
    auth,
    timeout: 15,
  });
}
