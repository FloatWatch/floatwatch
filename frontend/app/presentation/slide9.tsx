import styles from './presentation.module.css';

export default function Slide9() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content}>
        <div className={styles.chapterBadge}>Chapter 3 · 신뢰성</div>
        <h1 className={styles.slideTitle}>업로드는 신뢰하지 않는 입력이다</h1>

        <div className={styles.gridTwo} style={{ width: '100%' }}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>파일과 경로</div>
            <ul className={styles.bulletList}>
              <li>업로드 파일명을 NFC 정규화하고 경로 구분자·제어문자·Windows 예약어(CON·PRN·COM1…)를 치환</li>
              <li>모든 접근 경로를 스토리지 루트 안으로 강제해 상위 디렉터리 이탈을 차단</li>
              <li>확장자와 크기는 등록 단계에서 검사 — 미디어 최대 2GB</li>
            </ul>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>자원 한도 (환경변수로 조정)</div>
            <ul className={styles.bulletList}>
              <li>사용자 저장공간 기본 5GB — <code>USER_STORAGE_LIMIT_BYTES</code></li>
              <li>미디어 최대 4K 픽셀 수 · 60분 — <code>MAX_MEDIA_PIXELS</code>, <code>MAX_VIDEO_DURATION_SECONDS</code></li>
              <li>디스크 예약 512MB, 분석은 원본의 3배를 예상 — <code>MIN_FREE_DISK_BYTES</code>, <code>ANALYSIS_DISK_MULTIPLIER</code></li>
            </ul>
          </div>
        </div>

        <div className={styles.card} style={{ marginTop: 26, width: 1320, boxSizing: 'border-box', borderColor: '#e67e22' }}>
          <div className={styles.cardTitle} style={{ marginBottom: 10 }}>
            <span className={`${styles.tag} ${styles.tagOrange}`}>남은 위험</span>
            &nbsp;.pt 파일은 파이썬 객체를 포함할 수 있다
          </div>
          <div style={{ fontSize: 15, color: '#4d605e', lineHeight: 1.7 }}>
            확장자·크기 검사는 하지만 <b>임의의 .pt를 안전한 모델로 판별하지는 못한다</b>.
            그래서 로드에 실패한 모델은 <span className={styles.highlight}>격리 폴더로 옮기고 사유·시각과 함께 격리 표시</span>를 남겨 재사용을 막는다.
            외부 공개 시에는 추론 전용 계정이나 격리된 실행 환경이 필요하다.
          </div>
        </div>
      </div>

      <div className={styles.pageNumber}>12</div>
    </div>
  );
}
