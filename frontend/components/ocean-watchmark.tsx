import type { CSSProperties } from "react";

type OceanWatchMarkProps = {
  className?: string;
  style?: CSSProperties;
};

export function OceanWatchMark({ className = "", style }: OceanWatchMarkProps) {
  return (
    <span className={`ocean-watchmark ${className}`} aria-label="Buyeo mul gamsi ikaen" role="img" style={style}>
      <svg viewBox="0 0 220 64" aria-hidden="true">
        <defs>
          <linearGradient id="water-loom" x1="0" y1="18" x2="220" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8fe3db" stopOpacity="0.95" />
            <stop offset="1" stopColor="#5fd3c3" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="mark-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#76e0c7" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>

        <path
          d="M8 42C22 28 38 28 52 42C66 56 82 56 96 42C110 28 126 28 140 42C154 56 170 56 184 42"
          fill="none"
          stroke="url(#water-loom)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M28 36C38 24 50 24 60 36C70 48 82 48 92 36"
          fill="none"
          stroke="url(#water-loom)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.88"
        />
        <path
          d="M130 36C144 24 158 24 172 36"
          fill="none"
          stroke="url(#water-loom)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.88"
        />

        <path
          d="M98 32c8.5 0 15.4 6.9 15.4 15.4 0 12.8-15.4 23-15.4 23S82.6 60.2 82.6 47.4C82.6 38.9 89.5 32 98 32Z"
          fill="none"
          stroke="#91d7cf"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <circle cx="98" cy="47.4" r="6.8" fill="#ff8f67" />
        <path d="M98 23.8l6.9 12.1-6.9-4-6.9 4 6.9-12.1Z" fill="url(#mark-fill)" />

        <path
          d="M72 24.5c8.4-7.1 20-7.1 28.4 0"
          fill="none"
          stroke="#d6efe9"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1 6"
          opacity="0.95"
        />

        <path
          d="M92 47.4h10.5M103.5 47.4h18.5"
          stroke="#e8f6f5"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M56 47.4h15M149 47.4h15"
          stroke="#cae9e4"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />

        <path
          d="M98 32 82 12M98 32 114 12M98 32 112 51"
          fill="none"
          stroke="#6ecfba"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.72"
        />
      </svg>
    </span>
  );
}
