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

import { Accent, Colors, Radius, Spacing } from '@/constants/theme';
import { getSSH, type SSHAuth } from '@/ssh';
import { useServers } from '@/store/servers';

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={Colors.dark.textSecondary}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

export default function EditServerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id;
  const { servers, addServer, updateServer, getAuth } = useServers();
  const editing = servers.find((s) => s.id === editingId);

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
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
    if (!buildAuth()) return authType === 'password' ? '请填写密码' : '请粘贴私钥';
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.dark.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="名称（可选）" value={name} onChangeText={setName} placeholder="我的服务器" />
        <Field label="主机" value={host} onChangeText={setHost} placeholder="192.168.1.10 或 example.com" keyboardType="url" />
        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <Field label="端口" value={port} onChangeText={setPort} keyboardType="number-pad" placeholder="22" />
          </View>
          <View style={{ flex: 2, marginLeft: Spacing.two }}>
            <Field label="用户名" value={username} onChangeText={setUsername} placeholder="root" />
          </View>
        </View>

        <Text style={styles.label}>认证方式</Text>
        <View style={styles.segment}>
          {(['password', 'key'] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.segmentItem, authType === t && styles.segmentItemActive]}
              onPress={() => setAuthType(t)}>
              <Text style={[styles.segmentText, authType === t && styles.segmentTextActive]}>
                {t === 'password' ? '密码' : '私钥'}
              </Text>
            </Pressable>
          ))}
        </View>

        {authType === 'password' ? (
          <Field label="密码" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>私钥（PEM / OpenSSH 格式）</Text>
              <TextInput
                style={[styles.input, styles.keyInput]}
                value={privateKey}
                onChangeText={setPrivateKey}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                placeholderTextColor={Colors.dark.textSecondary}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Field label="私钥口令（可选）" value={passphrase} onChangeText={setPassphrase} secureTextEntry />
          </>
        )}

        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.testButton]} onPress={onTest} disabled={testing || saving}>
            {testing ? (
              <ActivityIndicator color={Colors.dark.text} />
            ) : (
              <>
                <Ionicons name="flash-outline" size={18} color={Colors.dark.text} />
                <Text style={styles.testButtonText}>测试连接</Text>
              </>
            )}
          </Pressable>
          <Pressable style={[styles.button, styles.saveButton]} onPress={onSave} disabled={saving || testing}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>保存</Text>}
          </Pressable>
        </View>

        <Text style={styles.hint}>
          凭据仅保存在本机 iOS 钥匙串中，不会上传到任何地方。
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: 60 },
  field: { marginBottom: Spacing.three },
  label: { color: Colors.dark.textSecondary, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: Colors.dark.backgroundElement,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  keyInput: { height: 120, textAlignVertical: 'top', fontFamily: 'Menlo', fontSize: 12 },
  rowFields: { flexDirection: 'row' },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.backgroundElement,
    borderRadius: Radius.small,
    padding: 3,
    marginBottom: Spacing.three,
  },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  segmentItemActive: { backgroundColor: Colors.dark.backgroundSelected },
  segmentText: { color: Colors.dark.textSecondary, fontSize: 14, fontWeight: '500' },
  segmentTextActive: { color: Colors.dark.text },
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
  testButton: { backgroundColor: Colors.dark.backgroundSelected },
  testButtonText: { color: Colors.dark.text, fontSize: 16, fontWeight: '600' },
  saveButton: { backgroundColor: Accent.blue },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: Spacing.three, textAlign: 'center' },
});
