import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing, useColors } from '@/constants/theme';
import { useConnections } from '@/services/connection';
import { containerLogs } from '@/services/docker';
import { getSSH } from '@/ssh';

export default function LogsScreen() {
  const params = useLocalSearchParams<{ serverId: string; containerId: string; name: string }>();
  const c = useColors();
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
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={[styles.title, { color: c.text }]}>{params.name}</Text>
      {error ? (
        <Text style={[styles.error, { color: c.red }]}>{error}</Text>
      ) : logs == null ? (
        <ActivityIndicator color={c.textSecondary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={[styles.logBox, { borderColor: c.border }]} contentContainerStyle={{ padding: Spacing.three }}>
          <Text style={styles.logText} selectable>
            {logs}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.three },
  title: { fontSize: 17, fontWeight: '700', marginBottom: Spacing.two },
  error: { marginTop: 20 },
  logBox: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logText: { color: '#C9D1D9', fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 },
});
