import React from 'react';
import { View, Text } from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'muted';
  className?: string;
}

export function Badge({ children, variant = 'primary', className = '' }: BadgeProps) {
  const colors = useColors();

  const getVariantStyles = () => {
    switch (variant) {
      case 'success': return { bg: colors.success + '20', text: colors.success };
      case 'warning': return { bg: colors.warning + '20', text: colors.warning };
      case 'error': return { bg: colors.error + '20', text: colors.error };
      case 'info': return { bg: colors.info + '20', text: colors.info };
      case 'muted': return { bg: colors.muted + '20', text: colors.muted };
      default: return { bg: colors.primary + '20', text: colors.primary };
    }
  };

  const styles = getVariantStyles();

  return (
    <View
      className={`px-2 py-0.5 rounded-lg ${className}`}
      style={{ backgroundColor: styles.bg }}
    >
      <Text
        className="text-[10px] font-bold"
        style={{ color: styles.text }}
      >
        {children}
      </Text>
    </View>
  );
}
