import React from 'react';
import Svg, { Path, G, Defs, LinearGradient, Stop, Ellipse, Polygon, Circle, Rect } from 'react-native-svg';

interface FalconLogoProps {
  size?: number;
}

export default function FalconLogo({ size = 120 }: FalconLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FDE68A" />
          <Stop offset="0.4" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#B45309" />
        </LinearGradient>
        <LinearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBBF24" />
          <Stop offset="1" stopColor="#D97706" />
        </LinearGradient>
        <LinearGradient id="g3" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#B45309" />
          <Stop offset="0.5" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#B45309" />
        </LinearGradient>
        <LinearGradient id="gWingL" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FDE68A" stopOpacity="1" />
          <Stop offset="0.6" stopColor="#F59E0B" stopOpacity="1" />
          <Stop offset="1" stopColor="#78350F" stopOpacity="0.8" />
        </LinearGradient>
        <LinearGradient id="gWingR" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FDE68A" stopOpacity="1" />
          <Stop offset="0.6" stopColor="#F59E0B" stopOpacity="1" />
          <Stop offset="1" stopColor="#78350F" stopOpacity="0.8" />
        </LinearGradient>
      </Defs>

      {/* ── LEFT WING — broad, swept back ── */}
      {/* Main wing shape */}
      <Path
        d="M98 105 L10 55 L28 80 L6 90 L32 96 L10 115 L42 108 L22 135 L55 120 L45 148 L74 128"
        fill="url(#gWingL)"
        strokeLinejoin="round"
      />
      {/* Wing mid layer */}
      <Path
        d="M98 105 L28 80 L46 88 L32 96 L52 102 L42 108 L60 112 L55 120 L70 120 L74 128"
        fill="#F59E0B"
        opacity="0.65"
      />
      {/* Wing feather lines */}
      <Path d="M98 105 L10 55" stroke="#78350F" strokeWidth="0.5" opacity="0.4" />
      <Path d="M98 105 L28 80" stroke="#B45309" strokeWidth="0.5" opacity="0.3" />
      <Path d="M98 105 L32 96" stroke="#B45309" strokeWidth="0.5" opacity="0.3" />
      <Path d="M98 105 L42 108" stroke="#B45309" strokeWidth="0.5" opacity="0.3" />

      {/* ── RIGHT WING ── */}
      <Path
        d="M102 105 L190 55 L172 80 L194 90 L168 96 L190 115 L158 108 L178 135 L145 120 L155 148 L126 128"
        fill="url(#gWingR)"
        strokeLinejoin="round"
      />
      <Path
        d="M102 105 L172 80 L154 88 L168 96 L148 102 L158 108 L140 112 L145 120 L130 120 L126 128"
        fill="#F59E0B"
        opacity="0.65"
      />
      <Path d="M102 105 L190 55" stroke="#78350F" strokeWidth="0.5" opacity="0.4" />
      <Path d="M102 105 L172 80" stroke="#B45309" strokeWidth="0.5" opacity="0.3" />
      <Path d="M102 105 L168 96" stroke="#B45309" strokeWidth="0.5" opacity="0.3" />
      <Path d="M102 105 L158 108" stroke="#B45309" strokeWidth="0.5" opacity="0.3" />

      {/* ── BODY ── */}
      <Path
        d="M86 98 Q84 122 90 150 Q100 172 110 150 Q116 122 114 98 Z"
        fill="url(#g2)"
      />
      {/* Chest shield detail */}
      <Path
        d="M90 108 Q100 118 110 108 Q108 136 100 152 Q92 136 90 108 Z"
        fill="#92400E"
        opacity="0.45"
      />
      {/* Body center line */}
      <Path
        d="M100 100 L100 155"
        stroke="#78350F"
        strokeWidth="0.8"
        opacity="0.3"
        strokeDasharray="4,3"
      />

      {/* ── TAIL FEATHERS ── */}
      <Path
        d="M90 150 L78 186 L91 165 L100 185 L109 165 L122 186 L110 150 Z"
        fill="url(#g3)"
      />
      {/* Tail detail */}
      <Path d="M91 165 L86 185 L100 170 L114 185 L109 165" fill="#D97706" opacity="0.5" />
      <Path d="M100 150 L100 185" stroke="#78350F" strokeWidth="0.6" opacity="0.35" />

      {/* ── SHOULDER CONNECTION ── */}
      <Path
        d="M80 102 Q88 94 100 93 Q112 94 120 102 Q112 108 100 108 Q88 108 80 102Z"
        fill="#FBBF24"
      />

      {/* ── NECK ── */}
      <Path d="M90 92 Q100 86 110 92 L112 100 Q100 96 88 100 Z" fill="#FDE68A" />

      {/* ── HEAD ── */}
      <Ellipse cx="100" cy="73" rx="17" ry="21" fill="url(#g1)" />

      {/* Head hood / mask */}
      <Path
        d="M84 76 Q86 60 100 54 Q114 60 116 76 Q110 68 100 66 Q90 68 84 76Z"
        fill="#92400E"
        opacity="0.55"
      />

      {/* ── BEAK ── */}
      <Path
        d="M94 89 Q100 84 106 89 L103 96 Q100 100 97 96 Z"
        fill="#D97706"
      />
      <Path
        d="M94 89 Q100 84 106 89 L104 93 Q100 96 96 93 Z"
        fill="#F59E0B"
      />
      {/* Beak hook */}
      <Path d="M103 96 Q105 100 101 102 Q98 100 97 96" fill="#92400E" />

      {/* ── EYE ── */}
      <Circle cx="92" cy="70" r="5.5" fill="#1C1917" />
      <Circle cx="92" cy="70" r="3.5" fill="#0C0A09" />
      <Circle cx="90.5" cy="68.5" r="1.2" fill="rgba(255,255,255,0.9)" />
      {/* Eye ring */}
      <Circle cx="92" cy="70" r="5.5" fill="none" stroke="#F59E0B" strokeWidth="0.8" opacity="0.5" />

      {/* ── CREST FEATHERS ── */}
      <Path d="M88 56 Q84 40 80 30 Q90 44 93 52" stroke="#FDE68A" strokeWidth="2" fill="none" strokeLinecap="round" />
      <Path d="M95 52 Q93 36 92 24 Q99 38 100 48" stroke="#FDE68A" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <Path d="M105 53 Q108 37 112 28 Q108 42 107 52" stroke="#FDE68A" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Crest tips */}
      <Circle cx="80" cy="30" r="2" fill="#FDE68A" opacity="0.8" />
      <Circle cx="92" cy="24" r="2.5" fill="#FDE68A" opacity="0.9" />
      <Circle cx="112" cy="28" r="2" fill="#FDE68A" opacity="0.8" />

      {/* ── TALONS hint (feet) ── */}
      <Path d="M93 158 L88 170 M93 158 L91 172 M93 158 L96 170" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <Path d="M107 158 L112 170 M107 158 L109 172 M107 158 L104 170" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />

    </Svg>
  );
}
