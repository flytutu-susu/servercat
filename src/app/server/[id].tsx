import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
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
  useWindowDimensions,
  View,
} from 'react-native';

import { AreaChart } from '@/components/AreaChart';
import { Card } from '@/components/Card';
import { UsageBar } from '@/components/UsageBar';
import { Accent, Colors, Radius, Spacing } from '@/constants/theme';
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
  type MetricsSnapshot,
  type PrevSample,
  type ServerInfo,
} from '@/services/monitor';
import { getSSH } from '@/ssh';
import { useServers } from '@/store/servers';
import { formatKb, formatRate, formatUptime, percentColor } from '@/utils/format';

const HISTORY_LEN = 60; // 2s 一次，保留 2 分钟

export default function ServerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const server = useServers((s) => s.servers.find((x) => x.id === id));
  const status = useConnections((s) => s.entries[id ?? '']?.status ?? 'offline');
  const connError = useConnections((s) => s.entries[id ?? '']?.error);

  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [snap, setSnap] = useState<MetricsSnapshot | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [rxHistory, setRxHistory] = useState<number[]>([]);
  const [txHistory, setTxHistory] = useState<number[]>([]);
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [dockerError, setDockerError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dockerBusy, setDockerBusy] = useState<string | null>(null);

  const prevRef = useRef<PrevSample | null>(null);
  const netMaxRef = useRef(1024);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dockerTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const chartWidth = Math.max(0, width - Spacing.three * 4);

  const doPoll = useCallback(async () => {
    if (!id) return;
    try {
      const sessionId = await useConnections.getState().ensureConnected(id);
      const { snap: s, sample } = await pollOnce(getSSH(), sessionId, prevRef.current);
      prevRef.current = sample;
      setSnap(s);
      setCpuHistory((h) => [...h, s.cpuPercent ?? 0].slice(-HISTORY_LEN));
      const rx = s.netRxPerSec ?? 0;
      const tx = s.netTxPerSec ?? 0;
      netMaxRef.current = Math.max(netMaxRef.current * 0.95, rx, tx, 1024);
      setRxHistory((h) => [...h, rx].slice(-HISTORY_LEN));
      setTxHistory((h) => [...h, tx].slice(-HISTORY_LEN));
    } catch {
      // 使会话失效，下次轮询自动重连；状态已在 store 中反映
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
          // 连接失败，轮询会重试
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
    (c: ContainerInfo) => {
      const running = c.state === 'running';
      const paused = c.state === 'paused';
      const actions: { label: string; action: ContainerAction; destructive?: boolean }[] = running
        ? [
            { label: '重启', action: 'restart' },
            { label: '停止', action: 'stop', destructive: true },
            { label: '暂停', action: 'pause' },
          ]
        : paused
          ? [{ label: '恢复', action: 'unpause' }]
          : [{ label: '启动', action: 'start' }];
      const withLogs = [
        ...actions,
        {
          label: '查看日志',
          action: null as unknown as ContainerAction,
        },
      ];
      const labels = [...withLogs.map((a) => a.label), '取消'];

      const handle = (idx: number) => {
        if (idx >= withLogs.length) return;
        const choice = withLogs[idx];
        if (choice.label === '查看日志') {
          router.push({ pathname: '/logs', params: { serverId: id, containerId: c.id, name: c.name } });
          return;
        }
        void (async () => {
          setDockerBusy(c.id);
          try {
            const sessionId = await useConnections.getState().ensureConnected(id!);
            const res = await containerAction(getSSH(), sessionId, choice.action, c.id);
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
            title: `${c.name} (${c.image})`,
            options: labels,
            cancelButtonIndex: labels.length - 1,
            destructiveButtonIndex: withLogs.findIndex((a) => a.destructive),
          },
          handle
        );
      } else {
        Alert.alert(`${c.name}`, c.image, [
          ...withLogs.map((a, i) => ({
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
      <View style={styles.center}>
        <Text style={styles.errText}>服务器不存在</Text>
      </View>
    );
  }

  const memPct = snap && snap.memTotalKb > 0 ? (snap.memUsedKb / snap.memTotalKb) * 100 : 0;
  const swapPct = snap && snap.swapTotalKb > 0 ? (snap.swapUsedKb / snap.swapTotalKb) * 100 : 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: server.name }} />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              useConnections.getState().invalidate(id!); // 手动刷新跳过失败退避，立即重连
              await doPoll();
              await doDocker();
              setRefreshing(false);
            }}
            tintColor={Colors.dark.textSecondary}
          />
        }
        contentContainerStyle={{ paddingVertical: Spacing.three, paddingBottom: 100 }}>
        {/* 状态横幅 */}
        {status !== 'online' && (
          <View style={[styles.banner, status === 'error' ? styles.bannerError : styles.bannerWarn]}>
            {status === 'connecting' ? (
              <ActivityIndicator size="small" color={Accent.orange} />
            ) : (
              <Ionicons name="warning-outline" size={14} color={status === 'error' ? Accent.red : Accent.orange} />
            )}
            <Text style={[styles.bannerText, { color: status === 'error' ? Accent.red : Accent.orange }]}>
              {status === 'connecting' ? '正在连接…' : status === 'error' ? `连接失败：${connError ?? ''}` : '未连接'}
            </Text>
          </View>
        )}

        {/* 系统信息 */}
        <Card>
          <View style={styles.infoRow}>
            <Ionicons name="desktop-outline" size={16} color={Colors.dark.textSecondary} />
            <Text style={styles.infoText}>{info?.osName ?? '…'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="hardware-chip-outline" size={16} color={Colors.dark.textSecondary} />
            <Text style={styles.infoText} numberOfLines={1}>
              {info ? `${info.cpuModel} · ${info.cores} 核` : '…'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={Colors.dark.textSecondary} />
            <Text style={styles.infoText}>
              {snap ? `运行 ${formatUptime(snap.uptimeSec)} · 负载 ${snap.load1.toFixed(2)} ${snap.load5.toFixed(2)} ${snap.load15.toFixed(2)}` : '…'}
            </Text>
          </View>
        </Card>

        {/* CPU */}
        <Card
          title="CPU"
          right={
            <Text style={[styles.bigStat, { color: percentColor(snap?.cpuPercent ?? 0) }]}>
              {snap?.cpuPercent == null ? '—' : `${snap.cpuPercent.toFixed(1)}%`}
            </Text>
          }>
          <AreaChart data={cpuHistory.length >= 2 ? cpuHistory : [0, 0]} color={Accent.green} width={chartWidth} height={80} max={100} />
          <Text style={styles.subText}>{snap?.cpuCount ?? info?.cores ?? '—'} 核</Text>
        </Card>

        {/* 内存 */}
        <Card
          title="内存"
          right={
            <Text style={styles.bigStat}>
              {snap ? `${formatKb(snap.memUsedKb)} / ${formatKb(snap.memTotalKb)}` : '—'}
            </Text>
          }>
          <UsageBar percent={memPct} color={percentColor(memPct)} label="内存" valueLabel={`${memPct.toFixed(1)}%`} />
          {snap && snap.swapTotalKb > 0 && (
            <View style={{ marginTop: Spacing.two }}>
              <UsageBar percent={swapPct} color={Accent.purple} label="Swap" valueLabel={`${formatKb(snap.swapUsedKb)} / ${formatKb(snap.swapTotalKb)}`} />
            </View>
          )}
        </Card>

        {/* 磁盘 */}
        <Card
          title="磁盘 /"
          right={
            <Text style={styles.bigStat}>
              {snap ? `${formatKb(snap.diskUsedKb)} / ${formatKb(snap.diskTotalKb)}` : '—'}
            </Text>
          }>
          <UsageBar percent={snap?.diskPercent ?? 0} color={percentColor(snap?.diskPercent ?? 0)} label="已用" valueLabel={`${snap?.diskPercent ?? 0}%`} />
        </Card>

        {/* 网络 */}
        <Card title="网络">
          <View style={styles.netRow}>
            <View style={styles.netItem}>
              <Ionicons name="arrow-down" size={14} color={Accent.purple} />
              <Text style={styles.netText}>{snap?.netRxPerSec == null ? '—' : formatRate(snap.netRxPerSec)}</Text>
            </View>
            <View style={styles.netItem}>
              <Ionicons name="arrow-up" size={14} color={Accent.orange} />
              <Text style={styles.netText}>{snap?.netTxPerSec == null ? '—' : formatRate(snap.netTxPerSec)}</Text>
            </View>
          </View>
          <AreaChart data={rxHistory.length >= 2 ? rxHistory : [0, 0]} color={Accent.purple} width={chartWidth} height={56} max={netMaxRef.current} />
          <View style={{ height: Spacing.two }} />
          <AreaChart data={txHistory.length >= 2 ? txHistory : [0, 0]} color={Accent.orange} width={chartWidth} height={56} max={netMaxRef.current} />
        </Card>

        {/* Docker */}
        <Card
          title="Docker"
          right={
            dockerError ? (
              <Text style={styles.subText}>未安装或无权限</Text>
            ) : (
              <Text style={styles.subText}>{containers ? `${containers.filter((c) => c.state === 'running').length}/${containers.length} 运行中` : '…'}</Text>
            )
          }>
          {containers && containers.length > 0 ? (
            containers.map((c) => (
              <Pressable key={c.id} style={({ pressed }) => [styles.containerRow, pressed && { opacity: 0.6 }]} onPress={() => onDockerAction(c)}>
                <View style={[styles.dot, { backgroundColor: c.state === 'running' ? Accent.green : c.state === 'paused' ? Accent.orange : Colors.dark.textSecondary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.containerName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.containerImage} numberOfLines={1}>{c.image}</Text>
                  {c.state === 'running' && (c.cpuPercent || c.memUsage) ? (
                    <Text style={styles.containerStats}>
                      {c.cpuPercent ?? ''} {c.memUsage ? `· ${c.memUsage}` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.containerStats}>{c.status}</Text>
                  )}
                </View>
                {dockerBusy === c.id ? (
                  <ActivityIndicator size="small" color={Colors.dark.textSecondary} />
                ) : (
                  <Ionicons name="ellipsis-horizontal" size={18} color={Colors.dark.textSecondary} />
                )}
              </Pressable>
            ))
          ) : (
            <Text style={styles.subText}>{dockerError ? '该服务器没有可用的 Docker' : '没有容器'}</Text>
          )}
        </Card>
      </ScrollView>

      {/* 打开终端 */}
      <Pressable style={styles.terminalFab} onPress={() => router.push(`/terminal/${id}`)}>
        <Ionicons name="terminal" size={20} color="#fff" />
        <Text style={styles.terminalFabText}>终端</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.dark.background },
  errText: { color: Colors.dark.textSecondary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Radius.small,
  },
  bannerWarn: { backgroundColor: '#2A2108' },
  bannerError: { backgroundColor: '#2B1512' },
  bannerText: { fontSize: 12, flex: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  infoText: { color: Colors.dark.text, fontSize: 14, flex: 1 },
  bigStat: { color: Colors.dark.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  subText: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: Spacing.two },
  netRow: { flexDirection: 'row', gap: Spacing.four, marginBottom: Spacing.two },
  netItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  netText: { color: Colors.dark.text, fontSize: 15, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  containerName: { color: Colors.dark.text, fontSize: 15, fontWeight: '600' },
  containerImage: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 1 },
  containerStats: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  terminalFab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Accent.blue,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  terminalFabText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
