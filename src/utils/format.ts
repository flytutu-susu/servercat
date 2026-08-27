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

export function formatKb(kb: number): string {
  return formatBytes(kb * 1024);
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}

export function percentColor(pct: number): string {
  if (pct >= 90) return '#FF453A';
  if (pct >= 70) return '#FF9F0A';
  return '#30D158';
}
