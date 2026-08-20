import styles from './presentation.module.css';
import { BrandWordmark } from '../../components/brand-wordmark';

export default function Slide13() {
  return (
    <div className={styles.slide} style={{ background: 'linear-gradient(145deg, #142f3a 0%, #263f50 58%, #34566a 100%)' }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 690, height: 690, transform: 'translate(-50%, -50%)', border: '1px solid rgba(181,213,222,0.13)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 505, height: 505, transform: 'translate(-50%, -50%)', border: '1px solid rgba(181,213,222,0.18)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 325, height: 325, transform: 'translate(-50%, -50%)', border: '1px solid rgba(181,213,222,0.23)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', left: -130, bottom: -210, width: 510, height: 510, border: '1px solid rgba(229,107,63,0.11)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', right: -160, top: -230, width: 560, height: 560, border: '1px solid rgba(229,107,63,0.1)', borderRadius: '50%' }} />
      </div>

      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}>
        <div style={{ color: '#fff', fontSize: 30 }}><BrandWordmark inverse /></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 42, color: '#ed916f', fontSize: 14, fontWeight: 900, letterSpacing: 3.2 }}>
          <span style={{ width: 34, height: 2, background: '#ed916f' }} />
          END OF PRESENTATION
          <span style={{ width: 34, height: 2, background: '#ed916f' }} />
        </div>

        <h1 style={{ margin: '25px 0 0', color: '#fff', fontFamily: "'Gangwon Edu Modu', 'Pretendard', sans-serif", fontSize: 82, fontWeight: 700, lineHeight: 1.12, letterSpacing: '-1px' }}>
          감사합니다
        </h1>

        <div style={{ width: 70, height: 4, marginTop: 28, borderRadius: 2, background: '#7eb6c3' }} />
        <p style={{ margin: '27px 0 0', color: '#d8e7eb', fontSize: 22, fontWeight: 700, lineHeight: 1.65 }}>
          바다의 변화를 먼저 발견하고,<br />더 빠른 대응을 위한 기록을 만듭니다.
        </p>

        <div style={{ marginTop: 46, padding: '11px 18px', border: '1px solid rgba(205,228,233,0.28)', borderRadius: 24, color: '#abc6cd', fontSize: 13, fontWeight: 800, letterSpacing: 2.1 }}>
          FLOATWATCH · THE EYES OF THE SEA
        </div>
      </div>

      <div className={styles.pageNumber} style={{ color: 'rgba(221,235,238,0.55)' }}>11</div>
    </div>
  );
}
