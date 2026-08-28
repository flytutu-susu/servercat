/** 解析逻辑单元测试（v2）：node --experimental-strip-types scripts/test-parse.ts */

import assert from 'node:assert';

import { parseMetrics, parseServerInfo } from '../src/services/monitor.ts';

// 真实 Ubuntu 24.04 采集样例（v2 组合命令输出）
const s1 = `==STAT==
cpu  100000 200 50000 9000000 3000 0 2000 0 0 0
cpu0 60000 100 30000 4500000 2000 0 1000 0 0 0
cpu1 40000 100 20000 4500000 1000 0 1000 0 0 0
intr 1
btime 1700000000
==MEM==
MemTotal:       16384000 kB
MemFree:         2000000 kB
MemAvailable:    8192000 kB
Buffers:          500000 kB
Cached:          4000000 kB
SReclaimable:     100000 kB
SwapTotal:       2097152 kB
SwapFree:        1048576 kB
==DF==
Filesystem     Type  1024-blocks      Used Available Capacity Mounted on
/dev/vda3      ext4    102400000  61440000  40960000      60% /
/dev/vda2      vfat       197000    191000      6000      97% /boot/efi
==DISKSTATS==
 259       0 vda 1000000 0 22000000000 5000000 3000000 0 650000000 10000000 0 2000000 15000000 0 0 0
 259       2 vda2 100 0 26000 50 10 0 10000 20 0 60 70 0 0 0
==NET==
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 4400000000 5000 0 0 0 0 0 0 4400000000 5000 0 0 0 0 0 0
  eth0: 23000000000 80000 0 0 0 0 0 0 75000000000 60000 0 0 0 0 0 0
docker0: 9999 100 0 0 0 0 0 0 8888 100 0 0 0 0 0 0
==IP==
1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever preferred_lft forever
2: eth0    inet 172.25.82.97/20 brd 172.25.95.255 scope global eth0\\       valid_lft forever preferred_lft forever
==SNMP==
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors
Tcp: 1 200 120000 -1 1754000 343000 100 50 373000 99999999 88888888 12345 0 3000 0
==LOAD==
0.45 0.60 0.55 2/380 12345
==UPTIME==
86400.00 345600.00
`;

const s2 = `==STAT==
cpu  100600 200 50300 9004000 3100 0 2100 0 0 0
cpu0 60300 100 30200 4503000 2050 0 1050 0 0 0
cpu1 40300 100 20100 4501000 1050 0 1050 0 0 0
intr 1
btime 1700000000
==MEM==
MemTotal:       16384000 kB
MemFree:         1900000 kB
MemAvailable:    8000000 kB
Buffers:          510000 kB
Cached:          4100000 kB
SReclaimable:     100000 kB
SwapTotal:       2097152 kB
SwapFree:        1048576 kB
==DF==
Filesystem     Type  1024-blocks      Used Available Capacity Mounted on
/dev/vda3      ext4    102400000  61440000  40960000      60% /
/dev/vda2      vfat       197000    191000      6000      97% /boot/efi
==DISKSTATS==
 259       0 vda 1002000 0 22002048000 5003000 3001000 0 650002048 10002000 0 2010000 15005000 0 0 0
 259       2 vda2 100 0 26000 50 10 0 10000 20 0 60 70 0 0 0
==NET==
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 4400000000 5000 0 0 0 0 0 0 4400000000 5000 0 0 0 0 0 0
  eth0: 23004000000 81000 0 0 0 0 0 0 75002000000 61000 0 0 0 0 0 0
docker0: 9999 100 0 0 0 0 0 0 8888 100 0 0 0 0 0 0
==IP==
1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever preferred_lft forever
2: eth0    inet 172.25.82.97/20 brd 172.25.95.255 scope global eth0\\       valid_lft forever preferred_lft forever
==SNMP==
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors
Tcp: 1 200 120000 -1 1755000 343100 100 50 373100 100099999 88908888 12445 0 3005 0
==LOAD==
0.50 0.62 0.56 2/381 12346
==UPTIME==
86402.00 345608.00
`;

// ---- 第一次采样：比率为 null，累计值正确 ----
const r1 = parseMetrics(s1, null);
assert.equal(r1.snap.cpu.percent, null);
assert.equal(r1.snap.cpu.count, 2);
assert.equal(r1.snap.cpu.cores.length, 2);
assert.equal(r1.snap.mem.totalKb, 16384000);
assert.equal(r1.snap.mem.usedKb, 16384000 - 8192000);
assert.equal(r1.snap.mem.cacheKb, 4000000 + 100000);
assert.equal(r1.snap.mem.swapUsedKb, 2097152 - 1048576);

