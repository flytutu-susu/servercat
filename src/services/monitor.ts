/** 监控数据采集与解析 v2：一条组合命令读取 /proc 与系统信息，JS 侧解析 */

import type { ExecResult, SSHClient } from '@/ssh';

/** CPU 细分（百分比；首次采样为 null） */
export interface CpuBreakdown {
  percent: number | null; // 总占用
  user: number | null;
  system: number | null;
  iowait: number | null;
  steal: number | null;
  idle: number | null;
  count: number;
  /** 每核占用（0-100 或 null） */
  cores: (number | null)[];
}

export interface MemStat {
  totalKb: number;
  usedKb: number;
  availableKb: number;
  /** 页面缓存 Cached + SReclaimable */
  cacheKb: number;
  swapTotalKb: number;
  swapUsedKb: number;
  percent: number;
  swapPercent: number;
}

export interface DiskMountStat {
  fs: string;
  type: string;
  mount: string;
  totalKb: number;
  usedKb: number;
  percent: number;
  totalReadBytes: number;
  totalWriteBytes: number;
  readBps: number | null;
  writeBps: number | null;
  readIops: number | null;
  writeIops: number | null;
  /** 平均延迟 ms（基于 time_in_queue 增量近似） */
  readLatencyMs: number | null;
  writeLatencyMs: number | null;
}

export interface NetIfStat {
  name: string;
  ip: string | null;
  virtual: boolean;
  rxBytes: number;
  txBytes: number;
  rxPerSec: number | null;
  txPerSec: number | null;
}

export interface TcpStat {
  retransPercent: number | null;
  activeOpens: number;
  passiveOpens: number;
  curEstab: number;
}

export interface MetricsSnapshot {
  timestamp: number;
  cpu: CpuBreakdown;
  mem: MemStat;
  disks: DiskMountStat[];
  nets: NetIfStat[];
  tcp: TcpStat;
  load1: number;
  load5: number;
  load15: number;
  uptimeSec: number;
}

export interface ServerInfo {
  hostname: string;
  uname: string;
  osName: string;
  cpuModel: string;
  cores: number;
}

export const COLLECT_COMMAND = [
  "echo '==STAT=='",
  'cat /proc/stat',
  "echo '==MEM=='",
  'cat /proc/meminfo',
  "echo '==DF=='",
  "df -kPT -x tmpfs -x devtmpfs -x overlay -x squashfs -x efivarfs 2>/dev/null || df -kPT",
  "echo '==DISKSTATS=='",
  'cat /proc/diskstats',
  "echo '==NET=='",
  'cat /proc/net/dev',
  "echo '==IP=='",
  'ip -4 -o addr show 2>/dev/null',
  "echo '==SNMP=='",
  "grep '^Tcp:' /proc/net/snmp",
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
  "grep -m1 'model name' /proc/cpuinfo 2>/dev/null || grep -m1 'Hardware' /proc/cpuinfo 2>/dev/null || echo 'model name : Unknown'",
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
  return { hostname, uname, osName: osMatch?.[1] ?? 'Linux', cpuModel, cores };
}

// ---------------------------------------------------------------------------
// /proc/stat

/** [user, nice, system, idle, iowait, irq, softirq, steal] */
type CpuTicks = number[];

function parseCpuTicks(line: string): CpuTicks {
  const p = line.trim().split(/\s+/).slice(1).map(Number);
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => p[i] ?? 0);
}

function cpuTotal(t: CpuTicks): number {
  return t.reduce((a, b) => a + b, 0);
}

function cpuPct(cur: CpuTicks, prev: CpuTicks | null, idx: number | readonly number[]): number | null {
  if (!prev) return null;
  const dt = cpuTotal(cur) - cpuTotal(prev);
  if (dt <= 0) return null;
  const idxs = typeof idx === 'number' ? [idx] : idx;
  const d = idxs.reduce((a, i) => a + (cur[i] - prev[i]), 0);
  return Math.max(0, Math.min(100, (d / dt) * 100));
}

