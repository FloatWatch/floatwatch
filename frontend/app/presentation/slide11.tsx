import styles from './presentation.module.css';

const stats = [
  { num: '45', unit: '개', label: 'REST 엔드포인트' },
  { num: '14', unit: '개', label: 'DB 테이블' },
  { num: '18', unit: '개', label: '백엔드 테스트' },
  { num: '4,900', unit: '줄', label: '애플리케이션 코드' },
];

export default function Slide11() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content}>
        <div className={styles.chapterBadge}>Chapter 4 · 현황</div>
        <h1 className={styles.slideTitle}>구현 현황</h1>

        <div className={styles.gridFour} style={{ width: '100%' }}>
          {stats.map((s) => (
            <div key={s.label} className={`${styles.card} ${styles.statBox}`}>
              <div className={styles.statNumber}>
                {s.num}<span className={styles.statUnit}> {s.unit}</span>
              </div>
              <div className={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className={styles.gridTwo} style={{ width: '100%', marginTop: 34 }}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>도메인 모델</div>
            <div style={{ fontSize: 15, color: '#4d605e', lineHeight: 1.8 }}>
              사용자·세션·OAuth 신원·감사 로그 / 모델 아티팩트·미디어·분석·프레임 지표·클래스 통계 /
              게시글·첨부·댓글·1:1 문의·문의 첨부
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>테스트 범위</div>
            <div style={{ fontSize: 15, color: '#4d605e', lineHeight: 1.8 }}>
              API 테스트는 <b>운영 데이터와 분리된 임시 SQLite·임시 스토리지</b>에서 돈다.
              백업·복구 경로는 별도 테스트로 검증한다.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22, fontSize: 14, color: '#647976' }}>
          수치는 <code>backend/app</code>·<code>frontend</code> 소스 기준 집계(2026-08-13). 코드 줄 수는 의존성·빌드 산출물 제외.
        </div>
      </div>

      <div className={styles.pageNumber}>14</div>
    </div>
  );
}
