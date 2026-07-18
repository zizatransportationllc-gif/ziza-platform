/**
 * ZizaCraftLogo
 *
 * SVG logo for the Ziza Craft app.
 * Mirrors apps/web-craft/public/logo-craft.svg
 * (dark-blue rounded square · red Z · green open-end wrench — the craft
 *  counterpart to the driver logo, with the steering wheel swapped for a wrench)
 */
import React from "react";
import Svg, { Rect, Path, G } from "react-native-svg";

interface Props {
  size?: number;
}

export default function ZizaCraftLogo({ size = 96 }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      accessibilityLabel="Ziza Craft logo"
      accessibilityRole="image"
    >
      {/* Dark blue rounded background */}
      <Rect width="512" height="512" rx="96" fill="#0F2A5F" />

      {/* Bold red Z */}
      <Path
        d="M 130 150 L 382 150 L 382 196 L 215 362 L 382 362 L 382 408 L 130 408 L 130 362 L 297 196 L 130 196 Z"
        fill="#E63946"
      />

      {/* Green open-end wrench — top-right corner (replaces the driver's wheel) */}
      <G transform="translate(396,118) rotate(45) scale(0.92)">
        <Path
          fill="#059669"
          d="M -34 -92 L -13 -92 L -13 -58 L 13 -58 L 13 -92 L 34 -92 L 34 -40 L 12 -40 L 12 40 L 34 40 L 34 92 L 13 92 L 13 58 L -13 58 L -13 92 L -34 92 L -34 40 L -12 40 L -12 -40 L -34 -40 Z"
        />
      </G>
    </Svg>
  );
}
