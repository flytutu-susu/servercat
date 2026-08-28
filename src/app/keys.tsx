import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Radius, Spacing, useColors } from '@/constants/theme';
import { isMockMode } from '@/ssh';
import { useKeys, type KeyMeta } from '@/store/keys';

function typeLabel(k: KeyMeta): string {
  return k.type === 'rsa' ? `RSA ${k.bits}` : 'ED25519';
}

export default function KeysScreen() {
  const c = useColors();
  const router = useRouter();
  const keys = useKeys((s) => s.keys);
  const removeKey = useKeys((s) => s.remove);

  const onPressKey = (k: KeyMeta) => {
    const copy = async () => {
      await Clipboard.setStringAsync(k.publicKey);
      Alert.alert('已复制', '公钥已复制到剪贴板，粘贴到服务器的 ~/.ssh/authorized_keys 即可');
    };
    const share = () => Share.share({ message: k.publicKey });
    const del = () =>
      Alert.alert('删除密钥', `确定删除「${k.name}」吗？私钥将从钥匙串移除，无法恢复。`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => removeKey(k.id) },
      ]);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: k.name, message: k.fingerprint, options: ['复制公钥', '分享公钥', '删除', '取消'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) void copy();
          else if (idx === 1) void share();
          else if (idx === 2) del();
        }
      );
    } else {
      Alert.alert(k.name, k.fingerprint, [
        { text: '复制公钥', onPress: () => void copy() },
        { text: '分享公钥', onPress: () => void share() },
        { text: '删除', style: 'destructive', onPress: del },
        { text: '取消', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          title: '密钥管理',
          headerRight: () => (
            <Pressable onPress={() => router.push('/keys/new')} hitSlop={12}>
              <Ionicons name="add" size={26} color={c.blue} />
            </Pressable>
          ),
        }}
      />
      {isMockMode() && (
        <Text style={[styles.mockHint, { color: c.orange }]}>演示模式下生成的是假密钥，仅供界面预览</Text>
      )}
      <FlatList
        data={keys}
        keyExtractor={(k) => k.id}
        contentContainerStyle={{ padding: Spacing.three }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="key-outline" size={52} color={c.textSecondary} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>还没有密钥</Text>
            <Text style={[styles.emptyHint, { color: c.textSecondary }]}>
              点右上角 + 在设备上生成 ED25519 / RSA 密钥对{'\n'}私钥只存本机钥匙串，公钥可添加到服务器
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: c.card, borderColor: c.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => onPressKey(item)}>
            <View style={[styles.iconWrap, { backgroundColor: c.backgroundSelected }]}>
              <Ionicons name="key" size={18} color={c.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
              <Text style={[styles.sub, { color: c.textSecondary }]} numberOfLines={1}>
                {typeLabel(item)} · {item.fingerprint.replace('SHA256:', 'SHA256:').slice(0, 20)}…
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textSecondary} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mockHint: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, fontSize: 12 },
  empty: { alignItems: 'center', marginTop: 100, gap: Spacing.two, paddingHorizontal: Spacing.four },
  emptyTitle: { fontSize: 20, fontWeight: '600', marginTop: Spacing.two },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.two + 4,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
});
