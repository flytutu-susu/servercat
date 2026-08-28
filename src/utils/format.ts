/** 格式化工具 */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : decimals)} ${units[u]}`;
}

/** ServerCat 风格紧凑体积：11 T / 312 G / 81 M */
export function formatBytesCompact(bytes: number): { value: string; unit: string } {
  if (!isFinite(bytes) || bytes < 0) return { value: '0', unit: 'B' };
  const units = ['B', 'K', 'M', 'G', 'T', 'P'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return { value: v >= 100 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/, ''), unit: units[u] };
}

export function formatKb(kb: number): string {
  return formatBytes(kb * 1024);
}

export function formatKbCompact(kb: number): { value: string; unit: string } {
  return formatBytesCompact(kb * 1024);
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/** 紧凑速率：14 K/s */
export function formatRateCompact(bytesPerSec: number): { value: string; unit: string } {
  const b = formatBytesCompact(bytesPerSec);
  return { value: b.value, unit: `${b.unit}/s` };
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}

/** ServerCat 风格运行时间：101D / 3H / 12M */
export function formatUptimeCompact(sec: number): { value: string; unit: string } {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return { value: String(d), unit: 'D' };
  if (h > 0) return { value: String(h), unit: 'H' };
  return { value: String(m), unit: 'M' };
}

/** 大计数转中文万：175.4万 */
export function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export function percentColorOf(pct: number, c: { green: string; orange: string; red: string }): string {
  if (pct >= 90) return c.red;
  if (pct >= 70) return c.orange;
  return c.green;
}
