'use client';
// FloatWatch — 프로젝트 발표 (슬라이드쇼 모드)
// ← → 화살표, 클릭, 스페이스바로 슬라이드 이동
import { useState, useEffect, useCallback } from 'react';
import Slide1 from './slide1';
import Slide2 from './slide2';
import TeamSlide from './TeamSlide';
import ProjectTimelineSlide from './ProjectTimelineSlide';
import Slide3 from './slide3';
import DemandSurveySlide from './DemandSurveySlide';
import Slide5 from './slide5';
import FeatureOverviewSlide from './FeatureOverviewSlide';
import Slide7 from './slide7';
import Slide12 from './slide12';
import Slide13 from './slide13';
import PptxDownload from './PptxDownload';
import LaserPointer from './LaserPointer';

/* ══════════════════════════════════
   슬라이드 목록 (한 장씩 분리)
   ══════════════════════════════════ */
const slides: React.ReactNode[] = [
  <Slide1 key="s1" />,
  <Slide2 key="s2" />,
  <TeamSlide key="team" />,
  <ProjectTimelineSlide key="timeline" />,
  <Slide3 key="s3" />,
  <DemandSurveySlide key="demand" />,
  <Slide5 key="s5" />,
  <FeatureOverviewSlide key="features" />,
  <Slide7 key="s7" />,
  <Slide12 key="s12" />,
  <Slide13 key="s13" />,
];

/* ══════════════════════════════════
   슬라이드쇼 뷰어
   ══════════════════════════════════ */
export default function Presentation() {
  const total = slides.length;
  const [current, setCurrent] = useState(0);
  // SSR 시점에는 창 크기를 알 수 없으므로 null. 측정 전까지 슬라이드를 감춘다.
  const [scale, setScale] = useState<number | null>(null);

  // 화면 크기에 맞춰 슬라이드 스케일 계산
  const updateScale = useCallback(() => {
    const scaleX = window.innerWidth / 1440;
    const scaleY = window.innerHeight / 810;
    setScale(Math.min(scaleX, scaleY));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlScrollbarGutter = document.documentElement.style.scrollbarGutter;
    const previousHtmlBackground = document.documentElement.style.background;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyMargin = document.body.style.margin;
    const previousBodyBackground = document.body.style.background;

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.scrollbarGutter = 'auto';
    document.documentElement.style.background = '#000';
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.background = '#000';

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.scrollbarGutter = previousHtmlScrollbarGutter;
      document.documentElement.style.background = previousHtmlBackground;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.margin = previousBodyMargin;
      document.body.style.background = previousBodyBackground;
    };
  }, []);

  const goNext = useCallback(() => setCurrent((c) => Math.min(c + 1, total - 1)), [total]);
  const goPrev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  // 키보드
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter':
          e.preventDefault(); goNext(); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
          e.preventDefault(); goPrev(); break;
        case 'Home':
          e.preventDefault(); setCurrent(0); break;
        case 'End':
          e.preventDefault(); setCurrent(total - 1); break;
        case 'F5':
          e.preventDefault();
          document.documentElement.requestFullscreen?.();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, total]);

  // 클릭: 왼쪽 20% = 이전, 나머지 = 다음
  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-nav]')) return;
    const x = e.clientX / window.innerWidth;
    x < 0.2 ? goPrev() : goNext();
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: 'none',
        userSelect: 'none',
      }}
    >
      {/* 슬라이드 */}
      <div
        style={{
          width: 1440,
          height: 810,
          transform: `scale(${scale ?? 1})`,
          transformOrigin: 'center center',
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        {slides[current]}
      </div>

      {/* 레이저 포인터 */}
      <LaserPointer />

      {/* PPTX 다운로드 버튼 */}
      <PptxDownload slides={slides} />

      {/* 하단 네비게이션 (마우스 올리면 표시) */}
      <div
        data-nav="true"
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          height: 48,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          opacity: 0,
          transition: 'opacity 0.3s',
          cursor: 'default',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
      >
        <button data-nav="true" onClick={(e) => { e.stopPropagation(); goPrev(); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '4px 16px' }}>
          ◀
        </button>
        <span style={{ color: '#fff', fontSize: 16, fontFamily: 'monospace' }}>
          {current + 1} / {total}
        </span>
        <button data-nav="true" onClick={(e) => { e.stopPropagation(); goNext(); }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: '4px 16px' }}>
          ▶
        </button>
      </div>
    </div>
  );
}
