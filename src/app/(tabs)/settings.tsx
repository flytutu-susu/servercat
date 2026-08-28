import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Radius, Spacing, useColors, type Palette } from '@/constants/theme';
import { useConnections } from '@/services/connection';
import { isMockMode } from '@/ssh';
import { useKeys } from '@/store/keys';
import { useServers } from '@/store/servers';
import { useSettings } from '@/store/settings';

function Row({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  destructive,
  c,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
  c: Palette;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: c.backgroundSelected }]}
      onPress={onPress}
      disabled={!onPress}>
      <Ionicons name={icon} size={20} color={destructive ? c.red : iconColor ?? c.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: destructive ? c.red : c.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: c.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={c.textSecondary} /> : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const c = useColors();
  const router = useRouter();
  const servers = useServers((s) => s.servers);
  const keys = useKeys((s) => s.keys);
  const demoMode = useSettings((s) => s.demoMode);
  const setDemoMode = useSettings((s) => s.setDemoMode);

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

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.ios?.buildNumber ?? '1';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: Spacing.three }}>
      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>通用</Text>
      <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.row}>
          <Ionicons name="flask-outline" size={20} color={c.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: c.text }]}>演示模式</Text>
            <Text style={[styles.rowSubtitle, { color: c.textSecondary }]}>使用内置模拟数据体验界面（无需真实服务器）</Text>
          </View>
          <Switch
            value={demoMode}
            onValueChange={(v) => {
              useConnections.getState().disconnectAll();
              setDemoMode(v);
            }}
            trackColor={{ false: c.backgroundSelected, true: c.green }}
          />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>密钥</Text>
      <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
        <Row
          icon="key-outline"
          iconColor={c.orange}
          title="密钥管理"
          subtitle={keys.length > 0 ? `${keys.length} 个密钥 · 可生成 ED25519 / RSA 2048` : '生成 ED25519 / RSA 2048 密钥对'}
          onPress={() => router.push('/keys')}
          c={c}
        />
      </View>

      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>连接</Text>
      <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
        <Row icon="flash-outline" title="断开所有连接" subtitle={`当前管理 ${servers.length} 台服务器`} onPress={disconnectAll} c={c} />
      </View>

      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>数据</Text>
      <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
        <Row icon="trash-outline" title="清除全部服务器数据" subtitle="删除所有服务器与钥匙串中的凭据" onPress={clearAll} destructive c={c} />
      </View>

      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>关于</Text>
      <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
        <Row
          icon="information-circle-outline"
          title="版本"
          subtitle={`${version} (${build})${isMockMode() ? ' · 演示模式' : ''}`}
          c={c}
        />
        <Row icon="shield-checkmark-outline" title="隐私" subtitle="凭据与私钥仅存储于本机钥匙串" c={c} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.two,
    marginTop: Spacing.three,
    marginLeft: Spacing.one,
  },
  group: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
});
