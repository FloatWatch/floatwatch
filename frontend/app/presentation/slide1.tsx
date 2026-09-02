import styles from './presentation.module.css';
import { BrandWordmark } from '../../components/brand-wordmark';

export default function Slide1() {
  return (
    <div className={styles.slide}>
      {/* 앱 히어로와 같은 구성 — 우측 풀블리드 해안 아트, 좌측은 크림 페이퍼로 페이드 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: "url('/members/art-coast-hero.png') 62% center / cover no-repeat",
        WebkitMaskImage: 'linear-gradient(90deg, transparent 18%, #000 62%)',
        maskImage: 'linear-gradient(90deg, transparent 18%, #000 62%)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, #f2f6f5 30%, rgba(242,246,245,0.72) 52%, rgba(242,246,245,0) 78%)',
        zIndex: 0,
      }} />

      <div className={styles.titleSlide}>
        <div className={styles.projectBadge}>THE EYES OF THE SEA</div>
        <div className={styles.mainTitle}>
          <BrandWordmark />
        </div>
        <div className={styles.mainSubtitle}>
          바다를 먼저 발견하는<br />
          AI 분석 워크스페이스
        </div>
        <div style={{ maxWidth: 620, fontSize: 21, fontWeight: 600, lineHeight: 1.7, color: '#263f41' }}>
          현장 영상에서 부유물의 위치와 종류를 식별하고,<br />
          결과와 성능 지표를 대응 가능한 기록으로 관리합니다.
        </div>
      </div>

      <div style={{
        position: 'absolute',
        right: 78,
        bottom: 68,
        width: 430,
        padding: '22px 26px 20px',
        boxSizing: 'border-box',
        border: '1px solid rgba(255,255,255,0.4)',
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(242,246,245,0.62), rgba(232,242,240,0.44))',
        boxShadow: '0 16px 42px rgba(15,53,55,0.16)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          color: '#087f8c',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 1.8,
        }}>
          <span style={{ width: 22, height: 2, background: '#e56b3f' }} />
          TEAM FLOATWATCH
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          alignItems: 'center',
        }}>
          {['이지건', '노형래', '김지영', '허유진', '이승연'].map((name, index) => (
            <div key={name} style={{
              padding: '3px 10px',
              borderLeft: index === 0 ? 'none' : '1px solid rgba(51,87,86,0.2)',
              color: '#102f31',
              fontSize: 17,
              fontWeight: 800,
              textShadow: '0 1px 4px rgba(255,255,255,0.78)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}>
              {name}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.pageNumber}>1</div>
    </div>
  );
}
