'use client';

import { useState, useEffect } from 'react';

export default function LaserPointer() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };
    const onLeave = () => setVisible(false);

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes laser-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.5; }
        }
      `}</style>
      {/* 레이저 포인터 점 */}
      <div
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #ff0000 0%, #cc0000 60%, transparent 100%)',
          boxShadow: '0 0 8px 4px rgba(255, 0, 0, 0.4), 0 0 20px 8px rgba(255, 0, 0, 0.15)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 99999,
        }}
      />
      {/* 외곽 글로우 */}
      <div
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '1.5px solid rgba(255, 0, 0, 0.3)',
          animation: 'laser-pulse 1.5s ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 99998,
        }}
      />
    </>
  );
}
