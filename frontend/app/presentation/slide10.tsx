import styles from './presentation.module.css';

const steps = [
  { label: 'create', title: '백업 만들기', desc: 'SQLite DB와 스토리지 파일을 한 아카이브로 묶고, 파일 목록과 해시를 함께 기록' },
  { label: 'verify', title: '검증하기', desc: '아카이브를 풀어 기록된 해시와 실제 파일을 대조 — 복원 전에 손상 여부를 먼저 확인' },
  { label: 'restore', title: '복원하기', desc: '확인 문구를 입력해야 실행. SQLite 사이드카(-wal·-shm)를 정리한 뒤 되돌린다' },
];

export default function Slide10() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content}>
        <div className={styles.chapterBadge}>Chapter 3 · 신뢰성</div>
        <h1 className={styles.slideTitle}>백업과 복구는 CLI로 분리했다</h1>
        <p className={styles.slideSubtitle}>
          분석 결과는 DB 레코드와 미디어 파일이 짝을 이룬다. 둘 중 하나만 되돌리면 기록이 깨지므로
          <b> 같은 아카이브에 함께 담는다.</b>
        </p>

        <div className={styles.gridThree} style={{ width: '100%' }}>
          {steps.map((s) => (
            <div key={s.label} className={styles.card}>
              <div style={{
                display: 'inline-block',
                background: '#087f8c',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'monospace',
                marginBottom: 14,
              }}>
                {s.label}
              </div>
              <div className={styles.cardTitle} style={{ marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 15, color: '#647976', lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 26, fontSize: 15, color: '#4d605e' }}>
          복원은 되돌릴 수 없는 작업이라 <span className={styles.highlight}>확인 문구 입력을 강제</span>한다.
          운영 명령은 <code>BACKUP_RESTORE.md</code>에 정리돼 있다.
        </div>
      </div>

      <div className={styles.pageNumber}>13</div>
    </div>
  );
}
