import styles from './presentation.module.css';

const members = [
  {
    name: '이지건',
    initials: 'JK',
    position: 'TEAM LEADER',
    roles: ['조장', 'Frontend', 'Backend'],
    accent: '#087f8c',
  },
  {
    name: '노형래',
    initials: 'HR',
    position: 'VICE TEAM LEADER',
    roles: ['부조장', 'Database · Infra', '프로젝트 문서화'],
    accent: '#31979f',
  },
  {
    name: '김지영',
    initials: 'JY',
    position: 'AI ENGINEER',
    roles: ['AI 모델 설계', 'Deployment'],
    accent: '#31979f',
  },
  {
    name: '허유진',
    initials: 'YJ',
    position: 'AI ENGINEER',
    roles: ['데이터셋 구성', 'YOLOv8s Fine-tuning', 'YOLO11s Fine-tuning'],
    accent: '#31979f',
  },
  {
    name: '이승연',
    initials: 'SY',
    position: 'AI ENGINEER',
    roles: ['데이터셋 구성', 'YOLO26s Fine-tuning', 'RT-DETR-L Fine-tuning'],
    accent: '#31979f',
  },
];

export default function TeamSlide() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>
      <div className={styles.content}>
        <div className={styles.chapterBadge}>Team · 함께 만든 사람들</div>
        <h1 className={styles.slideTitle}>조원 소개</h1>
        <p className={styles.slideSubtitle} style={{ marginBottom: 26, maxWidth: 1100, color: '#344e4c', fontSize: 20, fontWeight: 600 }}>
          서비스 개발부터 AI 모델 학습까지, 각자의 전문 영역을 하나의 흐름으로 연결했습니다.
        </p>

        <div className={styles.gridFive} style={{ width: '100%' }}>
          {members.map((member) => (
            <article
              key={member.name}
              className={styles.card}
              style={{
                minHeight: 326,
                padding: '26px 24px 24px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: 66,
                  height: 66,
                  borderRadius: 18,
                  display: 'grid',
                  placeItems: 'center',
                  background: member.accent,
                  color: '#fff',
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: 1,
                  boxShadow: `0 10px 22px ${member.accent}33`,
                }}>
                  {member.initials}
                </div>
              </div>

              <div style={{ marginTop: 25 }}>
                <div style={{ color: member.accent, fontSize: 13, fontWeight: 800, letterSpacing: 1.15 }}>
                  {member.position}
                </div>
                <h2 style={{ margin: '7px 0 20px', color: '#102425', fontSize: 31, fontWeight: 800, letterSpacing: '-0.5px' }}>
                  {member.name}
                </h2>
              </div>

              <div style={{ height: 1, background: '#e56b3f', marginBottom: 16 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {member.roles.map((role) => (
                  <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#263f3d', fontSize: 16, fontWeight: 650, lineHeight: 1.35 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: member.accent, flexShrink: 0 }} />
                    {role}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.pageNumber}>3</div>
    </div>
  );
}
