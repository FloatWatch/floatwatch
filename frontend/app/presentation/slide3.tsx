import styles from './presentation.module.css';

const perspectives = [
  {
    label: 'ENVIRONMENT',
    title: '환경',
    problem: '해양 부유물은 생태계와 연안 환경을 지속적으로 위협합니다.',
    goal: '부유물의 위치와 종류를 빠르게 식별해 대응 기반을 마련합니다.',
    color: '#4f806f',
    tint: '#edf4f0',
  },
  {
    label: 'SOCIAL',
    title: '사회',
    problem: '한정된 인력과 시간으로 넓은 해역을 반복 관측하기 어렵습니다.',
    goal: '관측 부담을 줄이고 담당자의 신속한 판단과 대응을 지원합니다.',
    color: '#b56542',
    tint: '#f8eee9',
  },
  {
    label: 'TECHNOLOGY',
    title: '기술',
    problem: '수작업 영상 판독과 분산된 기록은 분석 효율을 낮춥니다.',
    goal: 'AI 탐지 결과와 성능 지표를 하나의 기록으로 통합합니다.',
    color: '#496b82',
    tint: '#eaf0f4',
  },
];

export default function Slide3() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 118 }}>
        <div className={styles.chapterBadge}>Overview · 프로젝트 개요</div>
        <h1 className={styles.slideTitle}>영상 속 부유물을, 대응 가능한 기록으로</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 172px 1fr', alignItems: 'center', width: '100%', marginTop: 22 }}>
          <div style={{ color: '#b95734', fontSize: 14, fontWeight: 900, letterSpacing: 1.6 }}>WHY · 우리가 마주한 문제</div>
          <div />
          <div style={{ color: '#385f78', fontSize: 14, fontWeight: 900, letterSpacing: 1.6 }}>GOAL · 우리가 만들 변화</div>
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 172px 1fr', gridTemplateRows: 'repeat(3, 1fr)', gap: '12px 0', width: '100%', marginTop: 12 }}>
          <div style={{ position: 'absolute', left: '50%', top: 22, bottom: 22, width: 2, transform: 'translateX(-50%)', background: '#c7d4d8' }} />
          {perspectives.map((item, index) => (
            <div key={item.title} style={{ display: 'contents' }}>
              <section style={{ gridColumn: 1, gridRow: index + 1, minHeight: 112, display: 'grid', gridTemplateColumns: '112px 1fr', alignItems: 'center', padding: '20px 26px', boxSizing: 'border-box', border: `1px solid ${item.color}38`, borderRadius: 14, background: item.tint, boxShadow: '0 7px 18px rgba(34,54,59,0.05)' }}>
                <div>
                  <div style={{ color: item.color, fontSize: 11, fontWeight: 900, letterSpacing: 1.25 }}>{item.label}</div>
                  <div style={{ marginTop: 5, color: '#172f31', fontSize: 27, fontWeight: 850 }}>{item.title} 문제</div>
                </div>
                <p style={{ margin: 0, paddingLeft: 20, borderLeft: `3px solid ${item.color}`, color: '#2d4544', fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{item.problem}</p>
              </section>

              <div style={{ gridColumn: 2, gridRow: index + 1, position: 'relative', zIndex: 2, alignSelf: 'center', justifySelf: 'center', width: 86, height: 42, display: 'grid', placeItems: 'center', border: '5px solid #f2f6f5', borderRadius: 22, background: item.color, color: '#fff', fontSize: 21, fontWeight: 850, boxShadow: '0 6px 15px rgba(34,54,59,0.16)' }}>→</div>

              <section style={{ gridColumn: 3, gridRow: index + 1, minHeight: 112, display: 'grid', gridTemplateColumns: '112px 1fr', alignItems: 'center', padding: '20px 26px', boxSizing: 'border-box', border: `1px solid ${item.color}38`, borderRadius: 14, background: '#fff', boxShadow: '0 7px 18px rgba(34,54,59,0.06)' }}>
                <div>
                  <div style={{ color: item.color, fontSize: 11, fontWeight: 900, letterSpacing: 1.25 }}>{item.label}</div>
                  <div style={{ marginTop: 5, color: '#172f31', fontSize: 27, fontWeight: 850 }}>{item.title} 목표</div>
                </div>
                <p style={{ margin: 0, paddingLeft: 20, borderLeft: `3px solid ${item.color}`, color: '#2d4544', fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>{item.goal}</p>
              </section>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, width: '100%', marginTop: 20, padding: '14px 20px', boxSizing: 'border-box', borderRadius: 10, background: '#263f50', color: '#fff' }}>
          <span style={{ color: '#ed916f', fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}>FLOATWATCH</span>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.25)' }} />
          <strong style={{ fontSize: 18, letterSpacing: '-0.2px' }}>현장 영상과 AI를 연결해 환경 대응을 위한 판단 근거를 만듭니다.</strong>
        </div>
      </div>
      <div className={styles.pageNumber}>5</div>
    </div>
  );
}
