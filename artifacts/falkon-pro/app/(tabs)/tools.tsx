import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';

const BG      = '#030712';
const SURFACE = '#0D1117';
const BORDER  = '#1a2235';
const GOLD    = '#F59E0B';

interface Tool {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  color: string;
  route: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
}

interface Section {
  title: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  tools: Tool[];
}

const SECTIONS: Section[] = [
  {
    title: 'استخراج البيانات',
    icon: 'download',
    tools: [
      {
        label: 'استخراج الأعضاء',
        icon: 'people',
        color: '#FBBF24',
        route: '/extraction',
        desc: 'استخراج أعضاء أي جروب — حتى ١٠٠,٠٠٠ عضو بالتقنية الأبجدية',
      },
      {
        label: 'استخراج المتفاعلين',
        icon: 'forum',
        color: '#34D399',
        route: '/chatters',
        desc: 'الأشخاص الذين يكتبون فعلاً — أعلى استجابة ونتائج',
        badge: 'حصري',
        badgeColor: '#34D399',
      },
      {
        label: 'استخراج الأدمن',
        icon: 'admin-panel-settings',
        color: '#F59E0B',
        route: '/group-manager',
        desc: 'استخرج كل الأدمن من أي جروب أو قناة',
      },
      {
        label: 'فلترة أرقام الهواتف',
        icon: 'phone-iphone',
        color: '#A78BFA',
        route: '/contacts-filter',
        desc: 'من لديه تيليجرام من قائمة أرقامك؟ اعرف الآن',
        badge: 'جديد',
        badgeColor: '#A78BFA',
      },
    ],
  },
  {
    title: 'إضافة وإدارة الأعضاء',
    icon: 'person-add',
    tools: [
      {
        label: 'إضافة الأعضاء',
        icon: 'person-add',
        color: '#34D399',
        route: '/add-members',
        desc: 'إضافة بالاسم أو ID أو من ملف محفوظ',
      },
      {
        label: 'استخراج وإضافة',
        icon: 'sync-alt',
        color: '#60A5FA',
        route: '/extract-and-add',
        desc: 'سحب الأعضاء وإضافتهم مباشرة في خطوة واحدة',
      },
      {
        label: 'ملفات الأعضاء',
        icon: 'folder-open',
        color: '#8B5CF6',
        route: '/members-files',
        desc: 'استعراض وإدارة ملفات الاستخراج المحفوظة',
      },
    ],
  },
  {
    title: 'مدير الجروبات',
    icon: 'group-work',
    tools: [
      {
        label: 'انضمام للجروبات',
        icon: 'add-circle',
        color: '#34D399',
        route: '/group-manager',
        desc: 'انضم لمئات الجروبات بضغطة واحدة تلقائياً',
      },
      {
        label: 'مغادرة الجروبات',
        icon: 'exit-to-app',
        color: '#F87171',
        route: '/group-manager',
        desc: 'غادر جروبات محددة أو كل الجروبات دفعة واحدة',
      },
      {
        label: 'إرسال لكل الجروبات',
        icon: 'campaign',
        color: '#3B82F6',
        route: '/group-manager',
        desc: 'أرسل رسالتك لكل الجروبات التي ينضم إليها الحساب',
        badge: 'جديد',
        badgeColor: '#3B82F6',
      },
      {
        label: 'مدير القنوات',
        icon: 'rss-feed',
        color: '#818CF8',
        route: '/channel-management',
        desc: 'إدارة قنوات متعددة في آن واحد',
      },
    ],
  },
  {
    title: 'الرسائل والتشغيل الآلي',
    icon: 'chat',
    tools: [
      {
        label: 'رسائل جماعية بالاسم',
        icon: 'chat-bubble',
        color: '#60A5FA',
        route: '/bulk-ops',
        desc: 'رسائل شخصية {اسم} + {رقم} تصل لكل عميل باسمه',
        badge: 'مخصص',
        badgeColor: '#60A5FA',
      },
      {
        label: 'الرد التلقائي',
        icon: 'reply',
        color: '#34D399',
        route: '/auto-reply',
        desc: 'ردود مؤتمتة على الكلمات المفتاحية في أي محادثة',
      },
      {
        label: 'جدولة المهام',
        icon: 'schedule',
        color: '#FB923C',
        route: '/scheduler',
        desc: 'جدولة تشغيل أي مهمة بوقت محدد تلقائياً',
      },
      {
        label: 'ناسخ المحتوى',
        icon: 'content-copy',
        color: '#A78BFA',
        route: '/content-cloner',
        desc: 'نسخ وإعادة توجيه المحتوى بين القنوات آلياً',
      },
    ],
  },
  {
    title: 'البنية التحتية والحماية',
    icon: 'shield',
    tools: [
      {
        label: 'مدير البروكسي',
        icon: 'vpn-key',
        color: '#F87171',
        route: '/proxies',
        desc: 'SOCKS5/HTTP/MTProto — برو كسي مخصص لكل حساب',
      },
      {
        label: 'صحة الحسابات',
        icon: 'health-and-safety',
        color: '#34D399',
        route: '/account-health',
        desc: 'مراقبة حالة الحسابات ومنع البان',
      },
      {
        label: 'الإحصائيات',
        icon: 'bar-chart',
        color: '#F472B6',
        route: '/stats',
        desc: 'تحليلات الأداء والنشاط التفصيلية',
      },
    ],
  },
  {
    title: 'التشغيل والمراقبة',
    icon: 'monitor',
    tools: [
      {
        label: 'مراقبة المهام',
        icon: 'monitor',
        color: '#22D3EE',
        route: '/tasks-monitor',
        desc: 'سجلات المهام لحظة بلحظة',
      },
      {
        label: 'نوافذ متعددة',
        icon: 'tab',
        color: '#A78BFA',
        route: '/windows',
        desc: 'شغّل عمليات متوازية مستقلة في نفس الوقت',
      },
      {
        label: 'لوحة المطور',
        icon: 'code',
        color: '#818CF8',
        route: '/developer-dashboard',
        desc: 'أدوات التطوير والاختبار والتصحيح',
      },
    ],
  },
];

export default function ToolsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            FALKON PRO
          </Text>
          <Text style={{ color: '#F3F4F6', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>الأدوات</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <View style={{ height: 2, width: 40, backgroundColor: GOLD, borderRadius: 1 }} />
            <Text style={{ color: '#4B5563', fontSize: 11 }}>
              {SECTIONS.reduce((acc, s) => acc + s.tools.length, 0)} أداة احترافية
            </Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}>
          {SECTIONS.map((section) => (
            <View key={section.title} style={{ marginBottom: 28 }}>

              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '30' }}>
                  <MaterialIcons name={section.icon} size={14} color={GOLD} />
                </View>
                <Text style={{ color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  {section.title}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
              </View>

              {/* Tools */}
              <View style={{ gap: 8 }}>
                {section.tools.map((tool) => (
                  <TouchableOpacity
                    key={tool.label}
                    onPress={() => router.push(tool.route as any)}
                    activeOpacity={0.75}
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Text style={{ color: '#F3F4F6', fontSize: 14, fontWeight: '800' }}>{tool.label}</Text>
                        {tool.badge && (
                          <View style={{ backgroundColor: tool.badgeColor + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: tool.badgeColor + '50' }}>
                            <Text style={{ color: tool.badgeColor, fontSize: 9, fontWeight: '800' }}>{tool.badge}</Text>
                          </View>
                        )}
                      </View>
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
