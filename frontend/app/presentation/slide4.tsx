import styles from './presentation.module.css';

export default function Slide4() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content}>
        <div className={styles.chapterBadge}>Chapter 1 · 서비스</div>
        <h1 className={styles.slideTitle}>범위를 먼저 못 박는다</h1>

        <div className={styles.gridTwo} style={{ width: '100%' }}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <span className={`${styles.tag} ${styles.tagGreen}`}>이번 범위</span>
            </div>
            <ul className={styles.bulletList}>
              <li>업로드한 이미지(JPG·PNG·WEBP·BMP)와 동영상(MP4·AVI·MOV·MKV·WEBM) 분석</li>
              <li>사용자가 올린 YOLO <code>.pt</code> 모델로 detection·segmentation 자동 추론</li>
              <li>결과 영상 저장 + 프레임별 탐지 수·평균 신뢰도·클래스 분포 기록</li>
              <li>같은 미디어를 여러 모델로 돌려 기록끼리 비교</li>
              <li>계정·게시판·문의·공지까지 포함한 단일 플랫폼</li>
            </ul>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <span className={`${styles.tag} ${styles.tagOrange}`}>이번 범위 밖</span>
            </div>
            <ul className={styles.bulletList}>
              <li>드론·연안 CCTV 실시간 스트림 연계 — 최종 목표이며 현재 시연에 없다</li>
              <li>모델 학습·라벨링 — 외부(Roboflow 등)에서 학습을 끝낸 모델을 받아 쓴다</li>
              <li>정확도 지표(mAP·Precision·Recall) — 정답 라벨이 없어 계산하지 않는다</li>
              <li>GPU·다중 워커 운영 — CPU 단일 프로세스를 전제로 만들었다</li>
            </ul>
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 15, color: '#4d605e' }}>
          범위 밖 항목은 숨기지 않고 <span className={styles.highlight}>안내 챗봇 답변에도 그대로</span> 적어 두었다.
        </div>
      </div>

      <div className={styles.pageNumber}>6</div>
    </div>
  );
}
