import styles from './presentation.module.css';

const steps = [
  {
    label: '1 업로드',
    title: '모델과 미디어를 검증하며 받는다',
    desc: '확장자·크기·픽셀 수·재생 길이 검사, 파일명 정규화, 사용자 용량과 디스크 여유 확인',
  },
  {
    label: '2 대기',
    title: '단일 대기열에 넣는다',
    desc: 'max_workers=1 스레드 풀. CPU 추론이 서로 밀치지 않도록 한 건씩 처리',
  },
  {
    label: '3 추론',
    title: 'YOLO를 로드해 프레임을 돈다',
    desc: '모델의 task(detection·segmentation)와 클래스 이름을 읽어 기록, 프레임마다 탐지 결과 누적',
  },
  {
    label: '4 저장',
    title: '결과 영상과 지표를 함께 남긴다',
    desc: '박스가 그려진 출력 미디어 + 프레임 지표 + 클래스 통계를 분석 레코드에 연결',
  },
  {
    label: '5 복구',
    title: '재시작을 정상 상태로 되돌린다',
    desc: '처리 중이던 작업은 실패로 정리하고, 시작 전이던 대기 작업은 다시 대기열에 등록',
  },
];

export default function Slide6() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content}>
        <div className={styles.chapterBadge}>Chapter 2 · 구조</div>
        <h1 className={styles.slideTitle}>분석 파이프라인</h1>

        <div className={styles.timeline}>
          {steps.map((s) => (
            <div key={s.label} className={styles.timelineItem}>
              <div className={styles.timelineDot} />
              <div className={styles.timelineLabel}>{s.label}</div>
              <div className={styles.timelineText}>
                <div className={styles.timelineTextBold}>{s.title}</div>
                <div className={styles.timelineDesc}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.pageNumber}>8</div>
    </div>
  );
}