assert.equal(r1.snap.disks.length, 2);
assert.equal(r1.snap.disks[0].mount, '/');
assert.equal(r1.snap.disks[0].type, 'ext4');
assert.equal(r1.snap.disks[0].percent, 60);
// vda3 → 父盘 vda 的累计扇区 * 512
assert.equal(r1.snap.disks[0].totalReadBytes, 22000000000 * 512);
assert.equal(r1.snap.disks[0].readBps, null);

assert.equal(r1.snap.nets.length, 3);
assert.equal(r1.snap.nets[0].name, 'eth0'); // 物理网卡排最前
assert.equal(r1.snap.nets[0].ip, '172.25.82.97');
assert.equal(r1.snap.nets[0].rxBytes, 23000000000);
assert.equal(r1.snap.nets.find((n) => n.name === 'lo')?.virtual, true);

assert.equal(r1.snap.tcp.activeOpens, 1754000);
assert.equal(r1.snap.tcp.passiveOpens, 343000);
assert.equal(r1.snap.tcp.curEstab, 373000);
assert.equal(r1.snap.tcp.retransPercent, null);
assert.equal(r1.snap.load1, 0.45);
assert.equal(r1.snap.uptimeSec, 86400);

// ---- 第二次采样（间隔 2s）：检查比率 ----
const prev = { ...r1.sample, timestamp: r1.sample.timestamp - 2000 };
const r2 = parseMetrics(s2, prev);

// 总 CPU: total delta=5100, idle+iowait delta=4100 → busy ≈ 19.6%
assert.ok(r2.snap.cpu.percent !== null && Math.abs(r2.snap.cpu.percent - 19.6) < 0.5, `cpu=${r2.snap.cpu.percent}`);
// user delta = (100600+200)-(100000+200)=600 → 600/5100 ≈ 11.76%
assert.ok(r2.snap.cpu.user !== null && Math.abs(r2.snap.cpu.user - 11.76) < 0.3, `user=${r2.snap.cpu.user}`);
// system delta = (50300+0+2100)-(50000+0+2000)=400 → 7.84%
assert.ok(r2.snap.cpu.system !== null && Math.abs(r2.snap.cpu.system - 7.84) < 0.3, `system=${r2.snap.cpu.system}`);
// iowait delta = 100 → 1.96%
assert.ok(r2.snap.cpu.iowait !== null && Math.abs(r2.snap.cpu.iowait - 1.96) < 0.3);
assert.equal(r2.snap.cpu.steal, 0);
// 每核
assert.ok(r2.snap.cpu.cores[0] !== null);
assert.equal(r2.snap.cpu.cores.length, 2);

// 磁盘 vda3: 读扇区 delta = 2048000 扇区*512 / ≈2s ≈ 524MB/s（dt 含执行耗时，容差 2%）
const disk0 = r2.snap.disks[0];
const approx = (actual: number | null, expected: number, msg: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < expected * 0.02, `${msg}: actual=${actual} expected=${expected}`);
approx(disk0.readBps, (2048000 * 512) / 2, 'readBps');
approx(disk0.writeBps, (2048 * 512) / 2, 'writeBps');
approx(disk0.readIops, 1000, 'readIops'); // 2000 次 / 2s
approx(disk0.writeIops, 500, 'writeIops');
// 读延迟: (5003000-5000000)ms / 2000 次 = 1.5ms（与 dt 无关）
assert.ok(disk0.readLatencyMs !== null && Math.abs(disk0.readLatencyMs - 1.5) < 0.01, `lat=${disk0.readLatencyMs}`);

// 网络 eth0: rx delta = 4000000 B / ≈2s ≈ 2MB/s
const eth0 = r2.snap.nets.find((n) => n.name === 'eth0')!;
approx(eth0.rxPerSec, 2000000, 'rxPerSec');
approx(eth0.txPerSec, 1000000, 'txPerSec');

// TCP 重传率: (12445-12345) / (88908888-88888888) = 100/20000 = 0.5%
assert.ok(r2.snap.tcp.retransPercent !== null && Math.abs(r2.snap.tcp.retransPercent - 0.5) < 0.01, `retrans=${r2.snap.tcp.retransPercent}`);

// ---- 服务器信息 ----
const infoOut = `==UNAME==
Linux 6.8.0-45-generic x86_64 GNU/Linux
==OS==
PRETTY_NAME="Ubuntu 24.04.1 LTS"
==CPU==
model name	: Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz
==CORES==
8
==HOSTNAME==
prod-web-01
`;
const info = parseServerInfo(infoOut);
assert.equal(info.osName, 'Ubuntu 24.04.1 LTS');
assert.equal(info.cores, 8);
assert.equal(info.hostname, 'prod-web-01');

console.log('✓ 所有 v2 解析测试通过');
