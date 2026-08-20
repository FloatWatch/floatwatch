import styles from './presentation.module.css';
import { IconChart, IconFilm, IconFolder, IconLock, IconMessage, IconScan, IconSliders } from './icons';

const coreFeatures = [
  {
    no: '01',
    title: '분석 자산 등록',
    icon: <IconFilm size={29} />,
    desc: 'YOLO .pt 모델과 이미지·동영상을 업로드하고 미리보기로 입력을 확인합니다.',
    meta: 'MODEL · IMAGE · VIDEO',
  },
  {
    no: '02',
    title: 'AI 부유물 탐색',
    icon: <IconScan size={29} />,
    desc: 'Detection·Segmentation 모델을 적용해 처리 진행률과 탐지 결과 영상을 제공합니다.',
    meta: 'DETECT · SEGMENT',
  },
  {
    no: '03',
    title: '결과 기록 관리',
    icon: <IconFolder size={29} />,
    desc: '분석 상태와 결과 영상, 탐지 수·신뢰도·클래스 통계를 계정별로 보관합니다.',
    meta: 'HISTORY · STATISTICS',
  },
  {
    no: '04',
    title: 'AI 성능 비교',
    icon: <IconChart size={29} />,
    desc: '완료된 분석을 선택해 탐지 수, 평균 신뢰도, 클래스 분포와 분석 조건을 비교합니다.',
    meta: 'COUNT · CONFIDENCE · CLASS',
  },
];

export default function FeatureOverviewSlide() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 112, paddingBottom: 40 }}>
        <div className={styles.chapterBadge}>Features · 주요 기능</div>
        <h1 className={styles.slideTitle}>기능 소개</h1>
        <p className={styles.slideSubtitle} style={{ marginBottom: 20, maxWidth: 1100, color: '#344e4c', fontSize: 20, fontWeight: 700 }}>
          분석 준비부터 결과 비교와 서비스 운영까지 하나의 워크스페이스에서 연결합니다.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginBottom: 10, color: '#496b82', fontSize: 13, fontWeight: 900, letterSpacing: 1.4 }}>
          <span style={{ width: 30, height: 3, background: '#e56b3f' }} /> CORE USER JOURNEY
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, width: '100%' }}>
          <div style={{ position: 'absolute', left: '10%', right: '10%', top: 52, height: 3, background: '#c1d0d5' }} />
          {coreFeatures.map((feature, index) => (
            <article key={feature.no} style={{ position: 'relative', minHeight: 254, padding: '22px 22px 20px', boxSizing: 'border-box', border: '1px solid #c8d5d9', borderRadius: 15, background: index === 3 ? 'linear-gradient(145deg, #fff8f4, #f3e6df)' : 'linear-gradient(145deg, #fff, #edf2f4)', boxShadow: '0 11px 25px rgba(29,52,62,0.07)' }}>
              {index < coreFeatures.length - 1 && <span style={{ position: 'absolute', zIndex: 3, right: -15, top: 37, color: '#536f82', fontSize: 23, fontWeight: 900 }}>›</span>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 58, height: 58, display: 'grid', placeItems: 'center', borderRadius: 16, background: '#3f6882', color: '#fff', boxShadow: '0 9px 20px rgba(63,104,130,0.2)' }}>{feature.icon}</div>
                <span style={{ color: '#85989d', fontSize: 16, fontWeight: 900 }}>{feature.no}</span>
              </div>
              <div style={{ marginTop: 18, color: '#a84629', fontSize: 12, fontWeight: 900, letterSpacing: 1.15 }}>{feature.meta}</div>
              <h2 style={{ margin: '6px 0 10px', color: '#142f3d', fontSize: 24, fontWeight: 850 }}>{feature.title}</h2>
              <p style={{ margin: 0, color: '#29434c', fontSize: 16, fontWeight: 700, lineHeight: 1.5 }}>{feature.desc}</p>
            </article>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, width: '100%', marginTop: 18 }}>
          <section style={{ display: 'grid', gridTemplateColumns: '66px 1fr', alignItems: 'center', padding: '18px 22px', border: '1px solid #d0dcde', borderRadius: 13, background: 'rgba(255,255,255,0.76)' }}>
            <div style={{ width: 50, height: 50, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#e7eef1', color: '#3f6882' }}><IconMessage size={26} /></div>
            <div>
              <strong style={{ color: '#19343f', fontSize: 19 }}>사용자 지원·커뮤니티</strong>
              <p style={{ margin: '6px 0 0', color: '#344f55', fontSize: 16, fontWeight: 750 }}>공지사항 · 자유게시판 · FAQ · 비공개 1:1 문의 · 안내 챗봇</p>
            </div>
          </section>
          <section style={{ display: 'grid', gridTemplateColumns: '66px 1fr', alignItems: 'center', padding: '18px 22px', border: '1px solid #d0dcde', borderRadius: 13, background: 'rgba(255,255,255,0.76)' }}>
            <div style={{ width: 50, height: 50, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#e7eef1', color: '#3f6882' }}><IconLock size={26} /></div>
            <div>
              <strong style={{ color: '#19343f', fontSize: 19 }}>계정·관리자 운영</strong>
              <p style={{ margin: '6px 0 0', color: '#344f55', fontSize: 16, fontWeight: 750 }}>회원 권한·상태 · 전체 분석 로그 · 문의 답변 · 관리자 감사 로그</p>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 13, color: '#354f52', fontSize: 15, fontWeight: 750 }}>
          <IconSliders size={19} /> 분석 자산은 계정별로 보호되며, 실행 중인 분석은 화면을 닫아도 백그라운드에서 계속됩니다.
        </div>
      </div>
      <div className={styles.pageNumber}>8</div>
    </div>
  );
}
