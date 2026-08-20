import styles from './presentation.module.css';

const phases = [
  {
    week: '1–2주차',
    date: '08.03 — 08.16',
    title: '기획부터 MVP까지',
    status: 'NOW',
    items: ['프로젝트 목표 설정 · 클래스 선정', '데이터셋 수집', 'Frontend · Backend · DB MVP 구축', '1차 AI 모델 학습'],
    current: true,
  },
  {
    week: '3주차',
    date: '08.17 — 08.23',
    title: '통합과 1차 검증',
    status: 'NEXT',
    items: ['MVP 기능 통합', '1차 모델 성능 점검', '부족 클래스 데이터 보강'],
  },
  {
    week: '4주차',
    date: '08.24 — 08.30',
    title: '서비스 고도화',
    status: 'PLAN',
    items: ['기능 안정화', '모델 비교 · 개선 학습', '사용 흐름과 화면 개선'],
  },
  {
    week: '5주차',
    date: '08.31 — 09.06',
    title: '최종 통합 테스트',
    status: 'PLAN',
    items: ['통합 테스트 · 오류 수정', '시연 시나리오 점검', '최종 발표자료 정리'],
  },
];

export default function ProjectTimelineSlide() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 164 }}>
        <div className={styles.chapterBadge}>Timeline · 2026.08.03 — 09.08</div>
        <h1 className={styles.slideTitle}>프로젝트 일정</h1>
        <p className={styles.slideSubtitle} style={{ marginBottom: 26, maxWidth: 1100, color: '#344e4c', fontSize: 20, fontWeight: 600 }}>
          MVP 구축을 시작으로 모델 검증과 서비스 안정화를 거쳐 최종 발표까지 완성합니다.
        </p>

        <div style={{ position: 'relative', width: '100%' }}>
          <div style={{ position: 'absolute', left: 55, right: 55, top: 28, height: 3, borderRadius: 3, background: '#c7d9d6' }} />
          <div style={{ position: 'absolute', left: 55, width: '25%', top: 28, height: 3, borderRadius: 3, background: '#e56b3f' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
            {phases.map((phase) => (
              <section key={phase.week} style={{ position: 'relative', paddingTop: 58 }}>
                <div style={{
                  position: 'absolute',
                  top: 15,
                  left: 28,
                  width: 28,
                  height: 28,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '50%',
                  border: `4px solid ${phase.current ? '#e56b3f' : '#83aaa6'}`,
                  background: '#f2f6f5',
                  boxShadow: '0 0 0 5px #f2f6f5',
                }}>
                  {phase.current && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e56b3f' }} />}
                </div>
                <article style={{
                  minHeight: 302,
                  padding: '22px 22px 20px',
                  boxSizing: 'border-box',
                  border: `1px solid ${phase.current ? 'rgba(229,107,63,0.42)' : '#cbdad8'}`,
                  borderTop: `5px solid ${phase.current ? '#e56b3f' : '#4f8581'}`,
                  borderRadius: 14,
                  background: phase.current ? 'linear-gradient(155deg, #fff 35%, #fff3ed)' : 'rgba(255,255,255,0.86)',
                  boxShadow: phase.current ? '0 15px 30px rgba(173,76,40,0.13)' : '0 10px 22px rgba(22,59,60,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: phase.current ? '#d85f36' : '#276c68', fontSize: 18, fontWeight: 850 }}>{phase.week}</span>
                    <span style={{ padding: '5px 8px', borderRadius: 5, background: phase.current ? '#e56b3f' : '#e4efed', color: phase.current ? '#fff' : '#476d6a', fontSize: 10, fontWeight: 850, letterSpacing: 1 }}>{phase.status}</span>
                  </div>
                  <div style={{ marginTop: 8, color: '#607a78', fontSize: 13, fontWeight: 750 }}>{phase.date}</div>
                  <h2 style={{ margin: '18px 0 16px', color: '#132f31', fontSize: 23, lineHeight: 1.25 }}>{phase.title}</h2>
                  <div style={{ height: 1, marginBottom: 15, background: '#dbe5e3' }} />
                  <div style={{ display: 'grid', gap: 10 }}>
                    {phase.items.map((item) => (
                      <div key={item} style={{ display: 'flex', gap: 9, color: '#294442', fontSize: 15, fontWeight: 650, lineHeight: 1.35 }}>
                        <span style={{ width: 6, height: 6, marginTop: 7, borderRadius: '50%', background: phase.current ? '#e56b3f' : '#5b928e', flexShrink: 0 }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ))}
          </div>
        </div>

      </div>
      <div className={styles.pageNumber}>4</div>
    </div>
  );
}
