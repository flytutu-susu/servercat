/** 监控数据采集与解析：通过一条组合命令读取 /proc，JS 侧解析 */

import type { ExecResult, SSHClient } from '@/ssh';

/** 一次轮询采集的指标快照 */
export interface MetricsSnapshot {
  timestamp: number;
  /** 0-100，由两次采样的 /proc/stat 差值算出；首次为 null */
  cpuPercent: number | null;
  cpuCount: number;
  memTotalKb: number;
  memUsedKb: number;
  memAvailableKb: number;
  swapTotalKb: number;
  swapUsedKb: number;
  diskTotalKb: number;
  diskUsedKb: number;
  diskPercent: number;
  /** 字节累计值 */
  netRxBytes: number;
  netTxBytes: number;
  /** 字节/秒，由两次采样差值算出；首次为 null */
  netRxPerSec: number | null;
  netTxPerSec: number | null;
  load1: number;
  load5: number;
  load15: number;
  uptimeSec: number;
}

/** 服务器基本信息（连接后采集一次） */
export interface ServerInfo {
  hostname: string;
  uname: string;
  osName: string;
  cpuModel: string;
  cores: number;
}

export const COLLECT_COMMAND = [
  "echo '==STAT=='",
  'head -n 1 /proc/stat',
  'nproc',
  "echo '==MEM=='",
  'cat /proc/meminfo',
  "echo '==DISK=='",
  'df -kP /',
  "echo '==NET=='",
  'cat /proc/net/dev',
  "echo '==LOAD=='",
  'cat /proc/loadavg',
  "echo '==UPTIME=='",
  'cat /proc/uptime',
].join('; ');

export const INFO_COMMAND = [
  "echo '==UNAME=='",
  'uname -srmo',
  "echo '==OS=='",
  "grep -m1 PRETTY_NAME /etc/os-release 2>/dev/null || echo 'PRETTY_NAME=\"Linux\"'",
  "echo '==CPU=='",
  "grep -m1 'model name' /proc/cpuinfo 2>/dev/null || echo 'model name : Unknown'",
  "echo '==CORES=='",
  'nproc',
  "echo '==HOSTNAME=='",
  'hostname',
].join('; ');

function section(out: string, name: string, next: string | null): string {
  const start = out.indexOf(`==${name}==`);
  if (start < 0) return '';
  const from = start + name.length + 4;
  const end = next ? out.indexOf(`==${next}==`, from) : -1;
  return out.slice(from, end < 0 ? undefined : end).trim();
}

export function parseServerInfo(stdout: string): ServerInfo {
  const uname = section(stdout, 'UNAME', 'OS').split('\n')[0]?.trim() ?? 'Linux';
  const osLine = section(stdout, 'OS', 'CPU');
  const osMatch = osLine.match(/PRETTY_NAME="([^"]+)"/);
  const cpuLine = section(stdout, 'CPU', 'CORES');
  const cpuModel = cpuLine.split(':')[1]?.trim() ?? 'Unknown CPU';
  const cores = parseInt(section(stdout, 'CORES', 'HOSTNAME').trim(), 10) || 1;
  const hostname = section(stdout, 'HOSTNAME', null).split('\n')[0]?.trim() ?? '';
  return {
    hostname,
    uname,
    osName: osMatch?.[1] ?? 'Linux',
    cpuModel,
    cores,
  };
}

interface RawCpu {
  total: number;
  idle: number;
}

function parseCpuLine(statSection: string): RawCpu {
  const line = statSection.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return { total: 0, idle: 0 };
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  // user nice system idle iowait irq softirq steal
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
  const total = parts.reduce((a, b) => a + (b || 0), 0);
  return { total, idle };
}

function parseMemKb(memSection: string, key: string): number {
  const m = memSection.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
  return m ? parseInt(m[1], 10) : 0;
}

function parseNet(netSection: string): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const line of netSection.split('\n')) {
    const m = line.match(/^\s*([a-zA-Z0-9_.-]+):\s*(.+)$/);
    if (!m) continue;
    const iface = m[1];
    if (iface === 'lo' || iface.startsWith('docker') || iface.startsWith('veth') || iface.startsWith('br-')) {
      continue;
    }
    const cols = m[2].trim().split(/\s+/).map(Number);
    rx += cols[0] ?? 0;
    tx += cols[8] ?? 0;
  }
  return { rx, tx };
}