// ---------------------------------------------------------------------------
// /proc/diskstats
// 字段: major minor name reads reads_merged sectors_read ms_reading
//       writes writes_merged sectors_written ms_writing ios_in_progress ms_doing_io ms_weighted

interface DiskRaw {
  sectorsRead: number;
  sectorsWritten: number;
  reads: number;
  writes: number;
  msRead: number;
  msWrite: number;
}

function parseDiskstats(sec: string): Map<string, DiskRaw> {
  const map = new Map<string, DiskRaw>();
  for (const line of sec.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length < 14) continue;
    map.set(p[2], {
      reads: Number(p[3]) || 0,
      sectorsRead: Number(p[5]) || 0,
      msRead: Number(p[6]) || 0,
      writes: Number(p[7]) || 0,
      sectorsWritten: Number(p[9]) || 0,
      msWrite: Number(p[10]) || 0,
    });
  }
  return map;
}

/** 从 df 的设备名找 diskstats 键：/dev/vda3 → vda3，否则找父盘 vda */
function diskKeyFor(fs: string, diskstats: Map<string, DiskRaw>): string | null {
  const dev = fs.replace(/^\/dev\//, '');
  if (diskstats.has(dev)) return dev;
  const parent = dev.replace(/p?\d+$/, '');
  if (diskstats.has(parent)) return parent;
  return null;
}

// ---------------------------------------------------------------------------
// /proc/net/dev + ip addr

function isVirtualIf(name: string): boolean {
  return (
    name === 'lo' ||
    /^(docker|veth|br-|virbr|tun|tap|wg|tailscale|zt|cni|flannel|cali|kube)/.test(name)
  );
}

/** 前一次采样的原始值 */
export interface PrevSample {
  cpuTotal: CpuTicks;
  cores: CpuTicks[];
  disks: Map<string, DiskRaw>;
  nets: Map<string, { rx: number; tx: number }>;
  tcp: { retrans: number; outSegs: number };
  timestamp: number;
}

export function parseMetrics(
  stdout: string,
  prev: PrevSample | null
): { snap: MetricsSnapshot; sample: PrevSample } {
  const now = Date.now();
  const statSec = section(stdout, 'STAT', 'MEM');
  const memSec = section(stdout, 'MEM', 'DF');
  const dfSec = section(stdout, 'DF', 'DISKSTATS');
  const diskSec = section(stdout, 'DISKSTATS', 'NET');
  const netSec = section(stdout, 'NET', 'IP');
  const ipSec = section(stdout, 'IP', 'SNMP');
  const snmpSec = section(stdout, 'SNMP', 'LOAD');
  const loadSec = section(stdout, 'LOAD', 'UPTIME');
  const uptimeSec = parseFloat(section(stdout, 'UPTIME', null).split(/\s+/)[0] ?? '0') || 0;

  // ---- CPU ----
  const cpuLines = statSec.split('\n').filter((l) => /^cpu/.test(l));
  const totalTicks = cpuLines.length ? parseCpuTicks(cpuLines[0]) : null;
  const coreTicks = cpuLines.slice(1).filter((l) => /^cpu\d/.test(l)).map(parseCpuTicks);
  const prevCores = prev?.cores ?? [];
  const cores = coreTicks.map((t, i) => {
    if (!prev || !prevCores[i]) return null;
    const dt = cpuTotal(t) - cpuTotal(prevCores[i]);
    if (dt <= 0) return null;
    const idleDelta = t[3] + t[4] - (prevCores[i][3] + prevCores[i][4]);
    return Math.max(0, Math.min(100, (1 - idleDelta / dt) * 100));
  });

  const cpu: CpuBreakdown = {
    percent: null,
    user: null,
    system: null,
    iowait: null,
    steal: null,
    idle: null,
    count: coreTicks.length || 1,
    cores,
  };
  if (totalTicks) {
    const prevTotal = prev?.cpuTotal ?? null;
    cpu.user = cpuPct(totalTicks, prevTotal, [0, 1]);
    cpu.system = cpuPct(totalTicks, prevTotal, [2, 5, 6]);
    cpu.iowait = cpuPct(totalTicks, prevTotal, 4);
    cpu.steal = cpuPct(totalTicks, prevTotal, 7);
    cpu.idle = cpuPct(totalTicks, prevTotal, [3, 4]);
    cpu.percent = cpu.idle != null ? Math.max(0, 100 - cpu.idle) : null;
  }

  // ---- 内存 ----
  const mem = (key: string): number => {
    const m = memSec.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
    return m ? parseInt(m[1], 10) : 0;
  };
  const totalKb = mem('MemTotal');
  const availableKb = mem('MemAvailable') || mem('MemFree');
  const cacheKb = mem('Cached') + mem('SReclaimable');
  const swapTotalKb = mem('SwapTotal');
  const swapFreeKb = mem('SwapFree');
  const memStat: MemStat = {
    totalKb,
    usedKb: Math.max(0, totalKb - availableKb),
    availableKb,
    cacheKb,
    swapTotalKb,
    swapUsedKb: Math.max(0, swapTotalKb - swapFreeKb),
    percent: totalKb > 0 ? ((totalKb - availableKb) / totalKb) * 100 : 0,
    swapPercent: swapTotalKb > 0 ? ((swapTotalKb - swapFreeKb) / swapTotalKb) * 100 : 0,
  };

  // ---- 磁盘 ----
  const diskstats = parseDiskstats(diskSec);
  const prevDisks = prev?.disks ?? new Map<string, DiskRaw>();
  const dtSec = prev ? (now - prev.timestamp) / 1000 : 0;
  const disks: DiskMountStat[] = [];
  for (const line of dfSec.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('Filesystem')) continue;
    const p = t.split(/\s+/);
    if (p.length < 7) continue;
    const [fs, type, blocks, used, , cap, ...mountParts] = p;
    const mount = mountParts.join(' ');
    const dk = diskKeyFor(fs, diskstats);
    const raw = dk ? diskstats.get(dk)! : null;
    const prevRaw = dk ? prevDisks.get(dk) : undefined;
    const SECTOR = 512;
    const stat: DiskMountStat = {
      fs,
      type,
      mount,
      totalKb: parseInt(blocks, 10) || 0,
      usedKb: parseInt(used, 10) || 0,
      percent: parseInt((cap ?? '0').replace('%', ''), 10) || 0,
      totalReadBytes: (raw?.sectorsRead ?? 0) * SECTOR,
      totalWriteBytes: (raw?.sectorsWritten ?? 0) * SECTOR,
      readBps: null,
      writeBps: null,
      readIops: null,
      writeIops: null,
      readLatencyMs: null,
      writeLatencyMs: null,
    };
    if (raw && prevRaw && dtSec > 0) {
      const dReads = raw.reads - prevRaw.reads;
      const dWrites = raw.writes - prevRaw.writes;
      stat.readBps = Math.max(0, ((raw.sectorsRead - prevRaw.sectorsRead) * SECTOR) / dtSec);
      stat.writeBps = Math.max(0, ((raw.sectorsWritten - prevRaw.sectorsWritten) * SECTOR) / dtSec);
      stat.readIops = Math.max(0, dReads / dtSec);
      stat.writeIops = Math.max(0, dWrites / dtSec);
      stat.readLatencyMs = dReads > 0 ? Math.max(0, (raw.msRead - prevRaw.msRead) / dReads) : 0;
      stat.writeLatencyMs = dWrites > 0 ? Math.max(0, (raw.msWrite - prevRaw.msWrite) / dWrites) : 0;
    }
    disks.push(stat);
  }

  // ---- 网络 ----
  const ipByIf = new Map<string, string>();
  for (const line of ipSec.split('\n')) {
    const m = line.match(/^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)\//);
    if (m && !ipByIf.has(m[1])) ipByIf.set(m[1], m[2]);
  }
  const prevNets = prev?.nets ?? new Map();
  const nets: NetIfStat[] = [];
  const netsRaw = new Map<string, { rx: number; tx: number }>();
  for (const line of netSec.split('\n')) {
    const m = line.match(/^\s*([a-zA-Z0-9_.:-]+):\s*(.+)$/);
    if (!m) continue;
    const name = m[1];
    const cols = m[2].trim().split(/\s+/).map(Number);
    const rx = cols[0] ?? 0;
    const tx = cols[8] ?? 0;
    netsRaw.set(name, { rx, tx });
    const prevNet = prevNets.get(name);
    nets.push({
      name,
      ip: ipByIf.get(name) ?? null,
      virtual: isVirtualIf(name),
      rxBytes: rx,
      txBytes: tx,
      rxPerSec: prevNet && dtSec > 0 ? Math.max(0, (rx - prevNet.rx) / dtSec) : null,
      txPerSec: prevNet && dtSec > 0 ? Math.max(0, (tx - prevNet.tx) / dtSec) : null,
    });
  }
  nets.sort((a, b) => Number(a.virtual) - Number(b.virtual));

  // ---- TCP ----
  let tcp: TcpStat = { retransPercent: null, activeOpens: 0, passiveOpens: 0, curEstab: 0 };
  let tcpRaw = { retrans: 0, outSegs: 0 };
  const snmpLines = snmpSec.split('\n').filter((l) => l.startsWith('Tcp:'));
  if (snmpLines.length >= 2) {
    const keys = snmpLines[0].split(/\s+/).slice(1);
    const vals = snmpLines[1].split(/\s+/).slice(1).map(Number);
    const get = (k: string): number => vals[keys.indexOf(k)] ?? 0;
    const retrans = get('RetransSegs');
    const outSegs = get('OutSegs');
    let retransPercent: number | null = null;
    if (prev) {
      const dRetrans = retrans - prev.tcp.retrans;
      const dOut = outSegs - prev.tcp.outSegs;
      retransPercent = dOut > 0 ? Math.max(0, Math.min(100, (dRetrans / dOut) * 100)) : 0;
    }
    tcp = {
      retransPercent,
      activeOpens: get('ActiveOpens'),
      passiveOpens: get('PassiveOpens'),
      curEstab: get('CurrEstab'),
    };
    tcpRaw = { retrans, outSegs };
  }

  // ---- 负载 ----
  const loadParts = loadSec.split(/\s+/);

  const snap: MetricsSnapshot = {
    timestamp: now,
    cpu,
    mem: memStat,
    disks,
    nets,
    tcp,
    load1: parseFloat(loadParts[0] ?? '0') || 0,
    load5: parseFloat(loadParts[1] ?? '0') || 0,
    load15: parseFloat(loadParts[2] ?? '0') || 0,
    uptimeSec,
  };
  return {
    snap,
    sample: {
      cpuTotal: totalTicks ?? [0, 0, 0, 0, 0, 0, 0, 0],
      cores: coreTicks,
      disks: diskstats,
      nets: netsRaw,
      tcp: tcpRaw,
      timestamp: now,
    },
  };
}

export async function pollOnce(
  ssh: SSHClient,
  sessionId: string,
  prev: PrevSample | null
): Promise<{ snap: MetricsSnapshot; sample: PrevSample }> {
  const result: ExecResult = await ssh.exec(sessionId, COLLECT_COMMAND, 20);
  if (result.code !== 0 && !result.stdout.includes('==STAT==')) {
    throw new Error(result.stderr || `采集命令失败 (code=${result.code})`);
  }
  return parseMetrics(result.stdout, prev);
}

export async function fetchServerInfo(ssh: SSHClient, sessionId: string): Promise<ServerInfo> {
  const result = await ssh.exec(sessionId, INFO_COMMAND, 15);
  return parseServerInfo(result.stdout);
}
