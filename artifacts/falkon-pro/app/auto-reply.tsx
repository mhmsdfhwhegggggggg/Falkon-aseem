import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import colors from '@/constants/colors';
import { router } from 'expo-router';

interface Rule {
  id: string;
  trigger: string;
  response: string;
  enabled: boolean;
}

export default function AutoReplyScreen() {
  const scheme = useColorScheme();
  const palette = colors[scheme];
  const [rules, setRules] = useState<Rule[]>([
    { id: '1', trigger: 'hello', response: 'Hi! How can I help you?', enabled: true },
    { id: '2', trigger: 'price', response: 'Please check our pricing page.', enabled: true },
  ]);
  const [trigger, setTrigger] = useState('');
  const [response, setResponse] = useState('');

  const addRule = () => {
    if (!trigger.trim() || !response.trim()) {
      Alert.alert('Missing Fields', 'Please fill in both trigger and response');
      return;
    }
    setRules(prev => [...prev, { id: Date.now().toString(), trigger, response, enabled: true }]);
    setTrigger('');
    setResponse('');
  };

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    Alert.alert('Delete Rule', 'Remove this auto-reply rule?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setRules(prev => prev.filter(r => r.id !== id)) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={palette.foreground} />
          </TouchableOpacity>
          <View>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Automation</Text>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: '800' }}>Auto Reply</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 16 }}>
          {/* Add Rule */}
          <View style={{ backgroundColor: palette.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 12 }}>
            <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Add Rule</Text>
            <TextInput
              value={trigger}
              onChangeText={setTrigger}
              placeholder="Trigger keyword..."
              placeholderTextColor={palette.muted}
              style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14 }}
            />
            <TextInput
              value={response}
              onChangeText={setResponse}
              placeholder="Auto-reply message..."
              placeholderTextColor={palette.muted}
              multiline
              style={{ backgroundColor: palette.background, borderRadius: 10, padding: 12, color: palette.foreground, borderWidth: 1, borderColor: palette.border, fontSize: 14, minHeight: 80, textAlignVertical: 'top' }}
            />
            <TouchableOpacity
              style={{ backgroundColor: palette.primary, borderRadius: 10, padding: 12, alignItems: 'center' }}
              onPress={addRule}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Add Rule</Text>
            </TouchableOpacity>
          </View>

          {/* Rules List */}
          <Text style={{ color: palette.foreground, fontSize: 14, fontWeight: '700' }}>Active Rules ({rules.length})</Text>
          {rules.map((rule) => (
            <View
              key={rule.id}
              style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: rule.enabled ? palette.primary + '40' : palette.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="label" size={14} color={palette.primary} />
                    <Text style={{ color: palette.primary, fontSize: 12, fontWeight: '700' }}>{rule.trigger}</Text>
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>{rule.response}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => toggleRule(rule.id)}>
                    <MaterialIcons name={rule.enabled ? 'toggle-on' : 'toggle-off'} size={28} color={rule.enabled ? palette.primary : palette.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteRule(rule.id)}>
                    <MaterialIcons name="delete-outline" size={22} color={palette.error} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
