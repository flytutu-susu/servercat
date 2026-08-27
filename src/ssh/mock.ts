/** Mock SSH 客户端：在 Expo Go / 无原生模块环境下提供仿真数据，便于开发 UI */

import { base64ToUtf8, utf8ToBase64 } from '@/utils/base64';

import type {
  ExecResult,
  ShellClosedEvent,
  ShellDataEvent,
  SSHClient,
  SSHConnectOptions,
} from './types';

interface MockState {
  cpuIdle: number;
  cpuTotal: number;
  rx: number;
  tx: number;
  bootTime: number;
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MockSSHClient implements SSHClient {
  private sessions = new Map<string, MockState>();
  private shellListeners = new Set<(e: ShellDataEvent) => void>();
  private closeListeners = new Set<(e: ShellClosedEvent) => void>();
  private seq = 0;

  async connect(_opts: SSHConnectOptions): Promise<string> {
    await new Promise((r) => setTimeout(r, 400));
    const id = `mock-${++this.seq}`;
    this.sessions.set(id, {
      cpuIdle: 5_000_000,
      cpuTotal: 10_000_000,
      rx: 800_000_000,
      tx: 300_000_000,
      bootTime: Date.now() - rnd(3, 90) * 86400_000,
    });
    return id;
  }

  async exec(sessionId: string, command: string): Promise<ExecResult> {
    await new Promise((r) => setTimeout(r, rnd(60, 220)));
    const st = this.sessions.get(sessionId);
    if (!st) return { stdout: '', stderr: 'session closed', code: 1 };

    const ok = (stdout: string): ExecResult => ({ stdout, stderr: '', code: 0 });

    if (command.includes('cat /proc/stat')) {
      // 模拟 CPU 增量
      const idleDelta = Math.floor(rnd(150, 260));
      const totalDelta = 400; // 4 核 * 100 ticks/s
      st.cpuIdle += idleDelta;
      st.cpuTotal += totalDelta;
      const busy = totalDelta - idleDelta;
      const user = Math.floor(busy * 0.6);
      const sys = Math.floor(busy * 0.3);
      return ok(
        `cpu  ${user} 0 ${sys} ${idleDelta} 30 0 5 0 0 0\n` +
          `cpu0 ${user} 0 ${sys} ${idleDelta} 30 0 5 0 0 0\n` +
          `intr 1\nctxt 1\nbtime ${Math.floor(st.bootTime / 1000)}\n` +
          `==MEM==\n` +
          `MemTotal:       16384000 kB\nMemFree:         2048000 kB\n` +
          `MemAvailable:    8192000 kB\nBuffers:          512000 kB\nCached:          4096000 kB\n` +
          `SwapTotal:       2097152 kB\nSwapFree:        1500000 kB\n` +
          `==DISK==\n` +
          `Filesystem     1024-blocks      Used Available Capacity Mounted on\n` +
          `/dev/sda1        102400000  61440000  40960000      60% /\n` +
          `==NET==\n` +
          `Inter-|   Receive                                                |  Transmit\n` +
          ` face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n` +
          `    lo: 1000000    5000    0    0    0     0          0         0  1000000    5000    0    0    0     0       0          0\n` +
          `  eth0: ${Math.floor((st.rx += rnd(100_000, 2_000_000)))}   80000    0    0    0     0          0         0 ${Math.floor((st.tx += rnd(50_000, 800_000)))}   60000    0    0    0     0       0          0\n` +
          `==LOAD==\n` +
          `${rnd(0.2, 2.5).toFixed(2)} ${rnd(0.2, 2).toFixed(2)} ${rnd(0.2, 1.5).toFixed(2)} 2/380 12345\n` +
          `==UPTIME==\n` +
          `${((Date.now() - st.bootTime) / 1000).toFixed(2)} 12345.00\n`
      );
    }

    if (command.includes('os-release') || command.includes('uname')) {
      return ok(
        `==UNAME==\nLinux 6.8.0-45-generic x86_64 GNU/Linux\n` +
          `==OS==\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n` +
          `==CPU==\nmodel name\t: Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz\n` +
          `==CORES==\n4\n==HOSTNAME==\ndemo-server\n`
      );
    }

    if (command.includes('docker ps')) {
      return ok(
        '{"ID":"a1b2c3d4e5f6","Names":"nginx","Image":"nginx:alpine","State":"running","Status":"Up 3 days","Ports":"0.0.0.0:80->80/tcp"}\n' +
          '{"ID":"b2c3d4e5f6a1","Names":"postgres","Image":"postgres:16","State":"running","Status":"Up 3 days","Ports":"5432/tcp"}\n' +
          '{"ID":"c3d4e5f6a1b2","Names":"redis","Image":"redis:7","State":"exited","Status":"Exited (0) 2 hours ago","Ports":""}\n'
      );
    }

    if (command.includes('docker stats')) {
      return ok(
        `{"ID":"a1b2c3d4e5f6","Name":"nginx","CPUPerc":"${rnd(0.1, 8).toFixed(2)}%","MemPerc":"${rnd(1, 5).toFixed(2)}%","MemUsage":"${rnd(20, 60).toFixed(1)}MiB / 16GiB","NetIO":"1.2MB / 340kB","BlockIO":"0B / 0B"}\n` +
          `{"ID":"b2c3d4e5f6a1","Name":"postgres","CPUPerc":"${rnd(1, 20).toFixed(2)}%","MemPerc":"${rnd(5, 15).toFixed(2)}%","MemUsage":"${rnd(200, 900).toFixed(0)}MiB / 16GiB","NetIO":"800kB / 2.1MB","BlockIO":"10MB / 500MB"}\n`
      );
    }

    if (/docker (start|stop|restart|pause|unpause)/.test(command)) {
      return ok(command.split(' ').pop() + '\n');
    }

    if (command.includes('docker logs')) {
      return ok(
        Array.from(
          { length: 20 },
          (_, i) =>
            `${new Date().toISOString()} [mock] log line ${i + 1} — ${Math.random().toString(36).slice(2)}`
        ).join('\n') + '\n'
      );
    }

    return ok('');
  }

  async startShell(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new Error('session closed');
    const banner =
      'Welcome to Ubuntu 24.04.1 LTS (Mock)\r\n\r\n' +
      ' * 这是 Mock 终端（Expo Go 开发模式）\r\n' +
      ' * 输入内容会被原样回显\r\n\r\n';
    this.emitShell(sessionId, banner);
    setTimeout(() => this.emitShell(sessionId, 'demo@demo-server:~$ '), 100);

    // 简易回显：收集输入直到回车
    let buf = '';
    this.shellBuffers.set(sessionId, (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r') {
          this.emitShell(sessionId, '\r\n');
          this.emitShell(sessionId, `mock: 无法执行 "${buf}"（演示模式）\r\n`);
          buf = '';
          this.emitShell(sessionId, 'demo@demo-server:~$ ');
        } else if (ch === '\x7f') {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            this.emitShell(sessionId, '\b \b');
          }
        } else if (ch >= ' ') {
          buf += ch;
          this.emitShell(sessionId, ch);
        }
      }
    });
  }

  private shellBuffers = new Map<string, (chunk: string) => void>();

  writeShell(sessionId: string, dataBase64: string): void {
    const handler = this.shellBuffers.get(sessionId);
    if (handler) handler(base64ToUtf8(dataBase64));
  }

  resizeShell(): void {}

  close(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      this.shellBuffers.delete(sessionId);
      for (const cb of this.closeListeners) cb({ sessionId });
    }
  }

  onShellData(cb: (e: ShellDataEvent) => void): () => void {
    this.shellListeners.add(cb);
    return () => this.shellListeners.delete(cb);
  }

  onShellClosed(cb: (e: ShellClosedEvent) => void): () => void {
    this.closeListeners.add(cb);
    return () => this.closeListeners.delete(cb);
  }

  private emitShell(sessionId: string, text: string): void {
    const data = utf8ToBase64(text);
    for (const cb of this.shellListeners) cb({ sessionId, data });
  }
}
