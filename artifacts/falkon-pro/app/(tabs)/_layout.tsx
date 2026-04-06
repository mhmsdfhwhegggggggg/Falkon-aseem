import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColorScheme } from "@/hooks/use-color-scheme";

const GOLD = '#F59E0B';
const BG_TAB = '#080D16';
const BORDER_TAB = '#1a2235';

function TabIcon({ name, color, focused }: { name: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {focused && (
        <View style={{
          position: 'absolute',
          top: -10,
          width: 32,
          height: 2,
          borderRadius: 1,
          backgroundColor: GOLD,
        }} />
      )}
      <MaterialIcons name={name} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: '#4B5563',
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : BG_TAB,
          borderTopWidth: 1,
          borderTopColor: BORDER_TAB,
          elevation: 0,
          paddingTop: 6,
          height: Platform.OS === "web" ? 64 : 60,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={95}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: BG_TAB, borderTopWidth: 1, borderTopColor: BORDER_TAB },
              ]}
            />
          ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "الحسابات",
          tabBarIcon: ({ color, focused }) => <TabIcon name="people" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "المهام",
          tabBarIcon: ({ color, focused }) => <TabIcon name="assignment" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "الأدوات",
          tabBarIcon: ({ color, focused }) => <TabIcon name="build" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "الإعدادات",
          tabBarIcon: ({ color, focused }) => <TabIcon name="settings" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
