/**
 * Icon — inline SVG icon set for mobile-driver (roadside design system).
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
    case "dispatch": // car
      return (
        <Svg {...box}>
          <Path d="M3 13.2l1.8-5A2 2 0 0 1 6.7 6.8h10.6a2 2 0 0 1 1.9 1.4l1.8 5" {...s} />
          <Path d="M3 13.2h18V17.6H3z" {...s} />
          <Circle cx="7" cy="17.6" r="1.5" {...s} />
          <Circle cx="17" cy="17.6" r="1.5" {...s} />
        </Svg>
      );
    case "earnings": // dollar
      return (
        <Svg {...box}>
          <Path d="M12 2.5v19" {...s} />
          <Path d="M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.2" {...s} />
        </Svg>
      );
    case "activity": // list
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
    case "bell": // notifications
      return (
        <Svg {...box}>
          <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...s} />
          <Path d="M13.7 21a2 2 0 0 1-3.4 0" {...s} />
        </Svg>
      );
    default:
      return null;
  }
}
