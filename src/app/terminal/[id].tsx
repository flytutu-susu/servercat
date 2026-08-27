import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Accent, Colors, Spacing } from '@/constants/theme';
import { openDedicatedSession } from '@/services/connection';
import { getSSH } from '@/ssh';
import { useServers } from '@/store/servers';
import { utf8ToBase64 } from '@/utils/base64';

/** 读取打包后的 terminal.html 文本（只读一次） */
let htmlPromise: Promise<string> | null = null;
function loadTerminalHtml(): Promise<string> {
  if (!htmlPromise) {
    htmlPromise = (async () => {
      const asset = Asset.fromModule(require('@/assets/terminal.html'));
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      return FileSystem.readAsStringAsync(uri);
    })();
  }
  return htmlPromise;
}

type Phase = 'loading' | 'connecting' | 'ready' | 'error' | 'closed';

/** 终端快捷键：发送的控制序列 */
const KEYS: { label: string; seq: string; ctrl?: boolean }[] = [
  { label: 'Esc', seq: '\x1b' },
  { label: 'Tab', seq: '\t' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
];

const CTRL_KEYS = [
  { label: 'C', seq: '\x03' },
  { label: 'D', seq: '\x04' },
  { label: 'Z', seq: '\x1a' },
  { label: 'L', seq: '\x0c' },
];

export default function TerminalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const server = useServers((s) => s.servers.find((x) => x.id === id));

  const [html, setHtml] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [ctrlOn, setCtrlOn] = useState(false);

  const webRef = useRef<WebView>(null);
  const sessionRef = useRef<string | null>(null);
  const webReadyRef = useRef(false);
  const shellStartedRef = useRef(false);
  const pendingSizeRef = useRef<{ cols: number; rows: number }>({ cols: 80, rows: 24 });
  const outBufferRef = useRef<string[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 将 shell 输出批量注入 WebView（降低 injectJavaScript 频率）
  const flushOut = useCallback(() => {
    flushTimerRef.current = null;
    const chunks = outBufferRef.current;
    if (chunks.length === 0) return;
    outBufferRef.current = [];
    const payload = JSON.stringify(chunks);
    webRef.current?.injectJavaScript(
      `(function(){var a=${payload};for(var i=0;i<a.length;i++){window.__term&&window.__term.write(a[i]);}})();true;`
    );
  }, []);

  const enqueueOut = useCallback(
    (b64: string) => {
      outBufferRef.current.push(b64);
      if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flushOut, 40);
    },
    [flushOut]
  );

  useEffect(() => {
    loadTerminalHtml()
      .then(setHtml)
      .catch((e) => {
        setErrorMsg(`终端资源加载失败：${e instanceof Error ? e.message : e}`);
        setPhase('error');
      });
  }, []);

  const startShell = useCallback(async () => {
    if (!id || shellStartedRef.current) return;
    shellStartedRef.current = true;
    setPhase('connecting');
    try {
      const srv = useServers.getState().servers.find((x) => x.id === id);
      if (!srv) throw new Error('服务器不存在');
      const sessionId = await openDedicatedSession(srv);
      sessionRef.current = sessionId;
      const { cols, rows } = pendingSizeRef.current;
      await getSSH().startShell(sessionId, cols, rows);
      setPhase('ready');
      webRef.current?.injectJavaScript('window.__term&&window.__term.focus();true;');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
      shellStartedRef.current = false;
    }
  }, [id]);

  // 订阅 shell 事件
  useEffect(() => {
    const offData = getSSH().onShellData((e) => {
      if (e.sessionId === sessionRef.current) enqueueOut(e.data);
    });
    const offClose = getSSH().onShellClosed((e) => {
      if (e.sessionId === sessionRef.current) {
        sessionRef.current = null;
        setPhase('closed');
      }
    });
    return () => {
      offData();
      offClose();
    };
  }, [enqueueOut]);

  // 卸载时关闭会话
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (sessionRef.current) {
        getSSH().close(sessionRef.current);
        sessionRef.current = null;
      }
    };
  }, []);

  const onMessage = useCallback(
    (ev: WebViewMessageEvent) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number };
      try {
        msg = JSON.parse(ev.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        webReadyRef.current = true;
        startShell();
      } else if (msg.type === 'in' && msg.data != null) {
        const sid = sessionRef.current;
        if (sid) getSSH().writeShell(sid, msg.data);
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        pendingSizeRef.current = { cols: msg.cols, rows: msg.rows };
        const sid = sessionRef.current;
        if (sid) getSSH().resizeShell(sid, msg.cols, msg.rows);
      }
    },
    [startShell]
  );

  const sendSeq = useCallback((seq: string) => {
    const sid = sessionRef.current;
    if (sid) getSSH().writeShell(sid, utf8ToBase64(seq));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* 自定义标题栏 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={Accent.blue} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {server?.name ?? '终端'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {phase === 'connecting'
              ? '连接中…'
              : phase === 'ready'
                ? `${server?.username ?? ''}@${server?.host ?? ''}`
                : phase === 'closed'
                  ? '会话已断开'
                  : phase === 'error'
                    ? '连接失败'
                    : '加载中…'}
          </Text>
        </View>
        {phase === 'closed' || phase === 'error' ? (
          <Pressable
            onPress={() => {
              setErrorMsg('');
              startShell();
            }}
            hitSlop={12}
            style={styles.headerBtn}>
            <Ionicons name="refresh" size={20} color={Accent.blue} />
          </Pressable>
        ) : null}
      </View>

      {/* 终端主体 */}
      <View style={styles.termWrap}>
        {html ? (
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html, baseUrl: 'about:blank' }}
            style={styles.webview}
            onMessage={onMessage}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView
            allowsBackForwardNavigationGestures={false}
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            setBuiltInZoomControls={false}
            onError={(e) => {
              setErrorMsg(e.nativeEvent.description ?? 'WebView 错误');
              setPhase('error');
            }}
          />
        ) : (
          <ActivityIndicator style={{ marginTop: 60 }} color={Colors.dark.textSecondary} />
        )}
        {phase === 'connecting' && (
          <View style={styles.overlay}>
            <ActivityIndicator color={Accent.green} />
            <Text style={styles.overlayText}>正在建立 SSH 会话…</Text>
          </View>
        )}
        {phase === 'error' && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle-outline" size={32} color={Accent.red} />
            <Text style={[styles.overlayText, { color: Accent.red }]}>{errorMsg}</Text>
          </View>
        )}
      </View>

      {/* 快捷键栏 */}
      <View style={styles.keybar}>
        {KEYS.map((k) => (
          <Pressable key={k.label} style={styles.key} onPress={() => sendSeq(k.seq)}>
            <Text style={styles.keyText}>{k.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.key, ctrlOn && styles.keyActive]}
          onPress={() => setCtrlOn((v) => !v)}>
          <Text style={[styles.keyText, ctrlOn && { color: Accent.green }]}>Ctrl</Text>
        </Pressable>
        {ctrlOn &&
          CTRL_KEYS.map((k) => (
            <Pressable
              key={k.label}
              style={styles.key}
              onPress={() => {
                sendSeq(k.seq);
                setCtrlOn(false);
              }}>
              <Text style={styles.keyText}>^{k.label}</Text>
            </Pressable>
          ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.dark.backgroundElement,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  headerBtn: { padding: 4 },
  title: { color: Colors.dark.text, fontSize: 15, fontWeight: '600' },
  subtitle: { color: Colors.dark.textSecondary, fontSize: 11 },
  termWrap: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    padding: 24,
  },
  overlayText: { color: Colors.dark.textSecondary, fontSize: 14, textAlign: 'center' },
  keybar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.dark.backgroundElement,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  key: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: Colors.dark.backgroundSelected,
  },
  keyActive: { backgroundColor: '#1E3A24' },
  keyText: { color: Colors.dark.text, fontSize: 13, fontFamily: 'Menlo' },
});
