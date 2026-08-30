'use client';

import { useMemo, useRef, useState } from 'react';
import styles from './presentation.module.css';

type Model={name:string;color:string;diagonal:number[];errors:[number,number,number][]};
type Point={x:number;y:number;z:number;model:string;color:string;label:string};
const codes=['GL','ME','NE','PET','PB','PBC','PE','RO','SBX','SBY','SP'];
const names=['Glass','Metal','Net','PET Bottle','Plastic Buoy','Plastic Buoy (China)','Plastic ETC','Rope','Styrofoam Box','Styrofoam Buoy','Styrofoam Piece'];
const models:Model[]=[
 {name:'YOLOv8s',color:'#12bfb4',diagonal:[.85,.80,.94,.78,.87,.91,.78,.93,.79,.92,.72],errors:[[8,10,.16]]},
 {name:'YOLO11s',color:'#438df5',diagonal:[.83,.75,.95,.75,.84,.89,.74,.94,.70,.90,.70],errors:[[8,10,.23],[10,8,.12]]},
 {name:'YOLO26s',color:'#f2a916',diagonal:[.87,.81,.95,.78,.89,.93,.78,.94,.84,.94,.76],errors:[[8,10,.11]]},
 {name:'RT-DETR-L',color:'#ee4b8b',diagonal:[.95,.93,.91,.88,.94,.98,.88,.87,.93,.95,.82],errors:[]},
];

const graphPoints:Point[]=models.flatMap((m,mi)=>[
 ...m.diagonal.map((z,i)=>({x:i,y:i,z,model:m.name,color:m.color,label:`${codes[i]} → ${codes[i]}`})),
 ...m.errors.map(([x,y,z])=>({x:x+(mi-1.5)*.035,y:y+(mi-1.5)*.035,z,model:m.name,color:m.color,label:`${codes[x]} → ${codes[y]}`})),
]);

const corners:[number,number,number][]=[[0,0,0],[10,0,0],[0,10,0],[10,10,0],[0,0,1],[10,0,1],[0,10,1],[10,10,1]];
const edges=[[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]];
const initialRotation={x:-58,y:38};
const verticalRotationRange={min:-130,max:-38};
// 점과 XY 바닥면을 잇는 투영 보조선입니다. 다시 표시하려면 true로 변경합니다.
const showProjectionLines=false;
const zoomToLevel=(zoom:number)=>zoom<=1?((zoom-.58)/(1-.58))*50:50+((zoom-1)/(2.35-1))*50;
const levelToZoom=(level:number)=>level<=50?.58+(level/50)*(1-.58):1+((level-50)/50)*(2.35-1);

