import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accent, Colors, Radius, Spacing } from '@/constants/theme';
import { useConnections } from '@/services/connection';
import { isMockMode } from '@/ssh';
import { useServers } from '@/store/servers';

function Row({
  icon,
  title,
  subtitle,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: Colors.dark.backgroundSelected }]}
      onPress={onPress}
      disabled={!onPress}>
      <Ionicons name={icon} size={20} color={destructive ? Accent.red : Colors.dark.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, destructive && { color: Accent.red }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={Colors.dark.textSecondary} /> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const servers = useServers((s) => s.servers);

  const disconnectAll = () => {
    useConnections.getState().disconnectAll();
    Alert.alert('已断开', '所有 SSH 连接已关闭');
  };

  const clearAll = () => {
    Alert.alert('清除全部数据', '将删除所有服务器及其凭据，且无法恢复。确定吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '全部删除',
        style: 'destructive',
        onPress: async () => {
          const all = useServers.getState().servers;
          for (const s of all) await useServers.getState().removeServer(s.id);
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.dark.background }} contentContainerStyle={{ padding: Spacing.three }}>
      <Text style={styles.sectionTitle}>连接</Text>
      <View style={styles.group}>
        <Row icon="flash-outline" title="断开所有连接" subtitle={`当前管理 ${servers.length} 台服务器`} onPress={disconnectAll} />
      </View>

      <Text style={styles.sectionTitle}>数据</Text>
      <View style={styles.group}>
        <Row icon="trash-outline" title="清除全部数据" subtitle="删除所有服务器与钥匙串中的凭据" onPress={clearAll} destructive />
      </View>

      <Text style={styles.sectionTitle}>关于</Text>
      <View style={styles.group}>
        <Row
          icon="information-circle-outline"
          title="版本"
          subtitle={`${Constants.expoConfig?.version ?? '1.0.0'}${isMockMode() ? ' · 演示模式' : ''}`}
        />
        <Row icon="lock-closed-outline" title="隐私" subtitle="所有凭据仅存储于本机钥匙串" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.two,
    marginTop: Spacing.three,
    marginLeft: Spacing.one,
  },
  group: {
    backgroundColor: Colors.dark.backgroundElement,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  rowTitle: { color: Colors.dark.text, fontSize: 16 },
  rowSubtitle: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
});
