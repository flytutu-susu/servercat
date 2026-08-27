import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useConnections } from '@/services/connection';
import { containerLogs } from '@/services/docker';
import { getSSH } from '@/ssh';

export default function LogsScreen() {
  const params = useLocalSearchParams<{ serverId: string; containerId: string; name: string }>();
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionId = await useConnections.getState().ensureConnected(params.serverId!);
        const text = await containerLogs(getSSH(), sessionId, params.containerId!, 200);
        if (!cancelled) setLogs(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.serverId, params.containerId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{params.name}</Text>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : logs == null ? (
        <ActivityIndicator color={Colors.dark.textSecondary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.logBox} contentContainerStyle={{ padding: Spacing.three }}>
          <Text style={styles.logText} selectable>
            {logs}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background, padding: Spacing.three },
  title: { color: Colors.dark.text, fontSize: 17, fontWeight: '700', marginBottom: Spacing.two },
  error: { color: '#FF453A', marginTop: 20 },
  logBox: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.border,
  },
  logText: { color: '#C9D1D9', fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 },
});