/** 前一次采样的原始值，用于计算 CPU% 与网络速率 */
export interface PrevSample {
  cpu: RawCpu;
  rx: number;
  tx: number;
  timestamp: number;
}

export function parseMetrics(stdout: string, prev: PrevSample | null): { snap: MetricsSnapshot; sample: PrevSample } {
  const statSec = section(stdout, 'STAT', 'MEM');
  const memSec = section(stdout, 'MEM', 'DISK');
  const diskSec = section(stdout, 'DISK', 'NET');
  const netSec = section(stdout, 'NET', 'LOAD');
  const loadSec = section(stdout, 'LOAD', 'UPTIME');
  const uptimeSec = parseFloat(section(stdout, 'UPTIME', null).split(/\s+/)[0] ?? '0') || 0;

  // CPU
  const statLines = statSec.split('\n');
  const cpu = parseCpuLine(statLines[0] ?? '');
  const cpuCount = parseInt(statLines[1]?.trim() ?? '', 10) || 1;
  let cpuPercent: number | null = null;
  if (prev && cpu.total > prev.cpu.total) {
    const totalDelta = cpu.total - prev.cpu.total;
    const idleDelta = cpu.idle - prev.cpu.idle;
    cpuPercent = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  }

  // 内存
  const memTotalKb = parseMemKb(memSec, 'MemTotal');
  const memAvailableKb = parseMemKb(memSec, 'MemAvailable') || parseMemKb(memSec, 'MemFree');
  const memUsedKb = Math.max(0, memTotalKb - memAvailableKb);
  const swapTotalKb = parseMemKb(memSec, 'SwapTotal');
  const swapUsedKb = Math.max(0, swapTotalKb - parseMemKb(memSec, 'SwapFree'));

  // 磁盘（df -kP /）
  let diskTotalKb = 0;
  let diskUsedKb = 0;
  let diskPercent = 0;
  const diskLines = diskSec.split('\n').filter((l) => l.trim() && !l.startsWith('Filesystem'));
  if (diskLines.length > 0) {
    const cols = diskLines[0].trim().split(/\s+/);
    diskTotalKb = parseInt(cols[1] ?? '0', 10) || 0;
    diskUsedKb = parseInt(cols[2] ?? '0', 10) || 0;
    diskPercent = parseInt((cols[4] ?? '0').replace('%', ''), 10) || 0;
  }

  // 网络
  const { rx, tx } = parseNet(netSec);
  const now = Date.now();
  let netRxPerSec: number | null = null;
  let netTxPerSec: number | null = null;
  if (prev && now > prev.timestamp) {
    const dt = (now - prev.timestamp) / 1000;
    netRxPerSec = Math.max(0, (rx - prev.rx) / dt);
    netTxPerSec = Math.max(0, (tx - prev.tx) / dt);
  }

  // 负载
  const loadParts = loadSec.split(/\s+/);
  const load1 = parseFloat(loadParts[0] ?? '0') || 0;
  const load5 = parseFloat(loadParts[1] ?? '0') || 0;
  const load15 = parseFloat(loadParts[2] ?? '0') || 0;

  const snap: MetricsSnapshot = {
    timestamp: now,
    cpuPercent,
    cpuCount,
    memTotalKb,
    memUsedKb,
    memAvailableKb,
    swapTotalKb,
    swapUsedKb,
    diskTotalKb,
    diskUsedKb,
    diskPercent,
    netRxBytes: rx,
    netTxBytes: tx,
    netRxPerSec,
    netTxPerSec,
    load1,
    load5,
    load15,
    uptimeSec,
  };
  return { snap, sample: { cpu, rx, tx, timestamp: now } };
}

/** 对某台已连接的会话执行一次采集 */
export async function pollOnce(
  ssh: SSHClient,
  sessionId: string,
  prev: PrevSample | null
): Promise<{ snap: MetricsSnapshot; sample: PrevSample }> {
  const result: ExecResult = await ssh.exec(sessionId, COLLECT_COMMAND, 15);
  if (result.code !== 0 && !result.stdout.includes('==STAT==')) {
    throw new Error(result.stderr || `采集命令失败 (code=${result.code})`);
  }
  return parseMetrics(result.stdout, prev);
}

export async function fetchServerInfo(ssh: SSHClient, sessionId: string): Promise<ServerInfo> {
  const result = await ssh.exec(sessionId, INFO_COMMAND, 15);
  return parseServerInfo(result.stdout);
}
