"use client";

import { useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Bookmark, Camera, ChevronDown, ChevronRight, Clock3, Cpu, MapPinned, RadioTower, ShieldCheck, Waves, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type DemoEvent = { id:number; className:string; confidence:number; detectedAt:string; protected:boolean; tone:string; hasImage?:boolean };
type DemoSession = { id:number; owner:string; channel:string; location:string; model:string; status:"completed"|"running"|"interrupted"; startedAt:string; endedAt:string|null; events:DemoEvent[] };

const sessions: DemoSession[] = [
  { id:1042, owner:"김해양", channel:"WEB-CAM 01", location:"부산 해운대 해수욕장", model:"YOLO11s", status:"completed", startedAt:"2026-08-26T09:12:00+09:00", endedAt:"2026-08-26T10:04:36+09:00", events:[
    {id:1,className:"페트병",confidence:.94,detectedAt:"2026-08-26T09:18:12+09:00",protected:true,tone:"bottle",hasImage:true},{id:2,className:"스티로폼",confidence:.88,detectedAt:"2026-08-26T09:31:45+09:00",protected:false,tone:"foam"},{id:3,className:"비닐",confidence:.82,detectedAt:"2026-08-26T09:44:07+09:00",protected:false,tone:"plastic",hasImage:true},{id:4,className:"페트병",confidence:.91,detectedAt:"2026-08-26T09:57:22+09:00",protected:true,tone:"bottle",hasImage:true},{id:8,className:"캔",confidence:.86,detectedAt:"2026-08-26T09:48:19+09:00",protected:false,tone:"buoy"},{id:9,className:"종이컵",confidence:.78,detectedAt:"2026-08-26T09:53:06+09:00",protected:false,tone:"foam"}]},
  { id:1041, owner:"이관측", channel:"WEB-CAM 02", location:"인천 을왕리 해수욕장", model:"YOLOv8s", status:"completed", startedAt:"2026-08-25T15:20:00+09:00", endedAt:"2026-08-25T16:41:18+09:00", events:[{id:5,className:"폐어구",confidence:.89,detectedAt:"2026-08-25T15:38:11+09:00",protected:true,tone:"net"},{id:6,className:"부표",confidence:.77,detectedAt:"2026-08-25T16:02:30+09:00",protected:false,tone:"buoy"}]},
  { id:1040, owner:"박지킴", channel:"WEB-CAM 03", location:"강릉 경포 해변", model:"RT-DETR", status:"interrupted", startedAt:"2026-08-24T11:08:00+09:00", endedAt:"2026-08-24T11:36:09+09:00", events:[{id:7,className:"비닐",confidence:.79,detectedAt:"2026-08-24T11:22:41+09:00",protected:false,tone:"plastic"}]},
];

export function AdminRealtimeDemo() {
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const selected=sessions.find(item=>item.id===selectedId)??null;
  if(selected)return <RealtimeDetail session={selected} onBack={()=>setSelectedId(null)}/>;
  return <section className="admin-live-demo-list">
    <header><div><span><RadioTower size={18}/></span><div><small>LIVE SESSION ARCHIVE · LOCAL DEMO</small><h3>실시간 탐지 기록</h3><p>탐지 시작부터 종료까지를 하나의 관측 세션으로 보관합니다.</p></div></div><b>{sessions.length}<small>개 세션</small></b></header>
    <div className="admin-live-table-head"><span>상태</span><span>사용자·채널</span><span>관측 위치</span><span>관측 구간</span><span>탐지</span><span/></div>
    <div className="admin-live-session-list">{sessions.map(session=><button type="button" key={session.id} onClick={()=>setSelectedId(session.id)}><span className={`admin-live-status ${session.status}`}><i/>{statusLabel(session.status)}</span><span><strong>{session.owner}</strong><small>{session.channel} · {session.model}</small></span><span><strong>{session.location}</strong><small>연안 관측 지점</small></span><span><strong>{formatTime(session.startedAt)} → {session.endedAt?formatTime(session.endedAt):"진행 중"}</strong><small>{duration(session.startedAt,session.endedAt)} 관측</small></span><b>{session.events.length}<small>이벤트</small></b><ChevronRight size={17}/></button>)}</div>
  </section>;
}

function RealtimeDetail({session,onBack}:{session:DemoSession;onBack:()=>void}) {
  const [classesExpanded,setClassesExpanded]=useState(false);
  const classToggleRef=useRef<HTMLButtonElement>(null);
  const summary=useMemo(()=>{const result=new Map<string,{count:number;total:number}>();session.events.forEach(event=>{const current=result.get(event.className)??{count:0,total:0};result.set(event.className,{count:current.count+1,total:current.total+event.confidence})});return [...result].map(([name,value])=>({name,count:value.count,confidence:value.total/value.count})).sort((a,b)=>b.count-a.count)},[session]);
  const average=session.events.reduce((total,event)=>total+event.confidence,0)/Math.max(1,session.events.length);
  const activity=buildActivity(session);
  const visibleSummary=classesExpanded?summary:summary.slice(0,3);
  const toggleClasses=()=>{if(!classesExpanded){setClassesExpanded(true);return}setClassesExpanded(false);window.requestAnimationFrame(()=>classToggleRef.current?.scrollIntoView({behavior:"smooth",block:"center"}))};
  return <main className="admin-live-detail">
    <style jsx>{`
      .admin-live-activity-body{grid-template-columns:minmax(0,1fr)}
      .admin-live-class-full{overflow:hidden;background:rgba(255,255,255,.035)}
      .admin-live-class-full>header{align-items:center;padding:20px 22px}
      .admin-live-class-full>header h3{margin-top:5px;font-size:15px}
      .admin-live-class-full>header p{margin:5px 0 0;color:#86a8a5;font-size:9px}
      .admin-live-class-kpis{display:flex;gap:8px}
      .admin-live-class-kpis>span{display:grid;min-width:94px;gap:4px;padding:9px 12px;border:1px solid rgba(142,214,207,.16);border-radius:8px;background:rgba(255,255,255,.035)}
      .admin-live-class-kpis small{color:#739a96;font-size:8px;letter-spacing:0}
      .admin-live-class-kpis strong{font-size:17px}
      .admin-live-class-kpis em{margin-left:3px;color:#7fa5a1;font-size:8px;font-style:normal}
      .admin-live-class-head,.admin-live-class-list>article{grid-template-columns:58px minmax(160px,.75fr) minmax(260px,1.5fr) 100px 150px}
      .admin-live-class-head{min-height:34px;padding:0 22px;border-bottom:1px solid rgba(183,226,221,.1);background:rgba(255,255,255,.018);font-size:8px}
      .admin-live-class-list{padding:0 14px 14px}
      .admin-live-class-list>article{min-height:66px;padding:0 8px;border-radius:7px}
      .admin-live-class-list>article:hover{background:rgba(91,180,172,.065)}
      .admin-live-rank{display:grid;width:28px;height:28px;place-items:center;border:1px solid rgba(111,207,198,.18);border-radius:7px;background:rgba(82,175,167,.08);color:#71bdb7!important;font-size:9px!important}
      .admin-live-class-list>article>strong{display:grid;gap:4px;color:#edf8f6;font-size:11px}
      .admin-live-class-list>article>strong small{color:#668e8a;font-size:7px;font-weight:600}
      .admin-live-share{display:grid;grid-template-columns:minmax(0,1fr) 38px;align-items:center;gap:12px}
      .admin-live-share>i{height:8px;overflow:hidden;border-radius:99px;background:rgba(112,171,165,.13)}
      .admin-live-share>i b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#4cb8ae,#75d9d0)}
      .admin-live-share>span{color:#9bc3bf;font-size:9px;font-weight:800}
      .admin-live-class-list>article>em{display:flex;align-items:baseline;justify-content:center;flex-direction:row;gap:3px;width:100%;color:#edf8f6;font-size:17px;text-align:center}
      .admin-live-class-list>article>em small{font-size:8px}
      .admin-live-class-confidence{display:flex;align-items:baseline;justify-content:center}
      .admin-live-class-confidence>b{color:#78d5cc;font-size:15px}
      .admin-live-class-confidence>b small{font-size:8px}
      .admin-live-class-head>span:nth-child(4),.admin-live-class-head>span:nth-child(5){text-align:center}
      .admin-live-class-total{padding:6px 9px;border:1px solid rgba(126,207,199,.18);border-radius:999px;background:rgba(78,171,163,.08);color:#91c4bf;font-size:8px}
      .admin-live-class-toggle{display:flex;width:100%;min-height:43px;align-items:center;justify-content:center;gap:7px;border:0;border-top:1px solid rgba(183,226,221,.1);background:rgba(3,34,38,.2);color:#81cfc8;font:inherit;font-size:9px;font-weight:800;cursor:pointer}
      .admin-live-class-toggle:hover{background:rgba(74,169,161,.09);color:#a7e3de}
      .admin-live-class-toggle :global(svg){transform:rotate(0deg)!important;transition:transform .2s ease}
      .admin-live-class-toggle.expanded :global(svg){transform:rotate(180deg)!important}
      .admin-live-class-toggle span{color:#668f8b;font-size:7px;font-weight:600}
      .admin-live-evidence.no-image{gap:3px;border-right:1px dashed rgba(155,188,184,.14);background:repeating-linear-gradient(135deg,rgba(255,255,255,.018),rgba(255,255,255,.018) 7px,transparent 7px,transparent 14px);color:#789692}
      .admin-live-evidence.no-image :global(svg){color:#789692;stroke-width:1.5}
      .admin-live-evidence.no-image strong{font-size:8px;letter-spacing:.12em}
      .admin-live-evidence.no-image span{color:#607e7b;font-size:6px;letter-spacing:0}
      @media(max-width:800px){.admin-live-class-full>header{align-items:flex-start;min-width:720px}}
    `}</style>
    <header className="records-detail-nav"><button type="button" onClick={onBack}><ArrowLeft size={17}/>실시간 탐지 목록</button><span>LIVE SESSION REPORT · #{session.id}</span></header>
    <div className="admin-live-detail-body">
      <section className="admin-live-hero"><div><small>OBSERVATION SESSION</small><h2>{session.location}</h2><p><Camera size={14}/>{session.channel}<i/>담당 사용자 {session.owner}<i/>{session.model}</p></div><span className={`admin-live-status ${session.status}`}><i/>{statusLabel(session.status)}</span></section>
      <section className="admin-live-metrics"><article><Clock3/><small>관측 시간</small><strong>{duration(session.startedAt,session.endedAt)}</strong><p>{formatDateTime(session.startedAt)} 시작</p></article><article><Activity/><small>탐지 이벤트</small><strong>{session.events.length}<em>건</em></strong><p>세션 내 저장된 이벤트</p></article><article><Waves/><small>탐지 클래스</small><strong>{summary.length}<em>종</em></strong><p>{summary.map(item=>item.name).join(" · ")}</p></article><article><ShieldCheck/><small>평균 신뢰도</small><strong>{Math.round(average*100)}<em>%</em></strong><p>최고 {Math.round(Math.max(...session.events.map(item=>item.confidence))*100)}%</p></article></section>
      <section className="admin-live-location"><MapPinned size={20}/><div><small>관측 지점</small><strong>{session.location}</strong><p>향후 연안 CCTV API 연결 시 채널 좌표와 카메라 상태가 표시됩니다.</p></div><em>해안 통계 반영</em></section>
      <section className="admin-live-timeline admin-live-activity"><header><div><small>DETECTION ACTIVITY</small><h3>시간대별 탐지 추이</h3><p>5분 단위 탐지량과 클래스 구성을 비교합니다.</p></div><span>{formatTime(session.startedAt)} — {session.endedAt?formatTime(session.endedAt):"LIVE"}</span></header><div className="admin-live-activity-body"><div className="admin-live-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={activity} margin={{top:12,right:10,bottom:0,left:-24}}><CartesianGrid stroke="rgba(174,220,215,.09)" vertical={false}/><XAxis dataKey="time" tick={{fill:"#789d99",fontSize:8}} axisLine={{stroke:"rgba(174,220,215,.12)"}} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:"#789d99",fontSize:8}} axisLine={false} tickLine={false}/><Tooltip cursor={{fill:"rgba(100,205,195,.06)"}} content={<ActivityTooltip/>}/>{summary.map((item,index)=><Bar key={item.name} dataKey={item.name} name={item.name} stackId="detections" fill={["#62d5ca","#4e91d8","#d49c58","#a178cf"][index%4]} radius={index===summary.length-1?[3,3,0,0]:undefined}/>)}</BarChart></ResponsiveContainer></div></div><footer className="admin-live-chart-legend">{summary.map((item,index)=><span key={item.name}><i style={{background:["#62d5ca","#4e91d8","#d49c58","#a178cf"][index%4]}}/>{item.name}</span>)}<em>막대에 마우스를 올리면 구간별 상세 정보를 확인할 수 있습니다.</em></footer></section>
      <section className={`admin-live-class-summary admin-live-class-full ${classesExpanded?"expanded":""}`}><header><div><small>CLASS SUMMARY</small><h3>클래스별 탐지 현황</h3><p>세션 동안 탐지된 대상의 비율과 평균 신뢰도를 비교합니다.</p></div><strong className="admin-live-class-total">총 {summary.length}개 클래스</strong></header><div className="admin-live-class-head"><span>순위</span><span>탐지 클래스</span><span>세션 내 탐지 비율</span><span>탐지 건수</span><span>평균 신뢰도</span></div><div className="admin-live-class-list">{visibleSummary.map((item,index)=>{const share=Math.round(item.count/Math.max(1,session.events.length)*100);return <article key={item.name}><span className="admin-live-rank">{String(index+1).padStart(2,"0")}</span><strong>{item.name}</strong><div className="admin-live-share"><i><b style={{width:`${share}%`}}/></i><span>{share}%</span></div><em>{item.count}<small>건</small></em><div className="admin-live-class-confidence"><b>{Math.round(item.confidence*100)}<small>%</small></b></div></article>})}</div>{summary.length>3&&<button ref={classToggleRef} className={`admin-live-class-toggle ${classesExpanded?"expanded":""}`} type="button" onClick={toggleClasses}><ChevronDown size={15} style={{transform:classesExpanded?"rotate(0deg)":"rotate(180deg)",transition:"transform .2s ease"}}/>{classesExpanded?"접기":"펼치기"}<span>{classesExpanded?"상위 3개만 표시":`${summary.length-3}개 클래스 더 보기`}</span></button>}</section>
      <section className="admin-live-events"><header><div><small>DETECTION EVIDENCE</small><h3>탐지 이벤트 및 증거 이미지</h3></div><p>시간순으로 저장된 대표 탐지 장면입니다.</p></header><div>{session.events.map(event=><article key={event.id}><div className={`admin-live-evidence ${event.hasImage?event.tone:"no-image"}`}>{event.hasImage?<><Camera size={24}/><span>DEMO EVIDENCE</span></>:<><X size={25}/><strong>NO IMAGE</strong><span>증거 이미지 없음</span></>}</div><div><small>{formatDateTime(event.detectedAt)}</small><strong>{event.className}</strong><p>탐지 신뢰도 <b>{Math.round(event.confidence*100)}%</b></p></div><span className="admin-live-confidence"><i style={{width:`${event.confidence*100}%`}}/></span><button type="button" className={event.protected?"protected":""} title="보존 상태 미리보기"><Bookmark size={15}/>{event.protected?"보호됨":"일반 보존"}</button></article>)}</div></section>
    </div>
  </main>;
}

function statusLabel(value:DemoSession["status"]){return {completed:"완료",running:"진행 중",interrupted:"연결 중단"}[value]}
function formatTime(value:string){return new Date(value).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false})}
function formatDateTime(value:string){return new Date(value).toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}
function duration(start:string,end:string|null){const seconds=Math.max(0,Math.floor((new Date(end??Date.now()).getTime()-new Date(start).getTime())/1000));const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60;return `${hours?`${hours}시간 `:""}${minutes}분 ${rest}초`}

