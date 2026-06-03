/**
 * ZizaCustomerLogo — Sprint 52
 *
 * SVG logo for the Ziza Customer app.
 * Mirrors apps/web-customer/public/logo-customer.svg
 * (dark-blue rounded square · red Z · yellow map pin)
 */
import React from "react";
import Svg, { Rect, Path, G, Circle } from "react-native-svg";

interface Props {
  size?: number;
}

export default function ZizaCustomerLogo({ size = 96 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      accessibilityLabel="Ziza Customer logo"
      accessibilityRole="image"
    >
      {/* Dark blue rounded background */}
      <Rect width="512" height="512" rx="96" fill="#0F2A5F" />

      {/* Bold red Z */}
      <Path
        d="M 130 150 L 382 150 L 382 196 L 215 362 L 382 362 L 382 408 L 130 408 L 130 362 L 297 196 L 130 196 Z"
        fill="#E63946"
      />

      {/* Yellow map pin — top-right corner (translated 390,100) */}
      <G transform="translate(390,100)">
        <Path
          d="M 0 -78 C -46 -78 -82 -42 -82 4 C -82 60 0 140 0 140 C 0 140 82 60 82 4 C 82 -42 46 -78 0 -78 Z"
          fill="#FBBF24"
          stroke="#0F2A5F"
          strokeWidth="8"
        />
        <Circle cx="0" cy="4" r="24" fill="#0F2A5F" />
      </G>
    </Svg>
  );
}
