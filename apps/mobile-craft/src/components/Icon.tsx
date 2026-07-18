/**
 * Icon — inline SVG icon set for mobile-craft (roadside design system).
 * This app keeps its own copy on purpose (frontend-isolation rule — no shared package).
 * 24px line icons drawn with react-native-svg. Replaces the emoji used as nav icons.
 */
import React from "react";
import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  name: string;
  size?: number;
  color?: string;
}

export default function Icon({ name, size = 22, color = "#111827" }: Props): React.ReactElement | null {
  const s = {
    stroke: color,
    strokeWidth: 1.9,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const box = { width: size, height: size, viewBox: "0 0 24 24" };
  switch (name) {
    case "requests": // wrench
      return (
        <Svg {...box}>
          <Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...s} />
        </Svg>
      );
    case "earnings": // dollar
      return (
        <Svg {...box}>
          <Path d="M12 2.5v19" {...s} />
          <Path d="M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.2" {...s} />
        </Svg>
      );
    case "bids": // list
      return (
        <Svg {...box}>
          <Path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" {...s} />
        </Svg>
      );
    case "account": // user
      return (
        <Svg {...box}>
          <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...s} />
          <Circle cx="12" cy="7" r="4" {...s} />
        </Svg>
      );
    default:
      return null;
  }
}
