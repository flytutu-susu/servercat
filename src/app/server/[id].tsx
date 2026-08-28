import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardDivider } from '@/components/Card';
import { CorePills } from '@/components/CorePills';
import { Donut } from '@/components/Donut';
import { StatCell } from '@/components/StatCell';
import { UsageBar } from '@/components/UsageBar';
import { Radius, Spacing, useColors } from '@/constants/theme';
import { useConnections } from '@/services/connection';
import {
  containerAction,
  listContainers,
  type ContainerAction,
  type ContainerInfo,
} from '@/services/docker';
import {
  fetchServerInfo,
  pollOnce,
  type DiskMountStat,
  type MetricsSnapshot,
  type NetIfStat,
  type PrevSample,
  type ServerInfo,
} from '@/services/monitor';
import { getSSH } from '@/ssh';
import { useServers } from '@/store/servers';
import {
  formatBytes,
  formatBytesCompact,
  formatCount,
  formatKbCompact,
  formatRate,
  formatUptimeCompact,
  percentColorOf,
} from '@/utils/format';

export default function ServerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useColors();
  const server = useServers((s) => s.servers.find((x) => x.id === id));
  const status = useConnections((s) => s.entries[id ?? '']?.status ?? 'offline');
  const connError = useConnections((s) => s.entries[id ?? '']?.error);

  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null);
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [dockerError, setDockerError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dockerBusy, setDockerBusy] = useState<string | null>(null);
  const [showVirtual, setShowVirtual] = useState(false);

  const prevRef = useRef<PrevSample | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dockerTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const doPoll = useCallback(async () => {
    if (!id) return;
    try {
      const sessionId = await useConnections.getState().ensureConnected(id);
      const { snap: s, sample } = await pollOnce(getSSH(), sessionId, prevRef.current);
      prevRef.current = sample;
      setSnap(s);
    } catch {
      useConnections.getState().invalidate(id);
    }
  }, [id]);

  const doDocker = useCallback(async () => {
    if (!id) return;
    try {
      const sessionId = await useConnections.getState().ensureConnected(id);
      const list = await listContainers(getSSH(), sessionId);
      setContainers(list);
      setDockerError(list === null);
    } catch {
      setDockerError(true);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) return;
        try {
          const sessionId = await useConnections.getState().ensureConnected(id);
          if (cancelled) return;
          fetchServerInfo(getSSH(), sessionId).then((i) => !cancelled && setInfo(i)).catch(() => {});
          doPoll();
          doDocker();
        } catch {
          // 轮询会自动重试
        }
      })();
      pollTimer.current = setInterval(doPoll, 2000);
      dockerTimer.current = setInterval(doDocker, 10000);
      return () => {
        cancelled = true;
        if (pollTimer.current) clearInterval(pollTimer.current);
        if (dockerTimer.current) clearInterval(dockerTimer.current);
      };
    }, [id, doPoll, doDocker])
  );

  const onDockerAction = useCallback(
    (ct: ContainerInfo) => {
      const running = ct.state === 'running';
      const paused = ct.state === 'paused';
      const actions: { label: string; action: ContainerAction | 'logs'; destructive?: boolean }[] = running
        ? [
            { label: '重启', action: 'restart' },
            { label: '停止', action: 'stop', destructive: true },
            { label: '暂停', action: 'pause' },
          ]
        : paused
          ? [{ label: '恢复', action: 'unpause' }]
          : [{ label: '启动', action: 'start' }];
      const all = [...actions, { label: '查看日志', action: 'logs' as const }];
      const labels = [...all.map((a) => a.label), '取消'];

      const handle = (idx: number) => {
        if (idx >= all.length) return;
        const choice = all[idx];
        if (choice.action === 'logs') {
          router.push({ pathname: '/logs', params: { serverId: id, containerId: ct.id, name: ct.name } });
          return;
        }
        void (async () => {
          setDockerBusy(ct.id);
          try {
            const sessionId = await useConnections.getState().ensureConnected(id!);
            const res = await containerAction(getSSH(), sessionId, choice.action as ContainerAction, ct.id);
            if (!res.ok) Alert.alert('操作失败', res.message);
            await doDocker();
          } finally {
            setDockerBusy(null);
          }
        })();
      };

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: `${ct.name} (${ct.image})`,
            options: labels,
            cancelButtonIndex: labels.length - 1,
            destructiveButtonIndex: all.findIndex((a) => a.destructive),
          },
          handle
        );
      } else {
        Alert.alert(ct.name, ct.image, [
          ...all.map((a, i) => ({
            text: a.label,
            style: a.destructive ? ('destructive' as const) : ('default' as const),
            onPress: () => handle(i),
          })),
          { text: '取消', style: 'cancel' },
        ]);
      }
    },
    [id, doDocker, router]
  );

  if (!server) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary }}>服务器不存在</Text>
      </View>
    );
  }

  const cpu = snap?.cpu;
  const mem = snap?.mem;
  const netsPhysical = snap?.nets.filter((n) => !n.virtual) ?? [];
  const netsVirtual = snap?.nets.filter((n) => n.virtual) ?? [];
  const totalRx = netsPhysical.reduce((a, n) => a + n.rxBytes, 0);
  const totalTx = netsPhysical.reduce((a, n) => a + n.txBytes, 0);
  const rxNow = netsPhysical.reduce((a, n) => a + (n.rxPerSec ?? 0), 0);
  const txNow = netsPhysical.reduce((a, n) => a + (n.txPerSec ?? 0), 0);
  const txShare = totalRx + totalTx > 0 ? (totalTx / (totalRx + totalTx)) * 100 : 0;
  const uptime = snap ? formatUptimeCompact(snap.uptimeSec) : null;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: server.name }} />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              useConnections.getState().invalidate(id!);
              await doPoll();
              await doDocker();
              setRefreshing(false);
            }}
            tintColor={c.textSecondary}
          />
        }
        contentContainerStyle={{ paddingVertical: Spacing.three, paddingBottom: 100 }}>
        {/* 副标题：系统 */}
        <Text style={[styles.osText, { color: c.textSecondary }]}>
          {info ? `${info.osName} · ${info.cpuModel} × ${info.cores}` : '…'}
        </Text>

        {/* 状态横幅 */}
        {status !== 'online' && (
          <View
            style={[
              styles.banner,
              { backgroundColor: status === 'error' ? c.red + '22' : c.orange + '22' },
            ]}>
            {status === 'connecting' ? (
              <ActivityIndicator size="small" color={c.orange} />
            ) : (
              <Ionicons name="warning-outline" size={14} color={status === 'error' ? c.red : c.orange} />
            )}
            <Text style={[styles.bannerText, { color: status === 'error' ? c.red : c.orange }]}>
              {status === 'connecting' ? '正在连接…' : status === 'error' ? `连接失败：${connError ?? ''}` : '未连接（下拉重试）'}
            </Text>
          </View>
        )}

        {/* ==================== CPU ==================== */}
        <Card>
          <View style={styles.cpuTop}>
            <View style={styles.cpuBigWrap}>
              <Text style={[styles.cpuBig, { color: c.text }]}>
                {cpu?.percent == null ? '—' : cpu.percent.toFixed(0)}
              </Text>
              <Text style={[styles.cpuPct, { color: c.textSecondary }]}>%</Text>
            </View>
            <View style={styles.legendGrid}>
              <StatCell label="系统" value={cpu?.system == null ? '—' : cpu.system.toFixed(0)} sub="%" dot={c.red} labelColor={c.textSecondary} valueColor={c.text} />
              <StatCell label="用户" value={cpu?.user == null ? '—' : cpu.user.toFixed(0)} sub="%" dot={c.green} labelColor={c.textSecondary} valueColor={c.text} />
              <StatCell label="IO等待" value={cpu?.iowait == null ? '—' : cpu.iowait.toFixed(0)} sub="%" dot={c.purple} labelColor={c.textSecondary} valueColor={c.text} />
              <StatCell label="STEAL" value={cpu?.steal == null ? '—' : cpu.steal.toFixed(0)} sub="%" dot={c.yellow} labelColor={c.textSecondary} valueColor={c.text} />
            </View>
          </View>

          <View style={{ marginTop: Spacing.three }}>
            <CorePills cores={cpu?.cores ?? []} activeColor={c.green} trackColor={c.backgroundSelected} />
          </View>

          <CardDivider />

          <View style={styles.gridRow}>
            <StatCell label="核数" value={String(cpu?.count ?? info?.cores ?? '—')} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="空闲" value={cpu?.idle == null ? '—' : cpu.idle.toFixed(0)} sub="%" labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="运行时间" value={uptime?.value ?? '—'} sub={uptime?.unit} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="负载 1,5,15m" value={snap ? snap.load1.toFixed(2) : '—'} labelColor={c.textSecondary} valueColor={c.text} />
          </View>
        </Card>

        {/* ==================== 内存 ==================== */}
        <Card>
          <View style={styles.memRow}>
            <View style={styles.memStats}>
              <StatCell label="可用" value={mem ? formatKbCompact(mem.availableKb).value : '—'} sub={mem ? formatKbCompact(mem.availableKb).unit : ''} labelColor={c.textSecondary} valueColor={c.text} />
              <StatCell label="已用" value={mem ? formatKbCompact(mem.usedKb).value : '—'} sub={mem ? formatKbCompact(mem.usedKb).unit : ''} dot={c.green} labelColor={c.textSecondary} valueColor={c.text} />
              <StatCell label="页面缓存" value={mem ? formatKbCompact(mem.cacheKb).value : '—'} sub={mem ? formatKbCompact(mem.cacheKb).unit : ''} dot={c.backgroundSelected} labelColor={c.textSecondary} valueColor={c.text} />
            </View>
            <Donut
              percent={mem?.percent ?? 0}
              color={percentColorOf(mem?.percent ?? 0, c)}
              trackColor={c.backgroundSelected}
              labelColor={c.text}
              size={72}
            />
          </View>
          {mem && mem.swapTotalKb > 0 && (
            <>
              <CardDivider />
              <View style={styles.swapRow}>
                <Text style={[styles.swapLabel, { color: c.textSecondary }]}>交换分区</Text>
                <View style={{ flex: 1 }}>
                  <UsageBar percent={mem.swapPercent} color={c.purple} valueLabel={`${formatKbCompact(mem.swapUsedKb).value}${formatKbCompact(mem.swapUsedKb).unit} / ${formatKbCompact(mem.swapTotalKb).value}${formatKbCompact(mem.swapTotalKb).unit}`} labelColor={c.textSecondary} valueColor={c.text} trackColor={c.backgroundSelected} />
                </View>
              </View>
            </>
          )}
        </Card>

        {/* ==================== 网络 ==================== */}
        <Card title="网络">
          <View style={styles.netTop}>
            <StatCell label="↑/S" value={snap ? formatBytesCompact(txNow).value : '—'} sub={snap ? formatBytesCompact(txNow).unit + '/s' : ''} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="↓/S" value={snap ? formatBytesCompact(rxNow).value : '—'} sub={snap ? formatBytesCompact(rxNow).unit + '/s' : ''} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="↑ 累计" value={formatBytesCompact(totalTx).value} sub={formatBytesCompact(totalTx).unit} dot={c.orange} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="↓ 累计" value={formatBytesCompact(totalRx).value} sub={formatBytesCompact(totalRx).unit} dot={c.green} labelColor={c.textSecondary} valueColor={c.text} />
            <Donut percent={txShare} color={c.green} trackColor={c.orange} label="" labelColor={c.text} size={56} />
          </View>
          <CardDivider />
          <View style={styles.gridRow}>
            <StatCell label="重传率" value={snap?.tcp.retransPercent == null ? '—' : snap.tcp.retransPercent.toFixed(1)} sub="%" labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="主动建连" value={snap ? formatCount(snap.tcp.activeOpens) : '—'} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="被动建连" value={snap ? formatCount(snap.tcp.passiveOpens) : '—'} labelColor={c.textSecondary} valueColor={c.text} />
            <StatCell label="当前建连" value={snap ? formatCount(snap.tcp.curEstab) : '—'} labelColor={c.textSecondary} valueColor={c.text} />
          </View>

          {netsPhysical.map((n) => (
            <IfRow key={n.name} n={n} textColor={c.text} subColor={c.textSecondary} accentRx={c.green} accentTx={c.orange} track={c.backgroundSelected} />
          ))}

          {netsVirtual.length > 0 && (
            <>
              <Pressable style={styles.virtualToggle} onPress={() => setShowVirtual((v) => !v)}>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>虚拟网卡</Text>
                <Text style={{ color: c.textSecondary, fontSize: 13 }}>{netsVirtual.length}</Text>
                <Ionicons name={showVirtual ? 'chevron-up' : 'chevron-down'} size={16} color={c.textSecondary} />
              </Pressable>
              {showVirtual &&
                netsVirtual.map((n) => (
                  <IfRow key={n.name} n={n} textColor={c.text} subColor={c.textSecondary} accentRx={c.green} accentTx={c.orange} track={c.backgroundSelected} compact />
                ))}
            </>
          )}
        </Card>

        {/* ==================== 磁盘 ==================== */}
        {(snap?.disks ?? []).map((d) => (
          <DiskCard key={d.mount} d={d} textColor={c.text} subColor={c.textSecondary} barColor={percentColorOf(d.percent, c)} track={c.backgroundSelected} green={c.green} />
        ))}

        {/* ==================== Docker ==================== */}
        <Card
          title="Docker"
          right={
            dockerError ? (
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>未安装或无权限</Text>
            ) : (
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                {containers ? `${containers.filter((x) => x.state === 'running').length}/${containers.length} 运行中` : '…'}
              </Text>
            )
          }>
          {containers && containers.length > 0 ? (
            containers.map((ct) => (
              <Pressable
                key={ct.id}
                style={({ pressed }) => [styles.containerRow, { borderBottomColor: c.border }, pressed && { opacity: 0.6 }]}
                onPress={() => onDockerAction(ct)}>
                <View style={[styles.dot, { backgroundColor: ct.state === 'running' ? c.green : ct.state === 'paused' ? c.orange : c.textSecondary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.containerName, { color: c.text }]} numberOfLines={1}>{ct.name}</Text>
                  <Text style={[styles.containerImage, { color: c.textSecondary }]} numberOfLines={1}>{ct.image}</Text>
                  <Text style={[styles.containerStats, { color: c.textSecondary }]}>
                    {ct.state === 'running' && (ct.cpuPercent || ct.memUsage)
                      ? `${ct.cpuPercent ?? ''}${ct.memUsage ? ` · ${ct.memUsage}` : ''}`
                      : ct.status}
                  </Text>
                </View>
                {dockerBusy === ct.id ? (
                  <ActivityIndicator size="small" color={c.textSecondary} />
                ) : (
                  <Ionicons name="ellipsis-horizontal" size={18} color={c.textSecondary} />
                )}
              </Pressable>
            ))
          ) : (
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>{dockerError ? '该服务器没有可用的 Docker' : '没有容器'}</Text>
          )}
        </Card>
      </ScrollView>

      {/* 打开终端 */}
      <Pressable style={[styles.terminalFab, { backgroundColor: c.blue }]} onPress={() => router.push(`/terminal/${id}`)}>
        <Ionicons name="terminal" size={20} color="#fff" />
        <Text style={styles.terminalFabText}>终端</Text>
      </Pressable>
    </View>
  );
}

