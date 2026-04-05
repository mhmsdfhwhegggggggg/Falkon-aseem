import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

const TOOL_SECTIONS = [
  {
    title: 'Channel Management',
    tools: [
      { label: 'Channel Manager', icon: 'group-work' as const, color: '#8B5CF6', route: '/channel-management', description: 'Manage multiple channels' },
      { label: 'Content Cloner', icon: 'content-copy' as const, color: '#A78BFA', route: '/content-cloner', description: 'Clone & forward content' },
    ],
  },
  {
    title: 'Automation',
    tools: [
      { label: 'Auto Reply', icon: 'reply' as const, color: '#34D399', route: '/auto-reply', description: 'Automated responses' },
      { label: 'Bulk Operations', icon: 'chat-bubble' as const, color: '#60A5FA', route: '/bulk-ops', description: 'Mass messaging tools' },
    ],
  },
  {
    title: 'Data & Analytics',
    tools: [
      { label: 'Member Extraction', icon: 'download' as const, color: '#FBBF24', route: '/extraction', description: 'Extract group members' },
      { label: 'Statistics', icon: 'bar-chart' as const, color: '#F472B6', route: '/stats', description: 'Performance analytics' },
    ],
  },
  {
    title: 'Infrastructure',
    tools: [
      { label: 'Proxy Manager', icon: 'vpn-key' as const, color: '#F87171', route: '/proxies', description: 'Manage proxy pools' },
      { label: 'Scheduler', icon: 'schedule' as const, color: '#FB923C', route: '/scheduler', description: 'Timed task scheduling' },
    ],
  },
  {
    title: 'Advanced',
    tools: [
      { label: 'Multi-Window', icon: 'tab' as const, color: '#22D3EE', route: '/windows', description: 'Run parallel instances' },
      { label: 'Dev Dashboard', icon: 'code' as const, color: '#818CF8', route: '/developer-dashboard', description: 'Developer tools & logs' },
    ],
  },
];

export default function ToolsScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Utilities</Text>
          <Text style={{ color: palette.foreground, fontSize: 24, fontWeight: '800', marginTop: 2 }}>Tools</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}>
          {TOOL_SECTIONS.map((section) => (
            <View key={section.title} style={{ marginBottom: 24 }}>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                {section.title}
              </Text>
              <View style={{ gap: 10 }}>
                {section.tools.map((tool) => (
                  <TouchableOpacity
                    key={tool.label}
                    style={{
                      backgroundColor: palette.surface,
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: palette.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                    onPress={() => router.push(tool.route as any)}
                  >
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: tool.color + '20',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <MaterialIcons name={tool.icon} size={20} color={tool.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>{tool.label}</Text>
                      <Text style={{ color: palette.muted, fontSize: 12 }}>{tool.description}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={palette.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
