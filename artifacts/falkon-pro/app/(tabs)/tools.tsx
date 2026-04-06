import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

const BG = '#030712';
const SURFACE = '#0D1117';
const BORDER = '#1a2235';
const GOLD = '#F59E0B';

const SECTIONS = [
  {
    title: 'إدارة القنوات',
    icon: 'group-work' as const,
    tools: [
      { label: 'مدير القنوات', icon: 'group-work' as const, color: '#8B5CF6', route: '/channel-management', desc: 'إدارة قنوات متعددة في آن واحد' },
      { label: 'ناسخ المحتوى', icon: 'content-copy' as const, color: '#A78BFA', route: '/content-cloner', desc: 'نسخ وإعادة توجيه المحتوى تلقائياً' },
    ],
  },
  {
    title: 'الأعضاء والبيانات',
    icon: 'people' as const,
    tools: [
      { label: 'استخراج الأعضاء', icon: 'download' as const, color: '#FBBF24', route: '/extraction', desc: 'استخراج أعضاء المجموعات والقنوات' },
      { label: 'إضافة الأعضاء', icon: 'person-add' as const, color: '#34D399', route: '/add-members', desc: 'إضافة بالاسم أو ID أو من ملف' },
      { label: 'استخراج وإضافة', icon: 'sync-alt' as const, color: '#60A5FA', route: '/extract-and-add', desc: 'استخراج الأعضاء وإضافتهم مباشرة' },
      { label: 'ملفات الأعضاء', icon: 'folder-open' as const, color: '#8B5CF6', route: '/members-files', desc: 'استعراض وإدارة ملفات الاستخراج' },
    ],
  },
  {
    title: 'الرسائل والتشغيل الآلي',
    icon: 'chat' as const,
    tools: [
      { label: 'الرسائل الجماعية', icon: 'chat-bubble' as const, color: '#60A5FA', route: '/bulk-ops', desc: 'إرسال رسائل لمستخدمين أو مجموعات' },
      { label: 'الرد التلقائي', icon: 'reply' as const, color: '#34D399', route: '/auto-reply', desc: 'ردود مؤتمتة على الكلمات المفتاحية' },
      { label: 'جدولة المهام', icon: 'schedule' as const, color: '#FB923C', route: '/scheduler', desc: 'جدولة تشغيل المهام بوقت محدد' },
    ],
  },
  {
    title: 'البنية التحتية',
    icon: 'settings' as const,
    tools: [
      { label: 'مدير البروكسي', icon: 'vpn-key' as const, color: '#F87171', route: '/proxies', desc: 'إدارة خوادم البروكسي SOCKS5/HTTP' },
      { label: 'الإحصائيات', icon: 'bar-chart' as const, color: '#F472B6', route: '/stats', desc: 'تحليلات الأداء والنشاط' },
    ],
  },
  {
    title: 'المراقبة والتحكم',
    icon: 'monitor' as const,
    tools: [
      { label: 'مراقبة المهام', icon: 'monitor' as const, color: '#22D3EE', route: '/tasks-monitor', desc: 'سجلات المهام في الوقت الفعلي' },
      { label: 'نوافذ متعددة', icon: 'tab' as const, color: '#A78BFA', route: '/windows', desc: 'تشغيل عمليات متوازية مستقلة' },
      { label: 'لوحة المطور', icon: 'code' as const, color: '#818CF8', route: '/developer-dashboard', desc: 'أدوات التطوير والتصحيح' },
    ],
  },
];

export default function ToolsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }}>
          <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            FALKON PRO
          </Text>
          <Text style={{ color: '#F3F4F6', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>الأدوات</Text>
          <View style={{ height: 2, width: 40, backgroundColor: GOLD, borderRadius: 1, marginTop: 8 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}>
          {SECTIONS.map((section, si) => (
            <View key={section.title} style={{ marginBottom: 28 }}>

              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '30' }}>
                  <MaterialIcons name={section.icon} size={14} color={GOLD} />
                </View>
                <Text style={{ color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  {section.title}
                </Text>
              </View>

              {/* Tools */}
              <View style={{ gap: 8 }}>
                {section.tools.map((tool) => (
                  <TouchableOpacity
                    key={tool.label}
                    onPress={() => router.push(tool.route as any)}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: SURFACE,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: BORDER,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      padding: 14,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Left color accent */}
                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: tool.color, borderRadius: 3 }} />

                    {/* Icon */}
                    <View style={{ marginLeft: 8, width: 44, height: 44, borderRadius: 12, backgroundColor: tool.color + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tool.color + '35' }}>
                      <MaterialIcons name={tool.icon} size={22} color={tool.color} />
                    </View>

                    {/* Text */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#F3F4F6', fontSize: 14, fontWeight: '800', marginBottom: 2 }}>{tool.label}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 12, lineHeight: 17 }}>{tool.desc}</Text>
                    </View>

                    <MaterialIcons name="chevron-right" size={20} color="#374151" />
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