/** 单个网卡行 */
function IfRow({
  n,
  textColor,
  subColor,
  accentRx,
  accentTx,
  track,
  compact,
}: {
  n: NetIfStat;
  textColor: string;
  subColor: string;
  accentRx: string;
  accentTx: string;
  track: string;
  compact?: boolean;
}) {
  const share = n.rxBytes + n.txBytes > 0 ? (n.txBytes / (n.rxBytes + n.txBytes)) * 100 : 0;
  const rx = formatBytesCompact(n.rxPerSec ?? 0);
  const tx = formatBytesCompact(n.txPerSec ?? 0);
  const rxTotal = formatBytesCompact(n.rxBytes);
  const txTotal = formatBytesCompact(n.txBytes);
  return (
    <View style={[styles.ifRow, compact && { opacity: 0.75 }]}>
      <View style={styles.ifHead}>
        <Ionicons name="wifi" size={15} color={accentRx} />
        <Text style={[styles.ifName, { color: textColor }]}>{n.name}</Text>
        {n.ip ? <Text style={[styles.ifIp, { color: subColor }]}>{n.ip}</Text> : null}
      </View>
      <View style={styles.ifStats}>
        <View style={styles.ifCell}>
          <Text style={[styles.ifLabel, { color: subColor }]}>↑/S</Text>
          <Text style={[styles.ifValue, { color: textColor }]}>
            {tx.value}
            <Text style={[styles.ifUnit, { color: subColor }]}> {tx.unit}/s</Text>
          </Text>
        </View>
        <View style={styles.ifCell}>
          <Text style={[styles.ifLabel, { color: subColor }]}>↓/S</Text>
          <Text style={[styles.ifValue, { color: textColor }]}>
            {rx.value}
            <Text style={[styles.ifUnit, { color: subColor }]}> {rx.unit}/s</Text>
          </Text>
        </View>
        <View style={styles.ifCell}>
          <Text style={[styles.ifLabel, { color: subColor }]}>↑</Text>
          <Text style={[styles.ifValue, { color: textColor }]}>
            {txTotal.value}
            <Text style={[styles.ifUnit, { color: accentTx }]}> {txTotal.unit}</Text>
          </Text>
        </View>
        <View style={styles.ifCell}>
          <Text style={[styles.ifLabel, { color: subColor }]}>↓</Text>
          <Text style={[styles.ifValue, { color: textColor }]}>
            {rxTotal.value}
            <Text style={[styles.ifUnit, { color: accentRx }]}> {rxTotal.unit}</Text>
          </Text>
        </View>
        <Donut percent={share} color={accentRx} trackColor={track} label="" labelColor={textColor} size={40} strokeWidth={6} />
      </View>
    </View>
  );
}

