import React from 'react';

// 24x24 stroke icons. Works in HTML and nested inside SVG (x/y position it there).
const PATHS = {
  trigger: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  action: (<><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5 3.5-5 3.5v-7Z" /></>),
  notification: <path d="m21 3-9.5 9.5M21 3l-6.5 18-3-8.5L3 9.5 21 3Z" />,
  conditional: (<><path d="m4 6 1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /><path d="M12 6h8M12 12h8M12 18h8" /></>),
  delay: (<><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5" /></>),
  logic: <path d="M15 4c-2.2-.6-3.5.6-3.9 2.8L10 13c-.4 2.2-1.7 3.4-3.9 2.8M8 10h7M9.5 19.5c1 .4 2.3-.1 2.6-1.4" />,
  merge: (<><circle cx="6" cy="5.5" r="2.2" /><circle cx="6" cy="18.5" r="2.2" /><circle cx="18" cy="9" r="2.2" /><path d="M6 7.7v8.6M18 11.2c0 3-4 3.3-10.7 5.7" /></>),
  save: (<><path d="M5 3h11l3 3v15H5V3Z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></>),
  open: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  play: <path d="M7 4.5v15l12.5-7.5L7 4.5Z" />,
  debug: (<><path d="M7 4.5v15l9-7.5-9-7.5Z" /><path d="M20 5v14" /></>),
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  next: (<><path d="m6 5 9 7-9 7V5Z" /><path d="M19 5v14" /></>),
  skip: <path d="m5 5 7 7-7 7M13 5l7 7-7 7" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  copy: (<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>),
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: (<><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5M12 17.5v.1" /></>),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  panel: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>),
  plus: <path d="M12 5v14M5 12h14" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  upload: <path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14" />,
  dot: <circle cx="12" cy="12" r="4" />,
  refresh: <path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4" />,
};

export default function Icon({ name, size = 20, x, y, color = 'currentColor', strokeWidth = 1.7, fill = 'none' }) {
  const solid = name === 'stop' || name === 'dot';
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? color : fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, pointerEvents: 'none' }}
    >
      {PATHS[name] || null}
    </svg>
  );
}

export function Logo({ size = 28 }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="0 0 54 36" aria-label="FlowForge">
      <path d="M2 4h12l8 16 8-16h8l-8 16 4 8h-8l-4-8-8 16H12L2 4Z" fill="#fff" opacity="0.95" />
      <rect x="40" y="4" width="12" height="9" rx="2.5" fill="#fff" />
    </svg>
  );
}
