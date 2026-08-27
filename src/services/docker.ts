/** Docker 管理：通过 SSH exec 调用 docker CLI */

import type { SSHClient } from '@/ssh';

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string; // running / exited / paused ...
  status: string; // "Up 3 days" / "Exited (0) ..."
  ports: string;
  /** docker stats 数据（运行中才有） */
  cpuPercent?: string;
  memUsage?: string;
  memPercent?: string;
}

/** 返回 null 表示服务器未安装 Docker 或无权限 */
export async function listContainers(ssh: SSHClient, sessionId: string): Promise<ContainerInfo[] | null> {
  const res = await ssh.exec(sessionId, "docker ps -a --format '{{json .}}' 2>&1", 15);
  const out = res.stdout + res.stderr;
  if (res.code !== 0) {
    if (/command not found|not found|Cannot connect to the Docker daemon|permission denied/i.test(out)) {
      return null;
    }
    return null;
  }
  const containers: ContainerInfo[] = [];
  for (const line of res.stdout.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const j = JSON.parse(t);
      containers.push({
        id: j.ID ?? '',
        name: j.Names ?? j.Name ?? '',
        image: j.Image ?? '',
        state: (j.State ?? '').toLowerCase(),
        status: j.Status ?? '',
        ports: j.Ports ?? '',
      });
    } catch {
      // 忽略坏行
    }
  }

  // 采集运行中容器的资源占用
  if (containers.some((c) => c.state === 'running')) {
    try {
      const stats = await ssh.exec(
        sessionId,
        "docker stats --no-stream --format '{{json .}}' 2>/dev/null",
        20
      );
      const byId = new Map<string, { cpu: string; mem: string; memPct: string }>();
      for (const line of stats.stdout.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('{')) continue;
        try {
          const j = JSON.parse(t);
          byId.set(j.ID ?? j.Container ?? '', {
            cpu: j.CPUPerc ?? '',
            mem: j.MemUsage ?? '',
            memPct: j.MemPerc ?? '',
          });
        } catch {
          // 忽略坏行
        }
      }
      for (const c of containers) {
        const s = byId.get(c.id) ?? byId.get(c.name);
        if (s) {
          c.cpuPercent = s.cpu;
          c.memUsage = s.mem;
          c.memPercent = s.memPct;
        }
      }
    } catch {
      // stats 失败不阻塞列表
    }
  }
  return containers;
}

export type ContainerAction = 'start' | 'stop' | 'restart' | 'pause' | 'unpause';

export async function containerAction(
  ssh: SSHClient,
  sessionId: string,
  action: ContainerAction,
  containerId: string
): Promise<{ ok: boolean; message: string }> {
  const res = await ssh.exec(sessionId, `docker ${action} ${containerId} 2>&1`, 30);
  const out = (res.stdout + res.stderr).trim();
  return { ok: res.code === 0, message: out };
}

export async function containerLogs(
  ssh: SSHClient,
  sessionId: string,
  containerId: string,
  tail = 100
): Promise<string> {
  const res = await ssh.exec(sessionId, `docker logs --tail ${tail} ${containerId} 2>&1`, 20);
  return (res.stdout + res.stderr).trim() || '(无日志)';
}
