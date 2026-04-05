import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { useWindowManager, type AppWindow } from '@/lib/window-manager';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

const STATUS_CONFIG = {
  running: { color: '#34D399', icon: 'play-circle-filled' as const, label: 'Running' },
  paused: { color: '#FBBF24', icon: 'pause-circle-filled' as const, label: 'Paused' },
  completed: { color: '#60A5FA', icon: 'check-circle' as const, label: 'Done' },
  error: { color: '#F87171', icon: 'error' as const, label: 'Error' },
};

const TASK_PRESETS = [
  { type: 'extraction', title: 'Member Extraction', icon: 'download' as const, color: '#8B5CF6' },
  { type: 'bulk-message', title: 'Bulk Messaging', icon: 'chat' as const, color: '#60A5FA' },
  { type: 'auto-reply', title: 'Auto Reply Bot', icon: 'reply' as const, color: '#34D399' },
  { type: 'content-clone', title: 'Content Cloner', icon: 'content-copy' as const, color: '#FBBF24' },
];

function WindowCard({ window: win, onPause, onResume, onClose }: {
  window: AppWindow;
  onPause: () => void;
  onResume: () => void;
  onClose: () => void;
}) {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const statusCfg = STATUS_CONFIG[win.status];

  const elapsed = Math.floor((Date.now() - win.createdAt.getTime()) / 1000);
  const elapsedStr = elapsed < 60
    ? `${elapsed}s`
    : elapsed < 3600
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;

  return (
    <View style={{
      backgroundColor: palette.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: palette.border,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* Window Title Bar */}
      <LinearGradient
        colors={['#1E1B4B', '#2D1B69']}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#F87171' }} />
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FBBF24' }} />
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#34D399' }} />
        </View>
        <Text style={{ flex: 1, color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 4 }}>
          {win.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MaterialIcons name={statusCfg.icon} size={14} color={statusCfg.color} />
          <Text style={{ color: statusCfg.color, fontSize: 11, fontWeight: '700' }}>{statusCfg.label}</Text>
        </View>
      </LinearGradient>

      {/* Window Content */}
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ color: palette.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Task Type</Text>
            <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{win.taskType}</Text>
          </View>
          <View>
            <Text style={{ color: palette.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Elapsed</Text>
            <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '600', marginTop: 2 }}>{elapsedStr}</Text>
          </View>
          <View>
            <Text style={{ color: palette.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Progress</Text>
            <Text style={{ color: palette.primary, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{win.progress}%</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={{ height: 4, backgroundColor: palette.border, borderRadius: 2, marginBottom: 14 }}>
          <View style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: win.status === 'error' ? palette.error : win.status === 'completed' ? palette.success : palette.primary,
            width: `${win.progress}%`,
          }} />
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {win.status === 'running' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.warning + '20', borderRadius: 10, paddingVertical: 8 }}
              onPress={onPause}
            >
              <MaterialIcons name="pause" size={16} color={palette.warning} />
              <Text style={{ color: palette.warning, fontSize: 12, fontWeight: '700' }}>Pause</Text>
            </TouchableOpacity>
          )}
          {win.status === 'paused' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.success + '20', borderRadius: 10, paddingVertical: 8 }}
              onPress={onResume}
            >
              <MaterialIcons name="play-arrow" size={16} color={palette.success} />
              <Text style={{ color: palette.success, fontSize: 12, fontWeight: '700' }}>Resume</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.error + '20', borderRadius: 10, paddingVertical: 8 }}
            onPress={onClose}
          >
            <MaterialIcons name="close" size={16} color={palette.error} />
            <Text style={{ color: palette.error, fontSize: 12, fontWeight: '700' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function WindowsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const { windows, createWindow, closeWindow, pauseWindow, resumeWindow } = useWindowManager();

  const handleNewWindow = () => {
    Alert.alert(
      'New Window',
      'Choose a task type to run in a new window:',
      TASK_PRESETS.map((preset) => ({
        text: preset.title,
        onPress: () => {
          createWindow({
            title: preset.title,
            taskType: preset.type,
          });
        },
      })).concat([{ text: 'Cancel', onPress: () => {} }]),
    );
  };

  const handleClose = (id: string) => {
    Alert.alert('Close Window', 'Are you sure you want to close this window?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', style: 'destructive', onPress: () => closeWindow(id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
            </TouchableOpacity>
            <View>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Multi-Instance</Text>
              <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800', marginTop: 1 }}>Windows</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 6 }}
            onPress={handleNewWindow}
          >
            <MaterialIcons name="add" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Bar */}
        <View style={{ flexDirection: 'row', marginHorizontal: 20, gap: 10, marginBottom: 16 }}>
          {(['running', 'paused', 'completed', 'error'] as const).map((s) => {
            const count = windows.filter((w) => w.status === s).length;
            const cfg = STATUS_CONFIG[s];
            return (
              <View
                key={s}
                style={{
                  flex: 1,
                  backgroundColor: palette.surface,
                  borderRadius: 12,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: palette.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: cfg.color, fontSize: 18, fontWeight: '800' }}>{count}</Text>
                <Text style={{ color: palette.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{cfg.label}</Text>
              </View>
            );
          })}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {windows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 16 }}>
              <LinearGradient
                colors={['#4C1D95', '#6D28D9']}
                style={{ width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
              >
                <MaterialIcons name="tab" size={40} color="#fff" />
              </LinearGradient>
              <Text style={{ color: palette.foreground, fontSize: 20, fontWeight: '800' }}>
                No Windows Open
              </Text>
              <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center', maxWidth: 260 }}>
                Run multiple tasks simultaneously in independent windows — like a multitasking OS.
              </Text>

              <View style={{ width: '100%', gap: 10, marginTop: 8 }}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
                  Available Task Types
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {TASK_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.type}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        backgroundColor: palette.surface,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderWidth: 1,
                        borderColor: palette.border,
                      }}
                      onPress={() => createWindow({ title: preset.title, taskType: preset.type })}
                    >
                      <MaterialIcons name={preset.icon} size={16} color={preset.color} />
                      <Text style={{ color: palette.foreground, fontSize: 12, fontWeight: '600' }}>{preset.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={{ marginTop: 8, backgroundColor: palette.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}
                onPress={handleNewWindow}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Open First Window</Text>
              </TouchableOpacity>
            </View>
          ) : (
            windows.map((win) => (
              <WindowCard
                key={win.id}
                window={win}
                onPause={() => pauseWindow(win.id)}
                onResume={() => resumeWindow(win.id)}
                onClose={() => handleClose(win.id)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
