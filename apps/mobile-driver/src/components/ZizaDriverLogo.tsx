/**
 * ZizaDriverLogo — Sprint 52
 *
 * SVG logo for the Ziza Driver app.
 * Mirrors apps/web-driver/public/logo-driver.svg
 * (dark-blue rounded square · red Z · green steering wheel)
 */
import React from "react";
import Svg, { Rect, Path, G, Circle, Line } from "react-native-svg";

interface Props {
  size?: number;
}

export default function ZizaDriverLogo({ size = 96 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      accessibilityLabel="Ziza Driver logo"
      accessibilityRole="image"
    >
      {/* Dark blue rounded background */}
      <Rect width="512" height="512" rx="96" fill="#0F2A5F" />

      {/* Bold red Z */}
      <Path
        d="M 130 150 L 382 150 L 382 196 L 215 362 L 382 362 L 382 408 L 130 408 L 130 362 L 297 196 L 130 196 Z"
        fill="#E63946"
      />

      {/* Green steering wheel — top-right corner (translated 400,116) */}
      <G transform="translate(400,116)">
        {/* Outer ring */}
        <Circle cx="0" cy="0" r="78" fill="none" stroke="#22C55E" strokeWidth="16" />
        {/* Hub */}
        <Circle cx="0" cy="0" r="17" fill="#22C55E" />
        {/* Left spoke */}
        <Line x1="-62" y1="0" x2="-17" y2="0" stroke="#22C55E" strokeWidth="13" strokeLinecap="round" />
        {/* Right spoke */}
        <Line x1="62" y1="0" x2="17" y2="0" stroke="#22C55E" strokeWidth="13" strokeLinecap="round" />
        {/* Bottom spoke */}
        <Line x1="0" y1="62" x2="0" y2="17" stroke="#22C55E" strokeWidth="13" strokeLinecap="round" />
      </G>
    </Svg>
  );
}
