import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Radius, Spacing, useColors } from '@/constants/theme';
import { useKeys } from '@/store/keys';

type KeyType = 'ed25519' | 'rsa';

export default function NewKeyScreen() {
  const c = useColors();
  const router = useRouter();
  const generate = useKeys((s) => s.generate);

  const [name, setName] = useState('');
  const [type, setType] = useState<KeyType>('ed25519');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  const onGenerate = async () => {
    setBusy(true);
    try {
      const meta = await generate(name, {
        type,
        bits: 2048,
        passphrase: passphrase || undefined,
      });
      Alert.alert('生成成功', `指纹：${meta.fingerprint}\n\n把公钥添加到服务器的 ~/.ssh/authorized_keys 后即可使用`, [
        { text: '完成', onPress: () => router.back() },
        {
          text: '复制公钥',
          onPress: async () => {
            await Clipboard.setStringAsync(meta.publicKey);
            router.back();
          },
        },
      ]);
    } catch (e) {
      Alert.alert('生成失败', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: '生成密钥' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: c.textSecondary }]}>名称</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          value={name}
          onChangeText={setName}
          placeholder={type === 'rsa' ? '我的 RSA 密钥' : '我的 ED25519 密钥'}
          placeholderTextColor={c.textSecondary}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>类型</Text>
        <View style={[styles.segment, { backgroundColor: c.backgroundSelected }]}>
          {(
            [
              { v: 'ed25519' as KeyType, t: 'ED25519（推荐）' },
              { v: 'rsa' as KeyType, t: 'RSA 2048' },
            ]
          ).map((o) => (
            <Pressable
              key={o.v}
              style={[styles.segmentItem, { backgroundColor: type === o.v ? c.card : 'transparent' }]}
              onPress={() => setType(o.v)}>
              <Text style={[styles.segmentText, { color: type === o.v ? c.text : c.textSecondary }]}>{o.t}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.tipText, { color: c.textSecondary }]}>
          {type === 'ed25519'
            ? '更快更安全，现代服务器（OpenSSH 6.5+）都支持'
            : '兼容性最好，适合非常老的 SSH 服务器'}
        </Text>

        <Text style={[styles.label, { color: c.textSecondary }]}>私钥口令（可选）</Text>
        <TextInput
          style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          value={passphrase}
          onChangeText={setPassphrase}
          placeholder="留空则不加密码保护"
          placeholderTextColor={c.textSecondary}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable style={[styles.genBtn, { backgroundColor: c.blue }]} onPress={onGenerate} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="key" size={18} color="#fff" />
              <Text style={styles.genBtnText}>在设备上生成</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.hint, { color: c.textSecondary }]}>
          密钥在本机生成（OpenSSL 3.5），私钥加密存储于 iOS 钥匙串，不会离开这台设备。
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: 60 },
  label: { fontSize: 13, marginBottom: 6, marginTop: Spacing.two },
  input: {
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: Spacing.two,
  },
  segment: { flexDirection: 'row', borderRadius: Radius.small, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  tipText: { fontSize: 12, marginTop: 6, marginBottom: Spacing.two },
  genBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.small,
    marginTop: Spacing.three,
  },
  genBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: Spacing.three, textAlign: 'center', lineHeight: 18 },
});
