import styles from './presentation.module.css';
import { IconChart, IconFilm, IconFolder, IconLock, IconMessage, IconScan, IconSliders } from './icons';

const uploadFeatures=[
 {no:'01',title:'대표 모델·미디어 관리',icon:<IconFilm size={24}/>,meta:'MODEL & MEDIA',desc:['4개 모델별 대표 PT 지정','분석 이미지·동영상 등록']},
 {no:'02',title:'4개 모델 일괄 분석',icon:<IconScan size={24}/>,meta:'4 MODELS · ONE MEDIA',desc:['동일 미디어로 모델 일괄 분석','미등록 모델 제외 후 분석 계속']},
 {no:'03',title:'모델별 결과 확인',icon:<IconFolder size={24}/>,meta:'BOUNDING BOX · CLASS',desc:['모델 탭별 바운딩 박스 확인','클래스별 탐지 수·신뢰도 비교']},
 {no:'04',title:'기록·결과 비교',icon:<IconChart size={24}/>,meta:'HISTORY · METRICS',desc:['분석 결과 묶음 저장·재조회','탐지 수·신뢰도·속도 비교']},
];

const liveFeatures=[
 {no:'01',title:'카메라·위치 연동',icon:<IconFilm size={24}/>,meta:'CAMERA · LOCATION',desc:['브라우저 카메라 연결','관측 지점·위치 정보 등록']},
 {no:'02',title:'탐지 모델 선택',icon:<IconFolder size={24}/>,meta:'LIVE AI MODEL',desc:['등록된 적용 모델 선택','탐지 클래스·준비 상태 확인']},
 {no:'03',title:'실시간 AI 탐지',icon:<IconScan size={24}/>,meta:'LIVE INFERENCE',desc:['카메라 프레임 실시간 추론','클래스·신뢰도·바운딩 박스 확인']},
 {no:'04',title:'세션·이벤트 기록',icon:<IconChart size={24}/>,meta:'SESSION · EVENTS',desc:['탐지 시간·위치·클래스 저장','신뢰도·증거 이미지 기록 확인']},
];

const Arrow=()=> <span style={{position:'absolute',zIndex:3,right:-17,top:25,width:34,height:27,display:'flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',border:'3px solid #f2f6f5',borderRadius:15,background:'#536f82',color:'#fff'}}><svg width="17" height="12" viewBox="0 0 20 14" fill="none"><path d="M2 7h15M12 2l5 5-5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;

