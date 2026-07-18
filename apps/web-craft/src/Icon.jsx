/**
 * Icon — inline SVG icon set for web-craft (roadside design system).
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
    case "requests": // wrench
      return (
        <svg {...p}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "earnings": // dollar
      return (
        <svg {...p}>
          <path d="M12 2.5v19" />
          <path d="M16.5 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7.2" />
        </svg>
      );
    case "bids": // list
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
    case "tire":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3" />
        </svg>
      );
    case "tow":
      return (
        <svg {...p}>
          <path d="M2 6h9v8H2z" />
          <path d="M11 9h4l4 3v2h-8z" />
          <circle cx="6" cy="17" r="1.6" />
          <circle cx="17" cy="17" r="1.6" />
          <path d="M11 6l6-3" />
        </svg>
      );
    case "battery":
      return (
        <svg {...p}>
          <rect x="2" y="8" width="15" height="9" rx="2" />
          <path d="M20 11v3" />
          <path d="M8.5 11l-1 2.6h1.8l-1 2.4" />
        </svg>
      );
    case "fuel":
      return (
        <svg {...p}>
          <path d="M12 3.5l5.3 5.3a7.5 7.5 0 1 1-10.6 0z" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "alert":
      return (
        <svg {...p}>
          <path d="M12 3.2 21.5 20H2.5z" />
          <path d="M12 9.5v4.2M12 17.2h.01" />
        </svg>
      );
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    default:
      return null;
  }
}