/** 单个挂载点卡片 */
function DiskCard({
  d,
  textColor,
  subColor,
  barColor,
  track,
  green,
}: {
  d: DiskMountStat;
  textColor: string;
  subColor: string;
  barColor: string;
  track: string;
  green: string;
}) {
  const used = formatKbCompact(d.usedKb);
  const total = formatKbCompact(d.totalKb);
  const rows = [
    { label: '读', bps: d.readBps, bytes: d.totalReadBytes, iops: d.readIops, lat: d.readLatencyMs },
    { label: '写', bps: d.writeBps, bytes: d.totalWriteBytes, iops: d.writeIops, lat: d.writeLatencyMs },
  ];
  return (
    <Card>
      <View style={styles.diskHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.diskMount, { color: textColor }]}>{d.mount}</Text>
          <Text style={[styles.diskFs, { color: subColor }]}>{d.fs}</Text>
        </View>
        <Text style={[styles.diskType, { color: subColor }]}>{d.type.toUpperCase()}</Text>
        <Text style={[styles.diskUsage, { color: textColor }]}>
          {used.value}
          {used.unit}
          <Text style={{ color: subColor, fontSize: 13 }}>
            /{total.value}
            {total.unit}
          </Text>
        </Text>
      </View>
      <UsageBar percent={d.percent} color={barColor} trackColor={track} labelColor={subColor} valueColor={textColor} height={8} />
      <View style={styles.diskTableHead}>
        <Text style={[styles.diskTh, { color: subColor, width: 24 }]} />
        <Text style={[styles.diskTh, { color: subColor }]}>速率</Text>
        <Text style={[styles.diskTh, { color: subColor }]}>字节</Text>
        <Text style={[styles.diskTh, { color: subColor }]}>IOPS</Text>
        <Text style={[styles.diskTh, { color: subColor, textAlign: 'right' }]}>延迟</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.diskRow}>
          <Text style={[styles.diskTh, { color: green, width: 24 }]}>{r.label}</Text>
          <Text style={[styles.diskTd, { color: textColor }]}>{r.bps == null ? '—' : formatRate(r.bps)}</Text>
          <Text style={[styles.diskTd, { color: textColor }]}>{formatBytes(r.bytes, 0)}</Text>
          <Text style={[styles.diskTd, { color: textColor }]}>{r.iops == null ? '—' : r.iops.toFixed(0)}</Text>
          <Text style={[styles.diskTd, { color: textColor, textAlign: 'right' }]}>{r.lat == null ? '—' : r.lat.toFixed(1)}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  osText: { marginHorizontal: Spacing.three + 4, marginBottom: Spacing.three, fontSize: 14 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Radius.small,
  },
  bannerText: { fontSize: 12, flex: 1 },
  cpuTop: { flexDirection: 'row', alignItems: 'center' },
  cpuBigWrap: { flexDirection: 'row', alignItems: 'flex-end', marginRight: Spacing.four },
  cpuBig: { fontSize: 52, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 56 },
  cpuPct: { fontSize: 18, marginBottom: 8, marginLeft: 2 },
  legendGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  memRow: { flexDirection: 'row', alignItems: 'center' },
  memStats: { flex: 1, flexDirection: 'row', gap: Spacing.four },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  swapLabel: { fontSize: 13, width: 60 },
  netTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  virtualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    marginTop: Spacing.two,
  },
  ifRow: { paddingTop: Spacing.three, marginTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.25)' },
  ifHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ifName: { fontSize: 15, fontWeight: '600' },
  ifIp: { fontSize: 12, marginLeft: 'auto' },
  ifStats: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two, gap: Spacing.three },
  ifCell: { flex: 1 },
  ifLabel: { fontSize: 11, marginBottom: 2 },
  ifValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ifUnit: { fontSize: 11, fontWeight: '400' },
  diskHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  diskMount: { fontSize: 17, fontWeight: '700' },
  diskFs: { fontSize: 12, marginTop: 2 },
  diskType: { fontSize: 12, marginRight: Spacing.three },
  diskUsage: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  diskTableHead: { flexDirection: 'row', marginTop: Spacing.three, marginBottom: 4, gap: Spacing.two },
  diskTh: { flex: 1, fontSize: 12 },
  diskRow: { flexDirection: 'row', paddingVertical: 5, gap: Spacing.two },
  diskTd: { flex: 1, fontSize: 14, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  containerName: { fontSize: 15, fontWeight: '600' },
  containerImage: { fontSize: 12, marginTop: 1 },
  containerStats: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  terminalFab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  terminalFabText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
