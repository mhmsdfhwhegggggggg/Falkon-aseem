import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Polygon, Ellipse } from 'react-native-svg';

interface FalconLogoProps {
  size?: number;
}

/**
 * FALKON PRO — Heraldic Spread Falcon (front-facing, wings spread)
 * Classic military / UAE emblem style — instantly recognizable as a raptor
 * Gold gradient, sharp angular lines, professional logo quality
 */
export default function FalconLogo({ size = 120 }: FalconLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <LinearGradient id="h_gold" x1="0.5" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor="#FEF3C7" />
          <Stop offset="0.35" stopColor="#F59E0B" />
          <Stop offset="0.75" stopColor="#D97706" />
          <Stop offset="1" stopColor="#78350F" />
        </LinearGradient>
        <LinearGradient id="h_wing_l" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FDE68A" />
          <Stop offset="0.5" stopColor="#D97706" />
          <Stop offset="1" stopColor="#451a03" />
        </LinearGradient>
        <LinearGradient id="h_wing_r" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FDE68A" />
          <Stop offset="0.5" stopColor="#D97706" />
          <Stop offset="1" stopColor="#451a03" />
        </LinearGradient>
        <LinearGradient id="h_body" x1="0.5" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor="#FBBF24" />
          <Stop offset="0.6" stopColor="#D97706" />
          <Stop offset="1" stopColor="#92400E" />
        </LinearGradient>
        <LinearGradient id="h_head" x1="0.3" y1="0" x2="0.7" y2="1">
          <Stop offset="0" stopColor="#FEF3C7" />
          <Stop offset="0.5" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#B45309" />
        </LinearGradient>
      </Defs>

      {/* ═══════════ LEFT WING ═══════════
          Wing surface: spans from body center-left out to the left
          Angular feather tips at bottom-left
      */}
      {/* Main wing shape */}
      <Path
        d="M 92 100
           L 85 88
           L 50 62
           L 22 58
           L 6  70
           L 14 82
           L 4  88
           L 16 96
           L 4  108
           L 18 112
           L 6  128
           L 22 126
           L 12 144
           L 30 136
           L 24 154
           L 46 140
           L 52 158
           L 68 138
           L 80 148
           L 88 128
           L 92 118
           Z"
        fill="url(#h_wing_l)"
      />
      {/* Wing feather highlight layer */}
      <Path
        d="M 92 100 L 50 62 L 60 72 L 36 84 L 52 90 L 32 104 L 54 108 L 36 122 L 58 120 L 44 136 L 68 126 L 68 138 L 80 120 L 88 128"
        fill="#F59E0B"
        opacity="0.3"
      />
      {/* Feather tip detail lines */}
      <Path d="M 92 100 L 6 70" stroke="#451a03" strokeWidth="0.7" opacity="0.35" fill="none" />
      <Path d="M 92 100 L 4 88" stroke="#451a03" strokeWidth="0.7" opacity="0.3" fill="none" />
      <Path d="M 92 100 L 4 108" stroke="#451a03" strokeWidth="0.7" opacity="0.3" fill="none" />
      <Path d="M 92 102 L 6 128" stroke="#451a03" strokeWidth="0.6" opacity="0.25" fill="none" />
      <Path d="M 88 108 L 12 144" stroke="#451a03" strokeWidth="0.6" opacity="0.2" fill="none" />

      {/* ═══════════ RIGHT WING (mirror) ═══════════ */}
      <Path
        d="M 108 100
           L 115 88
           L 150 62
           L 178 58
           L 194 70
           L 186 82
           L 196 88
           L 184 96
           L 196 108
           L 182 112
           L 194 128
           L 178 126
           L 188 144
           L 170 136
           L 176 154
           L 154 140
           L 148 158
           L 132 138
           L 120 148
           L 112 128
           L 108 118
           Z"
        fill="url(#h_wing_r)"
      />
      <Path
        d="M 108 100 L 150 62 L 140 72 L 164 84 L 148 90 L 168 104 L 146 108 L 164 122 L 142 120 L 156 136 L 132 126 L 132 138 L 120 120 L 112 128"
        fill="#F59E0B"
        opacity="0.3"
      />
      <Path d="M 108 100 L 194 70" stroke="#451a03" strokeWidth="0.7" opacity="0.35" fill="none" />
      <Path d="M 108 100 L 196 88" stroke="#451a03" strokeWidth="0.7" opacity="0.3" fill="none" />
      <Path d="M 108 100 L 196 108" stroke="#451a03" strokeWidth="0.7" opacity="0.3" fill="none" />
      <Path d="M 108 102 L 194 128" stroke="#451a03" strokeWidth="0.6" opacity="0.25" fill="none" />
      <Path d="M 112 108 L 188 144" stroke="#451a03" strokeWidth="0.6" opacity="0.2" fill="none" />

      {/* ═══════════ BODY ═══════════ */}
      <Ellipse cx="100" cy="118" rx="18" ry="42" fill="url(#h_body)" />
      {/* Chest feather barring */}
      <Path d="M 85 105 Q 100 100 115 105" stroke="#451a03" strokeWidth="1.2" opacity="0.4" fill="none" />
      <Path d="M 84 114 Q 100 109 116 114" stroke="#451a03" strokeWidth="1.2" opacity="0.38" fill="none" />
      <Path d="M 84 123 Q 100 118 116 123" stroke="#451a03" strokeWidth="1" opacity="0.32" fill="none" />
      <Path d="M 85 132 Q 100 127 115 132" stroke="#451a03" strokeWidth="0.9" opacity="0.28" fill="none" />
      <Path d="M 86 141 Q 100 136 114 141" stroke="#451a03" strokeWidth="0.8" opacity="0.22" fill="none" />
      {/* Center line */}
      <Path d="M 100 96 L 100 158" stroke="#78350F" strokeWidth="0.7" opacity="0.25" strokeDasharray="4,4" fill="none" />

      {/* ═══════════ MANTLE / SHOULDER SHIELD ═══════════ */}
      <Path
        d="M 82 95 Q 100 86 118 95 Q 112 108 100 112 Q 88 108 82 95 Z"
        fill="#FBBF24"
      />

      {/* ═══════════ TAIL ═══════════ */}
      <Path
        d="M 84 158 L 76 192 L 86 174 L 100 198 L 114 174 L 124 192 L 116 158 Z"
        fill="url(#h_body)"
      />
      {/* Tail feathers */}
      <Path d="M 86 174 L 82 194" stroke="#451a03" strokeWidth="0.9" opacity="0.5" fill="none" />
      <Path d="M 100 175 L 100 198" stroke="#451a03" strokeWidth="0.9" opacity="0.5" fill="none" />
      <Path d="M 114 174 L 118 194" stroke="#451a03" strokeWidth="0.9" opacity="0.5" fill="none" />
      <Path d="M 78 183 Q 100 192 122 183" stroke="#D97706" strokeWidth="1.2" opacity="0.4" fill="none" />

      {/* ═══════════ NECK ═══════════ */}
      <Path
        d="M 89 92 Q 100 87 111 92 L 112 98 Q 100 94 88 98 Z"
        fill="#FDE68A"
      />

      {/* ═══════════ HEAD ═══════════ */}
      {/* Head silhouette — angular, flat-topped, not perfectly round */}
      <Path
        d="M 84 82
           Q 82 62 100 56
           Q 118 62 116 82
           Q 112 94 100 96
           Q 88 94 84 82 Z"
        fill="url(#h_head)"
      />
      {/* Dark crown/cap */}
      <Path
        d="M 88 58 Q 100 52 112 58 Q 110 66 100 64 Q 90 66 88 58 Z"
        fill="#1C0800"
        opacity="0.65"
      />
      {/* Peregrine malar stripes (both sides for front view) */}
      <Path d="M 84 74 Q 84 82 86 88 L 84 88 Q 82 82 82 74 Z" fill="#1C0800" opacity="0.7" />
      <Path d="M 116 74 Q 116 82 114 88 L 116 88 Q 118 82 118 74 Z" fill="#1C0800" opacity="0.7" />

      {/* ═══════════ BEAK ═══════════ */}
      {/* Cere */}
      <Ellipse cx="100" cy="85" rx="8" ry="3.5" fill="#FBBF24" opacity="0.8" />
      {/* Upper mandible */}
      <Path d="M 92 87 Q 100 83 108 87 L 106 93 Q 100 98 94 93 Z" fill="#B45309" />
      {/* Mandible highlight */}
      <Path d="M 93 87 Q 100 83 107 87 L 105 91 Q 100 95 95 91 Z" fill="#D97706" opacity="0.8" />
      {/* Hook */}
      <Path d="M 106 93 Q 110 97 107 103 Q 102 103 100 99 Q 104 97 106 93 Z" fill="#78350F" />
      {/* Lower mandible */}
      <Path d="M 94 93 Q 100 97 106 93 Q 104 100 100 102 Q 96 100 94 93 Z" fill="#92400E" />

      {/* ═══════════ EYES — sharp, fierce raptor eyes (not round/owlish) ═══════════ */}
      {/* Left eye — almond-shaped, angular */}
      <Path d="M 84 70 Q 90 64 96 70 Q 96 78 90 80 Q 84 78 84 70 Z" fill="#0C0800" />
      <Circle cx="90" cy="73" r="4" fill="#050200" />
      <Circle cx="90" cy="73" r="4" fill="none" stroke="#F59E0B" strokeWidth="1.2" opacity="0.7" />
      <Circle cx="88.5" cy="71.5" r="1.5" fill="rgba(255,255,255,0.9)" />
      {/* Supraorbital ridge — fierce expression */}
      <Path d="M 83 68 Q 90 63 97 68" stroke="#1C0800" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
      {/* Right eye */}
      <Path d="M 104 70 Q 110 64 116 70 Q 116 78 110 80 Q 104 78 104 70 Z" fill="#0C0800" />
      <Circle cx="110" cy="73" r="4" fill="#050200" />
      <Circle cx="110" cy="73" r="4" fill="none" stroke="#F59E0B" strokeWidth="1.2" opacity="0.7" />
      <Circle cx="108.5" cy="71.5" r="1.5" fill="rgba(255,255,255,0.9)" />
      <Path d="M 103 68 Q 110 63 117 68" stroke="#1C0800" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />

      {/* ═══════════ TALONS ═══════════ */}
      {/* Left talons */}
      <Path d="M 90 166 L 82 180 M 90 166 L 86 182 M 90 166 L 93 182" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.9" />
      <Circle cx="81" cy="181" r="2.2" fill="#78350F" opacity="0.8" />
      <Circle cx="85" cy="183" r="2.2" fill="#78350F" opacity="0.8" />
      <Circle cx="93.5" cy="183" r="2.2" fill="#78350F" opacity="0.8" />
      {/* Right talons */}
      <Path d="M 110 166 L 118 180 M 110 166 L 114 182 M 110 166 L 107 182" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.9" />
      <Circle cx="119" cy="181" r="2.2" fill="#78350F" opacity="0.8" />
      <Circle cx="115" cy="183" r="2.2" fill="#78350F" opacity="0.8" />
      <Circle cx="106.5" cy="183" r="2.2" fill="#78350F" opacity="0.8" />
    </Svg>
  );
}
