import styles from './presentation.module.css';
import { IconBolt, IconDatabase, IconFolder, IconScan, IconTriangle } from './icons';

const layers = [
  {
    no: '01',
    label: 'CLIENT',
    title: 'Frontend',
    stack: 'Next.js · TypeScript',
    desc: '서비스 화면과 모델별 결과 시각화',
    icon: <IconTriangle size={28} />,
  },
  {
    no: '02',
    label: 'APPLICATION',
    title: 'Backend API',
    stack: 'FastAPI · SQLAlchemy',
    desc: '인증·분석 자산·4개 모델 분석 묶음 처리',
    icon: <IconBolt size={28} />,
  },
  {
    no: '03',
    label: 'AI ENGINE',
    title: 'Inference',
    stack: 'Ultralytics · OpenCV',
    desc: '4개 대표 모델 추론·바운딩 박스 생성',
    icon: <IconScan size={28} />,
  },
  {
    no: '04',
    label: 'DATA',
    title: 'Storage',
    stack: 'SQLite · File Storage',
    desc: '계정·대표 PT·미디어·분석 결과 저장',
    icon: <IconDatabase size={28} />,
  },
];

const pipeline = [
  ['PREPARE', '대표 PT·미디어 준비'],
  ['VALIDATE', '모델·미디어 검증'],
  ['INFERENCE', '등록 모델 순차 추론'],
  ['RECORD', '모델별 결과·지표 저장'],
];

export default function Slide5() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 132, paddingBottom: 36 }}>
        <div className={styles.chapterBadge}>Architecture · 시스템 구조</div>
        <h1 className={styles.slideTitle}>시스템 아키텍처</h1>
        <p className={styles.slideSubtitle} style={{ marginBottom: 20, maxWidth: 1100, color: '#344e4c', fontSize: 20, fontWeight: 700 }}>
          사용자 요청이 화면에서 시작해 API·AI 추론을 거쳐 결과 데이터로 돌아오는 구조입니다.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginBottom: 10, color: '#496b82', fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}>
          <span style={{ width: 30, height: 3, background: '#e56b3f' }} /> REQUEST &amp; DATA FLOW
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, width: '100%' }}>
          <div style={{ position: 'absolute', left: '11%', right: '11%', top: 48, height: 3, borderRadius: 3, background: '#bccbd1' }} />
          {layers.map((layer, index) => (
            <article key={layer.no} style={{ position: 'relative', minHeight: 228, padding: '23px 23px 21px', boxSizing: 'border-box', border: '1px solid #c8d5d9', borderRadius: 15, background: 'linear-gradient(145deg, #fff, #edf2f4)', boxShadow: '0 11px 25px rgba(29,52,62,0.07)' }}>
              {index < layers.length - 1 && <span style={{ position: 'absolute', zIndex: 3, right: -20, top: 34, width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: '4px solid #f2f6f5', borderRadius: 18, background: '#536f82', color: '#fff' }}><svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true"><path d="M2 7h15M12 2l5 5-5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 58, height: 58, display: 'grid', placeItems: 'center', borderRadius: 16, background: '#3f6882', color: '#fff', boxShadow: '0 9px 20px rgba(63,104,130,0.2)' }}>{layer.icon}</div>
                <span style={{ color: '#809499', fontSize: 15, fontWeight: 850 }}>{layer.no}</span>
              </div>
              <div style={{ marginTop: 17, color: '#496b82', fontSize: 13, fontWeight: 900, letterSpacing: 1.25 }}>{layer.label}</div>
              <h2 style={{ margin: '5px 0 8px', color: '#142f3d', fontSize: 26 }}>{layer.title}</h2>
              <div style={{ color: '#b9502e', fontSize: 16, fontWeight: 850 }}>{layer.stack}</div>
              <p style={{ margin: '9px 0 0', color: '#304850', fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>{layer.desc}</p>
            </article>
          ))}
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: '190px 1fr', alignItems: 'center', width: '100%', marginTop: 20, padding: '18px 22px', boxSizing: 'border-box', borderRadius: 13, background: '#263f50', color: '#fff' }}>
          <div>
            <div style={{ color: '#ed916f', fontSize: 12, fontWeight: 900, letterSpacing: 1.4 }}>ANALYSIS FLOW</div>
            <strong style={{ display: 'block', marginTop: 5, fontSize: 20 }}>분석 파이프라인</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {pipeline.map(([label, desc], index) => (
              <div key={label} style={{ position: 'relative', padding: '0 22px', borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ color: '#b9d5e3', fontSize: 12, fontWeight: 900, letterSpacing: 1.2 }}>{label}</div>
                <div style={{ marginTop: 5, color: '#fff', fontSize: 17, fontWeight: 800 }}>{desc}</div>
                {index < pipeline.length - 1 && <span style={{ position: 'absolute', right: -5, top: 7, color: '#ed916f', fontSize: 19 }}>›</span>}
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 13, color: '#354f52', fontSize: 15, fontWeight: 750 }}>
          <IconFolder size={19} /> 파일 스토리지에는 모델·미디어·결과 파일을, SQLite에는 계정·대표 PT·분석 묶음과 지표를 저장합니다.
        </div>
      </div>
      <div className={styles.pageNumber}>7</div>
    </div>
  );
}
