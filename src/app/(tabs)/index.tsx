import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Donut } from '@/components/Donut';
import { Radius, Spacing, useColors } from '@/constants/theme';
import { useConnections, type ConnStatus } from '@/services/connection';
import { pollOnce, type PrevSample } from '@/services/monitor';
import { getSSH, isMockMode } from '@/ssh';
import { useServers, type ServerRecord } from '@/store/servers';
import { useSettings } from '@/store/settings';
import { formatBytesCompact } from '@/utils/format';

interface ServerSummary {
  cpuPercent: number | null;
  memPercent: number | null;
  swapPercent: number | null;
  load1: number | null;
  rxBytes: number;
  txBytes: number;
}

function ServerRow({ server, summary }: { server: ServerRecord; summary?: ServerSummary }) {
  const c = useColors();
  const router = useRouter();
  const status = useConnections((s) => s.entries[server.id]?.status ?? 'offline');
  const error = useConnections((s) => s.entries[server.id]?.error);
  const removeServer = useServers((s) => s.removeServer);

  const statusColor: Record<ConnStatus, string> = {
    online: c.green,
    connecting: c.orange,
    error: c.red,
    offline: c.textSecondary,
  };
  const statusText: Record<ConnStatus, string> = {
    online: '在线',
    connecting: '连接中',
    error: '连接失败',
    offline: '离线',
  };

  const onLongPress = () => {
    Alert.alert(server.name, `${server.username}@${server.host}:${server.port}`, [
      { text: '编辑', onPress: () => router.push({ pathname: '/server/edit', params: { id: server.id } }) },
      {
        text: '删除',
        style: 'destructive',
        onPress: () =>
          Alert.alert('删除服务器', `确定删除「${server.name}」吗？`, [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: () => removeServer(server.id) },
          ]),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const rx = summary ? formatBytesCompact(summary.rxBytes) : null;
  const tx = summary ? formatBytesCompact(summary.txBytes) : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.card, borderColor: c.border },
        pressed && { backgroundColor: c.backgroundSelected },
      ]}
      onPress={() => router.push(`/server/${server.id}`)}
      onLongPress={onLongPress}>
      <View style={styles.rowTop}>
        <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
          {server.name}
        </Text>
        <Text style={[styles.statusText, { color: c.textSecondary }]}>{statusText[status]}</Text>
        <Pressable hitSlop={10} onPress={() => router.push(`/terminal/${server.id}`)}>
          <Ionicons name="terminal-outline" size={18} color={c.blue} />
        </Pressable>
      </View>
      <Text style={[styles.host, { color: c.textSecondary }]} numberOfLines={1}>
        {server.username}@{server.host}:{server.port}
      </Text>
      {status === 'error' && error ? (
        <Text style={[styles.errorText, { color: c.red }]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
      {status === 'online' && summary ? (
        <View style={styles.statsRow}>
          <View style={styles.gauges}>
            <View style={styles.gaugeItem}>
              <Donut percent={summary.cpuPercent ?? 0} color={c.green} trackColor={c.backgroundSelected} labelColor={c.text} size={52} strokeWidth={7} />
              <Text style={[styles.gaugeLabel, { color: c.textSecondary }]}>CPU</Text>
            </View>
            <View style={styles.gaugeItem}>
              <Donut percent={summary.memPercent ?? 0} color={c.blue} trackColor={c.backgroundSelected} labelColor={c.text} size={52} strokeWidth={7} />
              <Text style={[styles.gaugeLabel, { color: c.textSecondary }]}>内存</Text>
            </View>
            <View style={styles.gaugeItem}>
              <Donut percent={summary.swapPercent ?? 0} color={c.purple} trackColor={c.backgroundSelected} labelColor={c.text} size={52} strokeWidth={7} />
              <Text style={[styles.gaugeLabel, { color: c.textSecondary }]}>交换分区</Text>
            </View>
          </View>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Ionicons name="arrow-up" size={12} color={c.orange} />
              <Text style={[styles.totalValue, { color: c.text }]}>
                {tx?.value}
                <Text style={[styles.totalUnit, { color: c.textSecondary }]}> {tx?.unit}</Text>
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Ionicons name="arrow-down" size={12} color={c.green} />
              <Text style={[styles.totalValue, { color: c.text }]}>
                {rx?.value}
                <Text style={[styles.totalUnit, { color: c.textSecondary }]}> {rx?.unit}</Text>
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Ionicons name="speedometer-outline" size={12} color={c.textSecondary} />
              <Text style={[styles.totalValue, { color: c.text }]}>
                {summary.load1 == null ? '—' : summary.load1.toFixed(2)}
                <Text style={[styles.totalUnit, { color: c.textSecondary }]}> 负载</Text>
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ServersScreen() {
  const router = useRouter();
  const c = useColors();
  const servers = useServers((s) => s.servers);
  const hydrated = useServers((s) => s.hydrated);
  useSettings((s) => s.demoMode); // 订阅以便横幅即时刷新
  const [summaries, setSummaries] = useState<Record<string, ServerSummary>>({});
  const [refreshing, setRefreshing] = useState(false);
  const prevRef = useRef<Map<string, PrevSample>>(new Map());
  const busyRef = useRef(false);

  const pollAll = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const list = useServers.getState().servers;
      await Promise.all(
        list.map(async (server) => {
          try {
            const sessionId = await useConnections.getState().ensureConnected(server.id);
            const { snap, sample } = await pollOnce(getSSH(), sessionId, prevRef.current.get(server.id) ?? null);
            prevRef.current.set(server.id, sample);
            setSummaries((prev) => ({
              ...prev,
              [server.id]: {
                cpuPercent: snap.cpu.percent,
                memPercent: snap.mem.percent,
                swapPercent: snap.mem.swapTotalKb > 0 ? snap.mem.swapPercent : null,
                load1: snap.load1,
                rxBytes: snap.nets.filter((n) => !n.virtual).reduce((a, n) => a + n.rxBytes, 0),
                txBytes: snap.nets.filter((n) => !n.virtual).reduce((a, n) => a + n.txBytes, 0),
              },
            }));
          } catch {
            useConnections.getState().invalidate(server.id);
          }
        })
      );
    } finally {
      busyRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      pollAll();
      const timer = setInterval(pollAll, 5000);
      return () => clearInterval(timer);
    }, [pollAll, servers.length])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    for (const s of useServers.getState().servers) {
      useConnections.getState().invalidate(s.id);
    }
    await pollAll();
    setRefreshing(false);
  }, [pollAll]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {isMockMode() && (
        <View style={[styles.mockBanner, { backgroundColor: c.orange + '22' }]}>
          <Ionicons name="flask-outline" size={14} color={c.orange} />
          <Text style={[styles.mockText, { color: c.orange }]}>演示模式：正在使用模拟数据（非真实服务器）</Text>
        </View>
      )}
      <FlatList
        data={servers}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <ServerRow server={item} summary={summaries[item.id]} />}
        contentContainerStyle={servers.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textSecondary} />}
        ListEmptyComponent={
          hydrated ? (
            <View style={styles.empty}>
              <Ionicons name="server-outline" size={56} color={c.textSecondary} />
              <Text style={[styles.emptyTitle, { color: c.text }]}>还没有服务器</Text>
              <Text style={[styles.emptyHint, { color: c.textSecondary }]}>点击右下角 + 添加你的第一台服务器</Text>
              <Text style={[styles.emptyHint2, { color: c.textSecondary }]}>（也可在 设置 → 演示模式 中先用模拟数据体验）</Text>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 80 }} color={c.textSecondary} />
          )
        }
      />
      <Pressable style={[styles.fab, { backgroundColor: c.blue }]} onPress={() => router.push('/server/edit')}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: Spacing.three },
  row: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two + 4,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  statusText: { fontSize: 12, marginLeft: 'auto' },
  host: { fontSize: 13, marginTop: 4, fontFamily: 'Menlo' },
  errorText: { fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.three },
  gauges: { flexDirection: 'row', gap: Spacing.three },
  gaugeItem: { alignItems: 'center', gap: 4 },
  gaugeLabel: { fontSize: 11 },
  totals: { flex: 1, alignItems: 'flex-end', gap: 6 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalValue: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalUnit: { fontSize: 11, fontWeight: '400' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.two },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: Spacing.two },
  emptyHint: { fontSize: 14 },
  emptyHint2: { fontSize: 12, opacity: 0.7 },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  mockText: { fontSize: 12 },
});
