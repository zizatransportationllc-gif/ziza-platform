/**
 * Icon — inline SVG icon set for web-driver (roadside design system).
 * This app keeps its own copy on purpose (frontend-isolation rule — no shared package).
 * 24px line icons, 1.9 stroke, currentColor. Replaces the emoji used as nav icons.
 */
export default function Icon({ name, size = 18, className = "" }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round",
    strokeLinejoin: "round", className: `zic ${className}`.trim(), "aria-hidden": true,
  };
  switch (name) {
    case "dispatch": // car
      return (
        <svg {...p}>
          <path d="M3 13.2l1.8-5A2 2 0 0 1 6.7 6.8h10.6a2 2 0 0 1 1.9 1.4l1.8 5" />
          <path d="M3 13.2h18V17.6H3z" />
          <circle cx="7" cy="17.6" r="1.5" />
          <circle cx="17" cy="17.6" r="1.5" />
        </svg>
      );
    case "earnings": // dollar
      return (
        <svg {...p}>
          <path d="M12 2.5v19" />
          <path d="M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.2" />
        </svg>
      );
    case "activity": // list
      return (
        <svg {...p}>
          <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>
      );
    case "account": // user
      return (
        <svg {...p}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "bell": // notifications
      return (
        <svg {...p}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    default:
      return null;
  }
}
