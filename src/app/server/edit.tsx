import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { Radius, Spacing, useColors, type Palette } from '@/constants/theme';
import { getSSH, type SSHAuth } from '@/ssh';
import { useKeys } from '@/store/keys';
import { useServers } from '@/store/servers';

function Field({ label, c, ...props }: { label: string; c: Palette } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textSecondary}
        style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

export default function EditServerScreen() {
  const c = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id;
  const { servers, addServer, updateServer, getAuth } = useServers();
  const keys = useKeys((s) => s.keys);
  const getPrivateKey = useKeys((s) => s.getPrivateKey);
  const editing = servers.find((s) => s.id === editingId);

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setHost(editing.host);
    setPort(String(editing.port));
    setUsername(editing.username);
    setAuthType(editing.authType);
    getAuth(editing.id).then((auth) => {
      if (!auth) return;
      if (auth.type === 'password') setPassword(auth.password);
      else {
        setPrivateKey(auth.privateKey);
        setPassphrase(auth.passphrase ?? '');
      }
    });
  }, [editing?.id]);

  const buildAuth = (): SSHAuth | null => {
    if (authType === 'password') {
      if (!password) return null;
      return { type: 'password', password };
    }
    if (!privateKey.trim()) return null;
    return { type: 'key', privateKey: privateKey.trim(), passphrase: passphrase || undefined };
  };

  const validate = (): string | null => {
    if (!host.trim()) return '请填写主机地址';
    const p = parseInt(port, 10);
    if (!p || p < 1 || p > 65535) return '端口无效';
    if (!username.trim()) return '请填写用户名';
    if (!buildAuth()) return authType === 'password' ? '请填写密码' : '请选择或粘贴私钥';
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) {
      Alert.alert('无法保存', err);
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: name.trim() || host.trim(),
        host: host.trim(),
        port: parseInt(port, 10),
        username: username.trim(),
        authType,
      };
      const auth = buildAuth()!;
      if (editing) {
        await updateServer(editing.id, data, auth);
      } else {
        await addServer(data, auth);
      }
      router.back();
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    const err = validate();
    if (err) {
      Alert.alert('无法测试', err);
      return;
    }
    setTesting(true);
    try {
      const auth = buildAuth()!;
      const id = await getSSH().connect({
        host: host.trim(),
        port: parseInt(port, 10),
        username: username.trim(),
        auth,
        timeout: 12,
      });
      getSSH().close(id);
      Alert.alert('连接成功', 'SSH 认证通过 ✓');
    } catch (e) {
      Alert.alert('连接失败', e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const pickStoredKey = async (keyId: string) => {
    const pair = await getPrivateKey(keyId);
    if (!pair) {
      Alert.alert('读取失败', '钥匙串中找不到该密钥');
      return;
    }
    setPrivateKey(pair.privateKey);
    setPassphrase(pair.passphrase ?? '');
    setSelectedKeyId(keyId);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="名称（可选）" value={name} onChangeText={setName} placeholder="我的服务器" c={c} />
        <Field label="主机" value={host} onChangeText={setHost} placeholder="192.168.1.10 或 example.com" keyboardType="url" c={c} />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Field label="端口" value={port} onChangeText={setPort} keyboardType="number-pad" placeholder="22" c={c} />
          </View>
          <View style={{ flex: 2, marginLeft: Spacing.two }}>
            <Field label="用户名" value={username} onChangeText={setUsername} placeholder="root" c={c} />
          </View>
        </View>

        <Text style={[styles.label, { color: c.textSecondary }]}>认证方式</Text>
        <View style={[styles.segment, { backgroundColor: c.backgroundSelected }]}>
          {(['password', 'key'] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.segmentItem, { backgroundColor: authType === t ? c.card : 'transparent' }]}
              onPress={() => setAuthType(t)}>
              <Text style={[styles.segmentText, { color: authType === t ? c.text : c.textSecondary }]}>
                {t === 'password' ? '密码' : '私钥'}
              </Text>
            </Pressable>
          ))}
        </View>

        {authType === 'password' ? (
          <Field label="密码" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry c={c} />
        ) : (
          <>
            {/* 已存密钥选择 */}
            <View style={styles.keyChipsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {keys.map((k) => (
                  <Pressable
                    key={k.id}
                    style={[
                      styles.keyChip,
                      {
                        backgroundColor: selectedKeyId === k.id ? c.blue : c.card,
                        borderColor: selectedKeyId === k.id ? c.blue : c.border,
                      },
                    ]}
                    onPress={() => pickStoredKey(k.id)}>
                    <Ionicons name="key" size={13} color={selectedKeyId === k.id ? '#fff' : c.orange} />
                    <Text style={[styles.keyChipText, { color: selectedKeyId === k.id ? '#fff' : c.text }]}>{k.name}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[styles.keyChip, { backgroundColor: c.card, borderColor: c.border, borderStyle: 'dashed' }]}
                  onPress={() => router.push('/keys/new')}>
                  <Ionicons name="add" size={14} color={c.blue} />
                  <Text style={[styles.keyChipText, { color: c.blue }]}>生成新密钥</Text>
                </Pressable>
              </ScrollView>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: c.textSecondary }]}>私钥（PEM / OpenSSH 格式）</Text>
              <TextInput
                style={[styles.input, styles.keyInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                value={privateKey}
                onChangeText={(t) => {
                  setPrivateKey(t);
                  setSelectedKeyId(null);
                }}
                placeholder="-----BEGIN PRIVATE KEY-----"
                placeholderTextColor={c.textSecondary}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Field label="私钥口令（可选）" value={passphrase} onChangeText={setPassphrase} secureTextEntry c={c} />
          </>
        )}

        <View style={styles.buttons}>
          <Pressable style={[styles.button, { backgroundColor: c.backgroundSelected }]} onPress={onTest} disabled={testing || saving}>
            {testing ? (
              <ActivityIndicator color={c.text} />
            ) : (
              <>
                <Ionicons name="flash-outline" size={18} color={c.text} />
                <Text style={[styles.testButtonText, { color: c.text }]}>测试连接</Text>
              </>
            )}
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: c.blue }]} onPress={onSave} disabled={saving || testing}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>保存</Text>}
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: c.textSecondary }]}>凭据仅保存在本机 iOS 钥匙串中，不会上传到任何地方。</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: 60 },
  field: { marginBottom: Spacing.three },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  keyInput: { height: 110, textAlignVertical: 'top', fontFamily: 'Menlo', fontSize: 11 },
  rowFields: { flexDirection: 'row' },
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.small,
    padding: 3,
    marginBottom: Spacing.three,
  },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 7, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '500' },
  keyChipsRow: { marginBottom: Spacing.three },
  keyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  keyChipText: { fontSize: 13, fontWeight: '500' },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  button: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Radius.small,
  },
  testButtonText: { fontSize: 16, fontWeight: '600' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: Spacing.three, textAlign: 'center' },
});
