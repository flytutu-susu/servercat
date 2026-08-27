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

import { AreaChart } from '@/components/AreaChart';
import { Accent, Colors, Radius, Spacing } from '@/constants/theme';
import { useConnections, type ConnStatus } from '@/services/connection';
import { pollOnce, type PrevSample } from '@/services/monitor';
import { isMockMode } from '@/ssh';
import { getSSH } from '@/ssh';
import { useServers, type ServerRecord } from '@/store/servers';

interface ServerSummary {
  cpuPercent: number | null;
  memPercent: number | null;
  history: number[];
}

const statusColor: Record<ConnStatus, string> = {
  online: Accent.green,
  connecting: Accent.orange,
  error: Accent.red,
  offline: Colors.dark.textSecondary,
};

const statusText: Record<ConnStatus, string> = {
  online: '在线',
  connecting: '连接中',
  error: '连接失败',
  offline: '离线',
};

function ServerRow({ server, summary }: { server: ServerRecord; summary?: ServerSummary }) {
  const router = useRouter();
  const status = useConnections((s) => s.entries[server.id]?.status ?? 'offline');
  const error = useConnections((s) => s.entries[server.id]?.error);
  const removeServer = useServers((s) => s.removeServer);

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

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.dark.backgroundSelected }]}
      onPress={() => router.push(`/server/${server.id}`)}
      onLongPress={onLongPress}>
      <View style={styles.rowTop}>
        <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
        <Text style={styles.name} numberOfLines={1}>
          {server.name}
        </Text>
        <Text style={styles.statusText}>{statusText[status]}</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.dark.textSecondary} />
      </View>
      <Text style={styles.host} numberOfLines={1}>
        {server.username}@{server.host}:{server.port}
      </Text>
      {status === 'error' && error ? (
        <Text style={styles.errorText} numberOfLines={1}>
          {error}
        </Text>
      ) : null}
      {status === 'online' && summary ? (
        <View style={styles.statsRow}>
          <View style={styles.chartWrap}>
            <AreaChart
              data={summary.history.length >= 2 ? summary.history : [0, 0]}
              color={Accent.green}
              width={140}
              height={28}
              max={100}
            />
          </View>
          <View style={styles.statsTextWrap}>
            <Text style={styles.statText}>
              CPU {summary.cpuPercent == null ? '—' : `${summary.cpuPercent.toFixed(0)}%`}
            </Text>
            <Text style={styles.statText}>
              内存 {summary.memPercent == null ? '—' : `${summary.memPercent.toFixed(0)}%`}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ServersScreen() {
  const router = useRouter();
  const servers = useServers((s) => s.servers);
  const hydrated = useServers((s) => s.hydrated);
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
            setSummaries((prev) => {
              const old = prev[server.id];
              const history = [...(old?.history ?? []), snap.cpuPercent ?? 0].slice(-30);
              return {
                ...prev,
                [server.id]: {
                  cpuPercent: snap.cpuPercent,
                  memPercent: snap.memTotalKb > 0 ? (snap.memUsedKb / snap.memTotalKb) * 100 : null,
                  history,
                },
              };
            });
          } catch {
            // ensureConnected 内部已记录状态
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
    await pollAll();
    setRefreshing(false);
  }, [pollAll]);

  return (
    <View style={styles.container}>
      {isMockMode() && (
        <View style={styles.mockBanner}>
          <Ionicons name="flask-outline" size={14} color={Accent.orange} />
          <Text style={styles.mockText}>演示模式：正在使用模拟数据（Expo Go 无原生 SSH）</Text>
        </View>
      )}
      <FlatList
        data={servers}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <ServerRow server={item} summary={summaries[item.id]} />}
        contentContainerStyle={servers.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.textSecondary} />
        }
        ListEmptyComponent={
          hydrated ? (
            <View style={styles.empty}>
              <Ionicons name="server-outline" size={56} color={Colors.dark.textSecondary} />
              <Text style={styles.emptyTitle}>还没有服务器</Text>
              <Text style={styles.emptyHint}>点击右下角 + 添加你的第一台服务器</Text>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 80 }} color={Colors.dark.textSecondary} />
          )
        }
      />
      <Pressable style={styles.fab} onPress={() => router.push('/server/edit')}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  listContent: { paddingVertical: Spacing.three },
  row: {
    backgroundColor: Colors.dark.backgroundElement,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
    padding: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two + 4,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { color: Colors.dark.text, fontSize: 17, fontWeight: '600', flexShrink: 1 },
  statusText: { color: Colors.dark.textSecondary, fontSize: 12, marginLeft: 'auto' },
  host: { color: Colors.dark.textSecondary, fontSize: 13, marginTop: 4, fontFamily: 'Menlo' },
  errorText: { color: Accent.red, fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two },
  chartWrap: { flex: 1 },
  statsTextWrap: { flexDirection: 'row', gap: Spacing.three },
  statText: { color: Colors.dark.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Accent.blue,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.two },
  emptyTitle: { color: Colors.dark.text, fontSize: 20, fontWeight: '600', marginTop: Spacing.two },
  emptyHint: { color: Colors.dark.textSecondary, fontSize: 14 },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2A2108',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  mockText: { color: Accent.orange, fontSize: 12 },
});
