/** 解析逻辑单元测试：node --experimental-strip-types scripts/test-parse.ts */

import assert from 'node:assert';

import { parseMetrics, parseServerInfo } from '../src/services/monitor.ts';

// 真实 Ubuntu 24.04 采集样例
const sample1 = `==STAT==
cpu  100000 200 50000 9000000 3000 0 2000 0 0 0
4
==MEM==
MemTotal:       16384000 kB
MemFree:         2000000 kB
MemAvailable:    8192000 kB
Buffers:          500000 kB
Cached:          4000000 kB
SwapTotal:       2097152 kB
SwapFree:        1048576 kB
==DISK==
Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/sda1        102400000  61440000  40960000      60% /
==NET==
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000000    5000    0    0    0     0          0         0  1000000    5000    0    0    0     0       0          0
  eth0: 500000000   80000    0    0    0     0          0         0 200000000   60000    0    0    0     0       0          0
 docker0: 9999      100      0    0    0     0          0         0  8888      100      0    0    0     0       0          0
==LOAD==
0.45 0.60 0.55 2/380 12345
==UPTIME==
86400.00 345600.00
`;

const sample2 = `==STAT==
cpu  100600 200 50300 9004000 3100 0 2100 0 0 0
4
==MEM==
MemTotal:       16384000 kB
MemFree:         1900000 kB
MemAvailable:    8000000 kB
Buffers:          510000 kB
Cached:          4100000 kB
SwapTotal:       2097152 kB
SwapFree:        1048576 kB
==DISK==
Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/sda1        102400000  61440000  40960000      60% /
==NET==
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000000    5000    0    0    0     0          0         0  1000000    5000    0    0    0     0       0          0
  eth0: 502000000   81000    0    0    0     0          0         0 201000000   61000    0    0    0     0       0          0
==LOAD==
0.50 0.62 0.56 2/381 12346
==UPTIME==
86402.00 345608.00
`;

// 第一次：无 prev → cpu/net 速率为 null
const r1 = parseMetrics(sample1, null);
assert.equal(r1.snap.cpuPercent, null);
assert.equal(r1.snap.cpuCount, 4);
assert.equal(r1.snap.memTotalKb, 16384000);
assert.equal(r1.snap.memAvailableKb, 8192000);
assert.equal(r1.snap.memUsedKb, 16384000 - 8192000);
assert.equal(r1.snap.swapUsedKb, 2097152 - 1048576);
assert.equal(r1.snap.diskTotalKb, 102400000);
assert.equal(r1.snap.diskUsedKb, 61440000);
assert.equal(r1.snap.diskPercent, 60);
// lo/docker0 被排除
assert.equal(r1.snap.netRxBytes, 500000000);
assert.equal(r1.snap.netTxBytes, 200000000);
assert.equal(r1.snap.netRxPerSec, null);
assert.equal(r1.snap.load1, 0.45);
assert.equal(r1.snap.uptimeSec, 86400);

// 第二次：有 prev → 计算 cpu% 与速率
// total delta = (100600+200+50300+9004000+3100+0+2100) - (100000+200+50000+9000000+3000+0+2000) = 5100
// idle delta = (9004000+3100) - (9000000+3000) = 4100 → busy 1000/5100 ≈ 19.6%
const prev = { ...r1.sample, timestamp: r1.sample.timestamp - 2000 };
const r2 = parseMetrics(sample2, prev);
assert.ok(r2.snap.cpuPercent !== null && Math.abs(r2.snap.cpuPercent - 19.6) < 0.5, `cpu% = ${r2.snap.cpuPercent}`);
// rx rate = (502000000-500000000)/2s = 1000000 B/s
assert.equal(r2.snap.netRxPerSec, 1000000);
assert.equal(r2.snap.netTxPerSec, 500000);

// 服务器信息解析
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
assert.equal(info.cpuModel, 'Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz');
assert.equal(info.cores, 8);
assert.equal(info.hostname, 'prod-web-01');

console.log('✓ 所有解析测试通过');