export default function AiConfusion3DSlide(){
 const [rotation,setRotation]=useState(initialRotation);
 const [zoom,setZoom]=useState(1);
 const [hover,setHover]=useState<Point|null>(null);
 const [selected,setSelected]=useState<Point|null>(null);
 const drag=useRef<{x:number;y:number;rx:number;ry:number}|null>(null);
 const zoomSliderDragging=useRef(false);
 const project=(x:number,y:number,z:number)=>{
  const px=(x-5)*31, py=(y-5)*31, pz=(z-.5)*255;
  const ay=rotation.y*Math.PI/180, ax=rotation.x*Math.PI/180;
  const x1=px*Math.cos(ay)+py*Math.sin(ay), y1=-px*Math.sin(ay)+py*Math.cos(ay);
  const y2=y1*Math.cos(ax)-pz*Math.sin(ax), depth=y1*Math.sin(ax)+pz*Math.cos(ax);
  const perspective=690/(690+depth);
  return {x:405+x1*perspective*zoom,y:246+y2*perspective*zoom,depth};
 };
 const projected=useMemo(()=>graphPoints.map(p=>({...p,screen:project(p.x,p.y,p.z)})).sort((a,b)=>b.screen.depth-a.screen.depth),[rotation,zoom]);
 const pc=corners.map(c=>project(...c));
 const axisOrigin=project(0,0,0), axisX=project(10,0,0), axisY=project(0,10,0), axisZ=project(0,0,1);
 const zoomLevel=Math.max(0,Math.min(100,zoomToLevel(zoom)));
 const down=(e:React.PointerEvent<SVGSVGElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,rx:rotation.x,ry:rotation.y};e.stopPropagation()};
 const move=(e:React.PointerEvent<SVGSVGElement>)=>{if(!drag.current)return;const nextX=drag.current.rx+(e.clientY-drag.current.y)*.35,nextY=drag.current.ry+(e.clientX-drag.current.x)*.35;setRotation({x:Math.max(verticalRotationRange.min,Math.min(verticalRotationRange.max,nextX)),y:Math.max(-110,Math.min(200,nextY))});e.stopPropagation()};
 const up=(e:React.PointerEvent<SVGSVGElement>)=>{drag.current=null;e.stopPropagation()};
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{e.preventDefault();e.stopPropagation();setZoom(v=>Math.max(.58,Math.min(2.35,v-e.deltaY*.0014)))};
 const updateZoomFromTrack=(e:React.PointerEvent<HTMLDivElement>)=>{const rect=e.currentTarget.getBoundingClientRect(),inset=8,usable=rect.height-inset*2,ratio=Math.max(0,Math.min(1,(rect.bottom-inset-e.clientY)/usable));setZoom(Number(levelToZoom(ratio*100).toFixed(3)))};
 const zoomTrackDown=(e:React.PointerEvent<HTMLDivElement>)=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);zoomSliderDragging.current=true;e.currentTarget.style.cursor='grabbing';updateZoomFromTrack(e)};
 const zoomTrackMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(!zoomSliderDragging.current)return;e.stopPropagation();updateZoomFromTrack(e)};
 const zoomTrackUp=(e:React.PointerEvent<HTMLDivElement>)=>{zoomSliderDragging.current=false;e.currentTarget.style.cursor='grab';e.stopPropagation()};
 const activePoint=hover??selected;
 return <div className={styles.slide}>
  <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>
  <div className={styles.content} style={{justifyContent:'flex-start',paddingTop:88,paddingBottom:28}}>
   <div className={styles.chapterBadge}>AI Report C · Final PT 3D Comparison</div>
   <h1 className={styles.slideTitle} style={{marginBottom:0}}>최종 PT 기준 4개 모델 3D 비교</h1>
   <p className={styles.slideSubtitle} style={{margin:'7px 0 12px',maxWidth:1320,color:'#344e4c',fontSize:17,fontWeight:700}}>YOLOv8s·YOLO11s 3차와 YOLO26s·RT-DETR-L 2차 최종 PT의 정규화 혼동행렬을 같은 축에서 비교했습니다.</p>
   <section style={{display:'grid',gridTemplateColumns:'1.68fr .52fr',gap:18,width:'100%',height:532,padding:16,boxSizing:'border-box',border:'1px solid #c8d5d9',borderRadius:17,background:'rgba(255,255,255,.86)',boxShadow:'0 14px 30px rgba(29,52,62,.08)'}}>
    <div data-slide-interactive="true" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} style={{position:'relative',overflow:'hidden',borderRadius:13,background:'linear-gradient(145deg,#f8fbfb,#dce8e9)',userSelect:'none',display:'grid',gridTemplateRows:'39px 1fr'}}>
     <div style={{display:'flex',alignItems:'center',gap:13,padding:'0 12px 0 16px',borderBottom:'1px solid rgba(84,119,126,.16)',background:'rgba(255,255,255,.5)',boxSizing:'border-box'}}>
      <span style={{color:'#496b82',fontSize:9.5,fontWeight:900,letterSpacing:.45,whiteSpace:'nowrap'}}>DRAG · 회전 / WHEEL · 확대</span>
      <span style={{height:15,width:1,background:'#c5d3d5'}}/>
      <div style={{display:'flex',alignItems:'center',gap:12,color:'#36545c',fontSize:9.5,fontWeight:850,whiteSpace:'nowrap'}}><span><b style={{color:'#008f83'}}>X</b> 실제 클래스</span><span><b style={{color:'#6b4fd3'}}>Y</b> 예측 클래스</span><span><b style={{color:'#d8663f'}}>Z</b> 정규화 예측 비율</span></div>
      <button data-slide-interactive="true" onClick={e=>{e.stopPropagation();setRotation(initialRotation);setZoom(1)}} style={{marginLeft:'auto',border:'1px solid #b7c9cd',borderRadius:14,padding:'4px 10px',background:'rgba(255,255,255,.88)',color:'#36545c',fontSize:9,fontWeight:900,cursor:'pointer',whiteSpace:'nowrap'}}>시점 초기화</button>
     </div>
     <svg viewBox="0 0 810 492" width="100%" height="100%" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} style={{cursor:drag.current?'grabbing':'grab',touchAction:'none'}}>
      <defs><marker id="liveArrow" markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="context-stroke"/></marker></defs>
      {edges.map(([a,b],i)=><line key={i} x1={pc[a].x} y1={pc[a].y} x2={pc[b].x} y2={pc[b].y} stroke="#62777c" strokeOpacity=".63" strokeWidth="1.35"/>)}
      {[0,.25,.5,.75,1].map((z,i)=>{const a=project(0,0,z),b=project(0,10,z),c=project(10,0,z);return <g key={z} stroke="#729096" strokeOpacity={i===0||i===4?.32:.15} strokeDasharray={i===0||i===4?'0':'4 4'}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/><line x1={a.x} y1={a.y} x2={c.x} y2={c.y}/></g>})}
      {projected.map((p,i)=>{const base=project(p.x,p.y,0),active=(hover??selected)?.model===p.model&&(hover??selected)?.label===p.label;return <g key={`${p.model}-${p.label}-${i}`} onPointerEnter={()=>setHover(p)} onPointerLeave={()=>setHover(null)} onClick={e=>{e.stopPropagation();setSelected(p)}}>
       {showProjectionLines&&<line x1={base.x} y1={base.y} x2={p.screen.x} y2={p.screen.y} stroke={p.color} strokeOpacity={active?.72:.18} strokeWidth={active?2:1}/>} 
       {active&&<circle cx={p.screen.x} cy={p.screen.y} r={13+(p.z*3)} fill="none" stroke={p.color} strokeOpacity=".28" strokeWidth="3"/>}
       <circle cx={p.screen.x} cy={p.screen.y} r={(active?8:5.2)+(p.z*3)} fill={p.color} fillOpacity={active?1:.9} stroke="#fff" strokeWidth={active?2.4:1.4}/>
      </g>})}
      <line x1={axisOrigin.x} y1={axisOrigin.y} x2={axisX.x} y2={axisX.y} stroke="#008f83" strokeWidth="2" markerEnd="url(#liveArrow)"/><line x1={axisOrigin.x} y1={axisOrigin.y} x2={axisY.x} y2={axisY.y} stroke="#6b4fd3" strokeWidth="2" markerEnd="url(#liveArrow)"/><line x1={axisOrigin.x} y1={axisOrigin.y} x2={axisZ.x} y2={axisZ.y} stroke="#d8663f" strokeWidth="2" markerEnd="url(#liveArrow)"/>
      {codes.map((code,i)=>{const p=project(i,0,0);return <g key={'x'+i}><circle cx={p.x} cy={p.y} r="2" fill="#008f83"/><text x={p.x} y={p.y+15} textAnchor="middle" fill="#06746c" fontSize="7.5" fontWeight="900">{code}</text></g>})}
      {codes.map((code,i)=>{const p=project(0,i,0);return <g key={'y'+i}><circle cx={p.x} cy={p.y} r="2" fill="#6b4fd3"/><text x={p.x-6} y={p.y-5} textAnchor="end" fill="#5135ad" fontSize="7.5" fontWeight="900">{code}</text></g>})}
      {[0,.25,.5,.75,1].map(z=>{const p=project(0,0,z);return <text key={z} x={p.x-9} y={p.y+3} textAnchor="end" fill="#b9502e" fontSize="9" fontWeight="900">{Math.round(z*100)}%</text>})}
      <circle cx={axisOrigin.x} cy={axisOrigin.y} r="3" fill="#345d70"/>
     </svg>
     <div data-slide-interactive="true" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{position:'absolute',right:14,bottom:14,zIndex:5,display:'flex',flexDirection:'column',alignItems:'center',gap:4,padding:'6px 7px',width:39,border:'1px solid #b8c9cc',borderRadius:12,background:'rgba(255,255,255,.96)',boxShadow:'0 8px 20px rgba(29,58,65,.18)'}}>
      <button title="확대" onClick={()=>setZoom(levelToZoom(Math.min(100,zoomLevel+10)))} style={{display:'grid',placeItems:'center',width:25,height:25,border:'1px solid #cbd9db',borderRadius:7,background:'#f5f9f9',color:'#1b5759',fontSize:17,fontWeight:900,cursor:'pointer'}}>+</button>
      <span style={{color:'#71868a',fontSize:7,fontWeight:900}}>100</span>
      <div role="slider" aria-label="그래프 확대 단계" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(zoomLevel)} tabIndex={0} onPointerDown={zoomTrackDown} onPointerMove={zoomTrackMove} onPointerUp={zoomTrackUp} onPointerCancel={zoomTrackUp} style={{position:'relative',width:17,height:88,cursor:'grab',touchAction:'none'}}>
       <div style={{position:'absolute',left:7,top:8,bottom:8,width:4,borderRadius:2,background:'#d5e2e3',boxShadow:'inset 0 1px 2px rgba(36,72,78,.16)'}}/>
       <div style={{position:'absolute',left:7,bottom:8,width:4,height:`calc((100% - 16px) * ${zoomLevel/100})`,borderRadius:2,background:'linear-gradient(#38b8ae,#008f83)'}}/>
       <div style={{position:'absolute',left:1,bottom:`calc(8px + (100% - 16px) * ${zoomLevel/100})`,width:16,height:16,borderRadius:'50%',background:'#fff',border:'3px solid #008f83',boxSizing:'border-box',transform:'translateY(50%)',boxShadow:'0 2px 5px rgba(24,70,72,.24)',pointerEvents:'none'}}/>
      </div>
      <span style={{color:'#71868a',fontSize:7,fontWeight:900}}>0</span>
      <button title="축소" onClick={()=>setZoom(levelToZoom(Math.max(0,zoomLevel-10)))} style={{display:'grid',placeItems:'center',width:25,height:25,border:'1px solid #cbd9db',borderRadius:7,background:'#f5f9f9',color:'#1b5759',fontSize:18,fontWeight:900,cursor:'pointer'}}>−</button>
      <div style={{minWidth:34,textAlign:'center',padding:'3px 0',borderRadius:6,background:'#e7f2f1',color:'#08786f',fontSize:9,fontWeight:900}}>{Math.round(zoomLevel)}</div>
     </div>
     {activePoint&&(()=>{const actual=Math.round(activePoint.x),predicted=Math.round(activePoint.y),correct=actual===predicted;return <div style={{position:'absolute',left:16,bottom:14,width:258,padding:'10px 12px',borderRadius:10,background:'rgba(26,51,59,.96)',color:'#fff',pointerEvents:'none',boxShadow:'0 8px 19px rgba(20,45,52,.2)',border:`1px solid ${activePoint.color}66`}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{width:9,height:9,borderRadius:'50%',background:activePoint.color}}/><b style={{color:activePoint.color,fontSize:10.5}}>{activePoint.model}</b></div><span style={{padding:'3px 7px',borderRadius:9,background:correct?'rgba(50,190,145,.18)':'rgba(232,111,72,.16)',color:correct?'#78e1b7':'#ffad91',fontSize:7.8,fontWeight:900}}>{correct?'동일 클래스 예측':'다른 클래스 예측'}</span></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 18px 1fr',alignItems:'center',gap:4}}><div><div style={{color:'#a9bec1',fontSize:7.5,fontWeight:800}}>실제 클래스</div><div style={{marginTop:2,fontSize:10,fontWeight:900}}>{names[actual]} <span style={{color:'#9bb2b5',fontSize:7.8}}>({codes[actual]})</span></div></div><div style={{textAlign:'center',color:activePoint.color,fontSize:14,fontWeight:900}}>→</div><div><div style={{color:'#a9bec1',fontSize:7.5,fontWeight:800}}>모델 예측</div><div style={{marginTop:2,fontSize:10,fontWeight:900}}>{names[predicted]} <span style={{color:'#9bb2b5',fontSize:7.8}}>({codes[predicted]})</span></div></div></div>
      <div style={{height:1,background:'rgba(190,213,215,.18)',margin:'8px 0 7px'}}/><div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}><div><div style={{color:'#a9bec1',fontSize:7.5,fontWeight:800}}>이 퍼센트가 의미하는 값</div><div style={{marginTop:2,color:'#d5e4e5',fontSize:8.7,fontWeight:750,lineHeight:1.32}}>실제 <b style={{color:'#fff'}}>{names[actual]}</b> 클래스 표본 중<br/>모델이 <b style={{color:activePoint.color}}>{names[predicted]}</b> 클래스로 예측한 비율</div></div><strong style={{marginLeft:8,color:'#fff',fontSize:19,lineHeight:1}}>{(activePoint.z*100).toFixed(0)}%</strong></div>
     </div>})()}
    </div>
    <aside style={{display:'grid',gridTemplateRows:'minmax(0,.43fr) minmax(0,.57fr)',gap:11}}>
     <section style={{padding:'18px 19px',border:'1px solid #c5d5d8',borderRadius:12,background:'rgba(255,255,255,.96)'}}>
      <div style={{color:'#b9502e',fontSize:14,fontWeight:900}}>AXIS GUIDE · 축 기준</div>
      <div style={{display:'grid',gap:10,marginTop:14,fontSize:12.5,fontWeight:850,color:'#29454c'}}><div><b style={{color:'#008f83',fontSize:14}}>X</b> · 실제 정답 클래스</div><div><b style={{color:'#6b4fd3',fontSize:14}}>Y</b> · 모델이 예측한 클래스</div><div><b style={{color:'#d8663f',fontSize:14}}>Z</b> · 실제 클래스별 정규화 예측 비율</div></div>
      <div style={{height:1,background:'#dce6e7',margin:'15px 0 12px'}}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 12px'}}>{models.map(m=><div key={m.name} style={{display:'flex',alignItems:'center',gap:8,fontSize:11.5,fontWeight:900,color:'#29454c'}}><span style={{width:11,height:11,flex:'0 0 11px',borderRadius:'50%',background:m.color}}/>{m.name}</div>)}</div>
     </section>
     <section style={{padding:'17px 18px',border:'1px solid #d7b7aa',borderRadius:12,background:'linear-gradient(145deg,#fffaf7,#f7eeea)',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}><div><div style={{color:'#a84629',fontSize:14,fontWeight:900}}>CLASS CODE · 클래스 약어</div><div style={{marginTop:4,color:'#746964',fontSize:10,fontWeight:750}}>축의 약어와 실제 클래스 이름</div></div><span style={{padding:'4px 8px',borderRadius:10,background:'#f1ded5',color:'#a84629',fontSize:9.5,fontWeight:900}}>11 CLASSES</span></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:12,rowGap:8,marginTop:16}}>{codes.map((c,i)=><div key={c} style={{display:'grid',gridTemplateColumns:'39px 1fr',alignItems:'center',minWidth:0}}><b style={{display:'grid',placeItems:'center',height:23,borderRadius:6,background:i%2===0?'#dff1ef':'#e8e3f7',color:i%2===0?'#087b73':'#5b43ae',fontSize:9.5}}>{c}</b><span style={{paddingLeft:8,color:'#354f54',fontSize:10,fontWeight:800,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{names[i]}</span></div>)}</div>
     </section>
    </aside>
   </section>
   <div style={{marginTop:7,color:'#50666a',fontSize:11,fontWeight:800}}>※ Z값은 실제 클래스별 정규화 예측 비율입니다. 각 모델의 현재 최종 PT 혼동행렬 대각선 값과 클래스 간 10% 이상의 주요 오분류를 표시했습니다.</div>
  </div><div className={styles.pageNumber}>11</div>
 </div>
}
