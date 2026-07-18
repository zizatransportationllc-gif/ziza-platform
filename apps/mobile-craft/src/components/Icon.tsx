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
    case "tire":
      return (
        <Svg {...box}>
          <Circle cx="12" cy="12" r="9" {...s} />
          <Circle cx="12" cy="12" r="3.2" {...s} />
          <Path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3" {...s} />
        </Svg>
      );
    case "tow":
      return (
        <Svg {...box}>
          <Path d="M2 6h9v8H2z" {...s} />
          <Path d="M11 9h4l4 3v2h-8z" {...s} />
          <Circle cx="6" cy="17" r="1.6" {...s} />
          <Circle cx="17" cy="17" r="1.6" {...s} />
          <Path d="M11 6l6-3" {...s} />
        </Svg>
      );
    case "battery":
      return (
        <Svg {...box}>
          <Path d="M2 8h15v9H2z" {...s} />
          <Path d="M20 11v3" {...s} />
          <Path d="M8.5 11l-1 2.6h1.8l-1 2.4" {...s} />
        </Svg>
      );
    case "fuel":
      return (
        <Svg {...box}>
          <Path d="M12 3.5l5.3 5.3a7.5 7.5 0 1 1-10.6 0z" {...s} />
        </Svg>
      );
    case "lock":
      return (
        <Svg {...box}>
          <Path d="M5 11h14v10H5z" {...s} />
          <Path d="M8 11V7a4 4 0 0 1 8 0v4" {...s} />
        </Svg>
      );
    case "alert":
      return (
        <Svg {...box}>
          <Path d="M12 3.2 21.5 20H2.5z" {...s} />
          <Path d="M12 9.5v4.2M12 17.2h.01" {...s} />
        </Svg>
      );
    case "search":
      return (
        <Svg {...box}>
          <Circle cx="11" cy="11" r="7" {...s} />
          <Path d="M21 21l-4.3-4.3" {...s} />
        </Svg>
      );
    default:
      return null;
  }
}
