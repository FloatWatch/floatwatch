import styles from './presentation.module.css';

const evidence = [
  {
    value: '14.5만 톤',
    title: '연간 해양쓰레기 발생량',
    desc: '넓은 해역을 육안으로 조사하려면 많은 시간과 인력이 필요합니다.',
    detail: '경제 피해 약 4,000억 원 · 선박 추진기 감김 연평균 378건',
    source: '해양수산부',
  },
  {
    value: '1,547억 원',
    title: '2024년 관련 국비',
    desc: '수거·처리와 발생 예방에 지속적인 공공 예산이 투입되고 있습니다.',
    detail: '수거·처리 972억 원 · 발생 예방 431억 원',
    source: '해양수산부',
  },
  {
    value: '70억 원',
    title: 'AI 해양환경관리 투자',
    desc: '인천은 AI·드론 기반 탐지와 수거 경로 최적화 시스템을 추진했습니다.',
    detail: '이동거리 30% · 탄소배출 40% 감소 기대',
    source: '인천광역시',
  },
];

export default function DemandSurveySlide() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 88, paddingBottom: 12 }}>
        <div className={styles.chapterBadge}>Demand · 수요 조사</div>
        <h1 className={styles.slideTitle}>해양쓰레기 관측, 더 빠르고 정확해야 합니다</h1>

        <section style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 24, width: '100%', height: 490, marginTop: 16, padding: 18, boxSizing: 'border-box', border: '1px solid #cbd7da', borderRadius: 18, background: 'rgba(255,255,255,0.82)', boxShadow: '0 15px 34px rgba(28,50,59,0.09)' }}>
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 14, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
            {[
              ['/presentation/demand-waste.gif', '해양 쓰레기 14만 톤 관련 뉴스 화면'],
              ['/presentation/demand-cleanup.png', '한 시간 만에 해양 쓰레기 70장 수거 관련 뉴스 화면'],
            ].map(([src, alt]) => (
              <figure key={src} style={{ position: 'relative', minWidth: 0, minHeight: 0, margin: 0, overflow: 'hidden', border: '1px solid #c7d4d8', borderRadius: 12, background: '#eef2f3', boxShadow: '0 7px 18px rgba(31,53,61,0.08)' }}>
                <img src={src} alt={alt} style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', objectPosition: 'center' }} />
              </figure>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateRows: '72px repeat(3, 1fr)', gap: 10, minWidth: 0 }}>
            <div style={{ padding: '1px 3px 10px', borderBottom: '3px solid #365f78' }}>
              <div style={{ color: '#b94e2a', fontSize: 14, fontWeight: 900, letterSpacing: 1.4 }}>DEMAND EVIDENCE · 핵심 근거</div>
              <h2 style={{ margin: '6px 0 0', color: '#102b39', fontSize: 25, fontWeight: 900, lineHeight: 1.2 }}>수치로 확인한 해양 관측의 필요성</h2>
            </div>

            {evidence.map((item, index) => (
              <article key={item.value} style={{ display: 'grid', gridTemplateColumns: '190px 1fr', alignItems: 'center', padding: '11px 16px', border: `1px solid ${index === 2 ? '#e4b6a5' : '#cbd7da'}`, borderRadius: 12, background: index === 2 ? '#fff5f0' : '#f7fafb', boxShadow: '0 5px 13px rgba(31,53,61,0.045)' }}>
                <div style={{ paddingRight: 17, borderRight: `3px solid ${index === 2 ? '#df6a42' : '#587b8f'}` }}>
                  <strong style={{ display: 'block', color: '#b94e2a', fontSize: 34, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.8px' }}>{item.value}</strong>
                  <span style={{ display: 'block', marginTop: 7, color: '#142f39', fontSize: 16, fontWeight: 900 }}>{item.title}</span>
                </div>
                <div style={{ paddingLeft: 18 }}>
                  <p style={{ margin: 0, color: '#263f47', fontSize: 17, fontWeight: 800, lineHeight: 1.38 }}>{item.desc}</p>
                  <div style={{ marginTop: 6, color: '#b84f2d', fontSize: 14, fontWeight: 900 }}>{item.detail}</div>
                  <small style={{ display: 'block', marginTop: 4, color: '#4b6469', fontSize: 13, fontWeight: 800 }}>출처 · {item.source}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div style={{ marginTop: 9, color: '#40595b', fontSize: 13, fontWeight: 800 }}>
          뉴스 화면 및 자료: 해양수산부·인천광역시 관련 보도자료 재구성
        </div>
      </div>
      <div className={styles.pageNumber}>6</div>
    </div>
  );
}