export default function FeatureOverviewSlide(){return <div className={styles.slide}>
 <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>
 <div className={styles.content} style={{justifyContent:'flex-start',paddingTop:88,paddingBottom:24}}>
  <div className={styles.chapterBadge}>Features · 주요 기능</div>
  <h1 className={styles.slideTitle} style={{marginBottom:0}}>기능 소개</h1>
  <p className={styles.slideSubtitle} style={{margin:'8px 0 13px',maxWidth:1240,color:'#344e4c',fontSize:17,fontWeight:700}}>미디어 업로드 기반의 4개 모델 비교 분석과 브라우저 카메라 기반 실시간 탐지를 두 가지 흐름으로 제공합니다.</p>

  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',marginBottom:7}}><div style={{display:'flex',alignItems:'center',gap:9,color:'#496b82',fontSize:13,fontWeight:900,letterSpacing:1.1}}><span style={{width:27,height:3,background:'#e56b3f'}}/>01 · UPLOAD ANALYSIS <b style={{color:'#203e48',fontSize:14}}>업로드 기반 분석</b></div><span style={{color:'#526b71',fontSize:11.5,fontWeight:800}}>하나의 미디어를 4개 대표 모델로 비교</span></div>
  <div style={{position:'relative',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,width:'100%'}}>
   <div style={{position:'absolute',left:'10%',right:'10%',top:38,height:2,background:'#c1d0d5'}}/>
   {uploadFeatures.map((f,i)=><article key={f.no} style={{position:'relative',height:172,padding:'13px 17px 11px',boxSizing:'border-box',border:'1px solid #c8d5d9',borderRadius:14,background:'linear-gradient(145deg,#fff,#edf2f4)',boxShadow:'0 8px 20px rgba(29,52,62,.07)'}}>
    {i<uploadFeatures.length-1&&<Arrow/>}<div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><div style={{width:45,height:45,display:'grid',placeItems:'center',borderRadius:13,background:'#3f6882',color:'#fff',boxShadow:'0 7px 16px rgba(63,104,130,.18)'}}>{f.icon}</div><span style={{color:'#85989d',fontSize:13,fontWeight:900}}>{f.no}</span></div>
    <div style={{marginTop:10,color:'#a84629',fontSize:11,fontWeight:900,letterSpacing:.75}}>{f.meta}</div><h2 style={{margin:'3px 0 6px',color:'#142f3d',fontSize:19,fontWeight:850}}>{f.title}</h2>
    <ul style={{display:'grid',gap:4,margin:0,padding:0,listStyle:'none',color:'#29434c',fontSize:13.5,fontWeight:800,lineHeight:1.32}}>{f.desc.map(t=><li key={t} style={{display:'grid',gridTemplateColumns:'6px 1fr',gap:7}}><span style={{width:5,height:5,marginTop:6,borderRadius:'50%',background:'#5a7c8f'}}/>{t}</li>)}</ul>
   </article>)}
  </div>

  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',margin:'14px 0 7px'}}><div style={{display:'flex',alignItems:'center',gap:9,color:'#496b82',fontSize:13,fontWeight:900,letterSpacing:1.1}}><span style={{width:27,height:3,background:'#e56b3f'}}/>02 · REAL-TIME DETECTION <b style={{color:'#203e48',fontSize:14}}>실시간 탐지</b></div><span style={{color:'#526b71',fontSize:11.5,fontWeight:800}}>카메라 탐지 결과를 세션별로 기록</span></div>
  <div style={{position:'relative',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,width:'100%'}}>
   <div style={{position:'absolute',left:'10%',right:'10%',top:38,height:2,background:'#c1d0d5'}}/>
   {liveFeatures.map((f,i)=><article key={f.no} style={{position:'relative',height:172,padding:'13px 17px 11px',boxSizing:'border-box',border:'1px solid #c8d5d9',borderRadius:14,background:'linear-gradient(145deg,#fff,#edf2f4)',boxShadow:'0 8px 20px rgba(29,52,62,.07)'}}>
    {i<liveFeatures.length-1&&<Arrow/>}<div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><div style={{width:45,height:45,display:'grid',placeItems:'center',borderRadius:13,background:'#3f6882',color:'#fff',boxShadow:'0 7px 16px rgba(63,104,130,.18)'}}>{f.icon}</div><span style={{color:'#85989d',fontSize:13,fontWeight:900}}>{f.no}</span></div>
    <div style={{marginTop:9,color:'#a84629',fontSize:11,fontWeight:900,letterSpacing:.75}}>{f.meta}</div><h3 style={{margin:'2px 0 5px',color:'#142f3d',fontSize:19,fontWeight:850}}>{f.title}</h3>
    <ul style={{display:'grid',gap:4,margin:0,padding:0,listStyle:'none',color:'#29434c',fontSize:13.5,fontWeight:800,lineHeight:1.3}}>{f.desc.map(t=><li key={t} style={{display:'grid',gridTemplateColumns:'6px 1fr',gap:7}}><span style={{width:5,height:5,marginTop:5,borderRadius:'50%',background:'#5a7c8f'}}/>{t}</li>)}</ul>
   </article>)}
  </div>

  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,width:'100%',marginTop:13}}>
   <section style={{display:'flex',alignItems:'center',gap:11,padding:'8px 14px',border:'1px solid #d0dcde',borderRadius:11,background:'rgba(255,255,255,.78)'}}><div style={{width:34,height:34,display:'grid',placeItems:'center',borderRadius:10,background:'#e7eef1',color:'#3f6882'}}><IconMessage size={18}/></div><div><strong style={{color:'#19343f',fontSize:14}}>사용자 지원·커뮤니티</strong><p style={{margin:'2px 0 0',color:'#3f575d',fontSize:11,fontWeight:800}}>공지사항 · 자유게시판 · FAQ · 1:1 문의 · 안내 챗봇</p></div></section>
   <section style={{display:'flex',alignItems:'center',gap:11,padding:'8px 14px',border:'1px solid #d0dcde',borderRadius:11,background:'rgba(255,255,255,.78)'}}><div style={{width:34,height:34,display:'grid',placeItems:'center',borderRadius:10,background:'#e7eef1',color:'#3f6882'}}><IconLock size={18}/></div><div><strong style={{color:'#19343f',fontSize:14}}>계정·관리자 운영</strong><p style={{margin:'2px 0 0',color:'#3f575d',fontSize:11,fontWeight:800}}>회원 권한·상태 · 분석 로그 · 문의 답변 · 관리자 감사 로그</p></div></section>
  </div>
  <div style={{display:'flex',alignItems:'center',gap:8,width:'100%',marginTop:8,color:'#344e53',fontSize:11,fontWeight:800}}><IconSliders size={15}/>업로드 분석과 실시간 탐지 기록은 계정별로 보호되며, 각 기록 화면에서 다시 확인할 수 있습니다.</div>
 </div><div className={styles.pageNumber}>8</div>
 </div>}
