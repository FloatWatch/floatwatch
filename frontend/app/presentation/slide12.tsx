import styles from './presentation.module.css';
import { IconBolt, IconChart, IconScan } from './icons';

const roadmap = [
  {
    phase: 'STEP 01',
    period: '단기 · 모델 고도화',
    title: '더 정확한 탐지',
    icon: <IconChart size={30} />,
    items: ['주차별 2·3·4차 Fine-tuning', '취약 클래스 데이터 보강', '증강·하이퍼파라미터 최적화'],
    result: '최적 모델 선정',
  },
  {
    phase: 'STEP 02',
    period: '중기 · 운영 확장',
    title: '더 빠르고 안정적인 분석',
    icon: <IconBolt size={30} />,
    items: ['GPU 추론 환경 전환', '외부 큐 기반 다중 워커', '격리된 모델 실행·자동 복구'],
    result: '대용량 동시 처리',
  },
  {
    phase: 'STEP 03',
    period: '장기 · 현장 연계',
    title: '실시간 해양 관측',
    icon: <IconScan size={30} />,
    items: ['드론·연안 CCTV 스트림 연계', '위치·시간대별 발생 패턴 분석', '관제 알림과 수거 경로 지원'],
    result: '예측형 대응 체계',
  },
];

export default function Slide12() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 108, paddingBottom: 44 }}>
        <div className={styles.chapterBadge}>Future · 확장 로드맵</div>
        <h1 className={styles.slideTitle}>향후 확장 계획</h1>
        <p className={styles.slideSubtitle} style={{ marginBottom: 26, maxWidth: 1120, color: '#344e4c', fontSize: 20, fontWeight: 700 }}>
          1차 학습과 MVP를 출발점으로, 정확도·처리 규모·현장 연결성을 단계적으로 확장합니다.
        </p>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, width: '100%' }}>
          <div style={{ position: 'absolute', left: '14%', right: '14%', top: 47, height: 3, borderRadius: 3, background: '#bfced2' }} />
          {roadmap.map((item, index) => (
            <article key={item.phase} style={{ position: 'relative', minHeight: 330, padding: '25px 25px 22px', boxSizing: 'border-box', border: '1px solid #c8d5d9', borderRadius: 16, background: index === 2 ? 'linear-gradient(150deg, #fff7f2, #f1e5df)' : 'linear-gradient(150deg, #fff, #eaf0f2)', boxShadow: '0 13px 29px rgba(29,52,62,0.08)' }}>
              {index < roadmap.length - 1 && <span style={{ position: 'absolute', zIndex: 3, right: -21, top: 33, width: 42, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: '5px solid #f2f6f5', borderRadius: 19, background: '#536f82', color: '#fff' }}><svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true"><path d="M2 7h15M12 2l5 5-5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 62, height: 62, display: 'grid', placeItems: 'center', borderRadius: 17, background: index === 2 ? '#d8663f' : '#3f6882', color: '#fff', boxShadow: '0 9px 20px rgba(49,82,101,0.2)' }}>{item.icon}</div>
                <span style={{ color: index === 2 ? '#c25431' : '#496b82', fontSize: 13, fontWeight: 900, letterSpacing: 1.3 }}>{item.phase}</span>
              </div>
              <div style={{ marginTop: 20, color: index === 2 ? '#c25431' : '#496b82', fontSize: 14, fontWeight: 900 }}>{item.period}</div>
              <h2 style={{ margin: '7px 0 17px', color: '#142f3d', fontSize: 27 }}>{item.title}</h2>
              <div style={{ display: 'grid', gap: 11 }}>
                {item.items.map((text) => <div key={text} style={{ display: 'grid', gridTemplateColumns: '8px 1fr', gap: 10, color: '#304a51', fontSize: 16, fontWeight: 750, lineHeight: 1.4 }}><span style={{ width: 7, height: 7, marginTop: 7, borderRadius: '50%', background: index === 2 ? '#e56b3f' : '#5a7c8f' }} />{text}</div>)}
              </div>
              <div style={{ position: 'absolute', left: 25, right: 25, bottom: 20, paddingTop: 13, borderTop: '1px solid #cbd7da', color: '#193742', fontSize: 16, fontWeight: 900 }}>목표 · {item.result}</div>
            </article>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 17, width: '100%', marginTop: 22, padding: '17px 22px', boxSizing: 'border-box', borderRadius: 12, background: '#263f50', color: '#fff' }}>
          <span style={{ color: '#ed916f', fontSize: 13, fontWeight: 900, letterSpacing: 1.3 }}>VISION</span>
          <span style={{ width: 1, height: 23, background: 'rgba(255,255,255,0.25)' }} />
          <strong style={{ fontSize: 20 }}>업로드 기반 분석 도구에서 실시간 해양 관측·대응 플랫폼으로</strong>
        </div>
      </div>
      <div className={styles.pageNumber}>10</div>
    </div>
  );
}
