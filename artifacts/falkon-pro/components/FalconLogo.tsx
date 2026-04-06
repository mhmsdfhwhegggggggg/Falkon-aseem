import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

interface FalconLogoProps {
  size?: number;
}

/**
 * FALKON PRO — Real Falcon Photo Logo
 * AI-generated photorealistic peregrine falcon with gold frame
 */
export default function FalconLogo({ size = 120 }: FalconLogoProps) {
  const ring     = size;
  const inner    = size * 0.86;
  const img      = size * 0.82;
  const radius   = ring / 2;
  const innerRad = inner / 2;

  return (
    <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer gold ring */}
      <View style={{
        position: 'absolute',
        width: ring,
        height: ring,
        borderRadius: radius,
        borderWidth: size * 0.022,
        borderColor: '#F59E0B',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: size * 0.12,
      }} />

      {/* Inner dark circle (background for the photo) */}
      <View style={{
        width: inner,
        height: inner,
        borderRadius: innerRad,
        backgroundColor: '#0a0a0a',
        overflow: 'hidden',
        borderWidth: size * 0.01,
        borderColor: '#78350F',
      }}>
        <Image
          source={require('../assets/images/falcon_real.png')}
          style={{
            width: img,
            height: img,
            borderRadius: img / 2,
          }}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}
