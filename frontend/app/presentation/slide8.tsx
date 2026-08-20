import styles from './presentation.module.css';
import { IconKey, IconCookie, IconLink, IconReceipt } from './icons';

const items = [
  {
    icon: <IconKey />,
    title: '비밀번호',
    desc: 'PBKDF2-HMAC-SHA256 310,000회 + 계정별 랜덤 솔트. 검증은 hmac.compare_digest로 상수 시간 비교.',
  },
  {
    icon: <IconCookie />,
    title: '세션',
    desc: '랜덤 토큰을 HttpOnly 쿠키로 내리고 서버에는 SHA-256 다이제스트만 저장. 유효기간 7일.',
  },
  {
    icon: <IconLink />,
    title: '소셜 로그인',
    desc: 'OAuth 제공자 신원을 별도 테이블로 분리해 하나의 계정에 연결.',
  },
  {
    icon: <IconReceipt />,
    title: '감사 로그',
    desc: '관리자 행위를 audit_logs에 남기고 관리자 화면에서 조회.',
  },
];

export default function Slide8() {
  return (
    <div className={styles.slide}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span>
      </div>

      <div className={styles.content}>
        <div className={styles.chapterBadge}>Chapter 3 · 신뢰성</div>
        <h1 className={styles.slideTitle}>계정과 세션</h1>

        <div className={styles.gridFour} style={{ width: '100%' }}>
          {items.map((i) => (
            <div key={i.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{i.icon}</div>
              <div className={styles.featureTitle}>{i.title}</div>
              <div className={styles.featureDesc}>{i.desc}</div>
            </div>
          ))}
        </div>

        <div className={styles.card} style={{ marginTop: 30, width: 1320, boxSizing: 'border-box' }}>
          <div className={styles.cardTitle}>토큰을 원문으로 저장하지 않는 이유</div>
          <div style={{ fontSize: 15, color: '#4d605e', lineHeight: 1.7 }}>
            DB가 통째로 유출돼도 저장된 다이제스트로는 쿠키를 만들 수 없다.
            비밀번호와 세션 토큰 모두 <span className={styles.highlight}>되돌릴 수 없는 형태</span>로만 남긴다.
          </div>
        </div>
      </div>

      <div className={styles.pageNumber}>11</div>
    </div>
  );
}