function buildActivity(session:DemoSession):Array<Record<string,string|number>&{time:string;total:number;confidence:number}>{
  const names=[...new Set(session.events.map(event=>event.className))];
  const patterns=[[1,2,1,4,7,5,3,2,1,0,2],[0,1,3,2,1,4,6,3,2,1,0],[0,0,1,2,4,3,2,5,3,1,0],[0,1,0,1,2,1,3,2,1,0,0]];
  const start=new Date(session.startedAt).getTime();
  return Array.from({length:11},(_,bucket)=>{
    const row:Record<string,string|number>={time:new Date(start+bucket*5*60_000).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false})};
    let total=0;
    names.forEach((name,index)=>{const value=patterns[index%patterns.length][bucket]??0;row[name]=value;total+=value});
    return {...row,total,confidence:Math.min(96,78+(bucket*3)%15)} as Record<string,string|number>&{time:string;total:number;confidence:number};
  });
}

function ActivityTooltip({active,payload,label}:{active?:boolean;payload?:Array<{name:string;value:number;color:string}>;label?:string}){
  if(!active||!payload?.length)return null;
  const total=payload.reduce((sum,item)=>sum+Number(item.value),0);
  return <div className="admin-live-chart-tooltip"><small>{label} 구간</small><strong>전체 {total}건</strong>{payload.filter(item=>item.value>0).map(item=><span key={item.name}><i style={{background:item.color}}/>{item.name}<b>{item.value}건</b></span>)}</div>;
}
