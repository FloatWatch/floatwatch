import styles from './presentation.module.css';

const sections = [
  { no: '01', title: '조원 소개', en: 'Team' },
  { no: '02', title: '프로젝트 일정', en: 'Timeline' },
  { no: '03', title: '프로젝트 개요', en: 'Overview' },
  { no: '04', title: '수요조사', en: 'Research' },
  { no: '05', title: '기술 스택', second: '아키텍처', en: 'Architecture' },
  { no: '06', title: '기능 소개', en: 'Features' },
  { no: '07', title: 'AI 모델 리포트', en: 'AI Report' },
  { no: '08', title: '시연 영상', en: 'Demo Video' },
  { no: '09', title: '향후 확장 계획', en: 'Next Step' },
];

export default function Slide2() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div style={{
        position: 'absolute',
        left: 60,
        top: 118,
        bottom: 76,
        width: 292,
        padding: '42px 38px',
        boxSizing: 'border-box',
        borderRadius: 20,
        overflow: 'hidden',
        background: 'linear-gradient(155deg, #123f43 0%, #0b6f78 100%)',
        boxShadow: '0 22px 50px rgba(14,55,58,0.18)',
      }}>
        <div style={{ position: 'absolute', right: -75, bottom: -55, width: 230, height: 230, border: '1px solid rgba(255,255,255,0.13)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', right: -30, bottom: -95, width: 230, height: 230, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%' }} />
        <div style={{ color: '#c2efeb', fontSize: 15, fontWeight: 800, letterSpacing: 2.4 }}>PRESENTATION</div>
        <div style={{ marginTop: 18, color: '#fff', fontFamily: "'Gangwon Edu Modu', 'Pretendard', sans-serif", fontSize: 52, fontWeight: 700, lineHeight: 1.08 }}>목차</div>
        <div style={{ width: 38, height: 3, marginTop: 23, background: '#e56b3f' }} />
        <p style={{ margin: '28px 0 0', color: '#e4f3f1', fontSize: 17, fontWeight: 600, lineHeight: 1.75 }}>
          발견에서 검증까지,<br />
          FloatWatch가 만들어진<br />
          과정을 소개합니다.
        </p>
      </div>

      <div style={{
        position: 'absolute',
        left: 404,
        right: 72,
        top: 112,
        bottom: 76,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: 16,
      }}>
        {sections.map((section) => {
          return (
            <div key={section.no} style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '22px 20px 19px',
              overflow: 'hidden',
              border: '1px solid rgba(198,216,213,0.72)',
              borderRadius: 16,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.88), rgba(225,238,235,0.72))',
              boxShadow: '0 10px 24px rgba(22,59,60,0.065)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ color: '#276c68', fontFamily: "'Gangwon Edu Modu', monospace", fontSize: 29, fontWeight: 800 }}>
                  {section.no}
                </div>
                <span style={{ width: 28, height: 2, background: '#e56b3f' }} />
              </div>
              <div>
                <div style={{ color: '#102e30', fontSize: section.second ? 22 : 24, fontWeight: 800, lineHeight: 1.22, letterSpacing: '-0.4px' }}>
                  {section.title}{section.second && <><br />{section.second}</>}
                </div>
                <div style={{ marginTop: 9, color: '#536f6d', fontSize: 12, fontWeight: 800, letterSpacing: 1.35 }}>
                  {section.en.toUpperCase()}
                </div>
              </div>
              <div style={{
                position: 'absolute',
                right: -25,
                bottom: -30,
                width: 86,
                height: 86,
                border: '1px solid rgba(8,127,140,0.12)',
                borderRadius: '50%',
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', left: 406, top: 72, display: 'flex', alignItems: 'center', gap: 10, color: '#415f5d', fontSize: 13, fontWeight: 800, letterSpacing: 1.7 }}>
        <span style={{ width: 28, height: 2, background: '#e56b3f' }} />
        PROJECT FLOW · 01—09
      </div>
      <div className={styles.pageNumber}>2</div>
    </div>
  );
}
