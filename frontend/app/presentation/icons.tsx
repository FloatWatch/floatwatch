// 앱(frontend)의 아이콘 어법에 맞춘 라인 아이콘. currentColor를 따르므로
// .featureIcon / .archIcon의 틸 색을 그대로 물려받는다.
// 이모지를 쓰지 않는 이유: 발표 장비마다 글리프가 달라 렌더가 흔들린다.

type Props = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconWaves({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M2 7c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2" />
      <path d="M2 13c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2" />
      <path d="M2 19c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2" />
    </svg>
  );
}

export function IconFilm({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M7 4.5v15M17 4.5v15M2.5 12h19M2.5 8.2h4.5M2.5 15.8h4.5M17 8.2h4.5M17 15.8h4.5" />
    </svg>
  );
}

export function IconSliders({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M5 21v-7M5 10V3M12 21v-10M12 7V3M19 21v-4M19 13V3" />
      <path d="M2.5 14h5M9.5 7h5M16.5 17h5" />
    </svg>
  );
}

export function IconTriangle({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M12 4.5 21 19.5H3z" />
    </svg>
  );
}

export function IconChart({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M3 3v18h18" />
      <path d="M7.5 15.5v3M12 10v8.5M16.5 13v5.5M21 6.5v12" />
    </svg>
  );
}

export function IconMessage({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M20.5 15.5a2 2 0 0 1-2 2H8l-4.5 3.5v-15a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconBolt({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M13.5 2 4 13.5h6.5L10 22l9.5-11.5H13z" />
    </svg>
  );
}

export function IconScan({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M3 8V5.5a2 2 0 0 1 2-2H8M16 3.5h3a2 2 0 0 1 2 2V8M21 16v2.5a2 2 0 0 1-2 2h-3M8 20.5H5a2 2 0 0 1-2-2V16" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconLock({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconDatabase({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

export function IconFolder({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function IconArchive({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10" />
      <path d="M10 12.5h4" />
    </svg>
  );
}

export function IconKey({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <circle cx="7.5" cy="16.5" r="3.5" />
      <path d="M10 14 20 4M17 7l2.5 2.5M14.5 9.5 17 12" />
    </svg>
  );
}

export function IconCookie({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a5 5 0 0 0 5 5 4.5 4.5 0 0 0 4.8 4.8z" />
      <path d="M9 10h.01M13 15h.01M8.5 15.5h.01M15 10.5h.01" />
    </svg>
  );
}

export function IconLink({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M10 13.5a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" />
    </svg>
  );
}

export function IconReceipt({ size = 22 }: Props) {
  return (
    <svg {...base(size)}>
      <path d="M5 3.5h14v17l-2.3-1.6-2.4 1.6-2.3-1.6-2.4 1.6L7 19.4 5 20.5z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </svg>
  );
}
