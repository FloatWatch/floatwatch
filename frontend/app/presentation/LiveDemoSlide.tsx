import styles from './presentation.module.css';

const demoSteps = [
  ['01', '미디어 업로드', '분석할 이미지 또는 영상 등록'],
  ['02', '4개 모델 분석', '같은 미디어를 모델별로 일괄 분석'],
  ['03', '결과 비교', '탐지 결과와 성능 지표 확인'],
  ['04', '실시간 탐지', '카메라 탐지와 기록 기능 확인'],
];

export default function LiveDemoSlide() {
  return <div className={styles.slide}>
    <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>
    <div className={styles.content} style={{justifyContent:'flex-start',paddingTop:112,paddingBottom:46}}>
      <div className={styles.chapterBadge}>Live Demo · 서비스 직접 시연</div>
      <h1 className={styles.slideTitle} style={{marginBottom:0}}>직접 시연으로 보여드리겠습니다</h1>
      <p className={styles.slideSubtitle} style={{margin:'11px 0 0',maxWidth:1080,color:'#344e4c',fontSize:20,fontWeight:700}}>별도의 시연 영상 대신 실제 구현된 서비스 화면에서 핵심 기능을 순서대로 확인합니다.</p>

      <section style={{display:'flex',flexDirection:'column',justifyContent:'center',width:'100%',height:430,marginTop:32,padding:'42px 52px',boxSizing:'border-box',borderTop:'1px solid #bfcfd2',borderBottom:'1px solid #bfcfd2',background:'rgba(255,255,255,.54)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,color:'#397773',fontSize:14,fontWeight:900,letterSpacing:1.1}}><span style={{width:9,height:9,borderRadius:'50%',background:'#4aa59e'}}/>LIVE DEMONSTRATION</div>
        <h2 style={{margin:'14px 0 34px',color:'#18353d',fontSize:31}}>시연 진행 순서</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0}}>
          {demoSteps.map(([no,title,desc],index)=><div key={no} style={{position:'relative',minHeight:145,padding:'10px 30px 8px',borderLeft:index===0?'none':'1px solid #cad7d9'}}>
            <span style={{display:'block',color:'#d65d36',fontSize:13,fontWeight:950,letterSpacing:1}}>{no}</span>
            <strong style={{display:'block',marginTop:16,color:'#193740',fontSize:22}}>{title}</strong>
            <span style={{display:'block',marginTop:10,color:'#587176',fontSize:14,fontWeight:750,lineHeight:1.5}}>{desc}</span>
          </div>)}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:28,paddingTop:20,borderTop:'1px solid #d0dcde'}}><span style={{color:'#506a70',fontSize:15,fontWeight:800}}>발표 화면을 실제 서비스로 전환해 진행합니다.</span><strong style={{color:'#315d76',fontSize:15}}>예상 소요 시간 · 약 3~5분</strong></div>
      </section>
    </div>
    <div className={styles.pageNumber}>12</div>
  </div>;
}
