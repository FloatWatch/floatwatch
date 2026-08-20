"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, Check, ChevronDown, Clock3, Cpu, FolderCog, MapPinned, Pause, Play, ScanLine, ShieldCheck, Square, Video, Wifi } from "lucide-react";
import { api } from "@/lib/api";
import type { ModelArtifact } from "@/lib/types";
import { RealtimeLocationDialog, type RealtimeLocation } from "./realtime-location-dialog";

type CameraState = "idle" | "requesting" | "ready" | "error";
type SessionState = "idle" | "running" | "paused";
type Detection = { class_id:number; class_name:string; confidence:number; x1:number; y1:number; x2:number; y2:number };
type DetectResponse = { detections:Detection[]; captured_at:string };
type DetectionEvent = Detection & { id:string; detectedAt:Date };
type RealtimeSession = { id:number; status:"running"|"paused"|"completed"|"interrupted"; total_events:number };

export function RealtimeDetection({ models, onManageModels }: { models:ModelArtifact[]; onManageModels:()=>void }) {
  const videoRef=useRef<HTMLVideoElement>(null), overlayRef=useRef<HTMLCanvasElement>(null), captureRef=useRef<HTMLCanvasElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null), pickerRef=useRef<HTMLDivElement>(null), lastEventRef=useRef<Record<string,number>>({});
  const sessionIdRef=useRef<number|null>(null);
  const [cameraState,setCameraState]=useState<CameraState>("idle"), [sessionState,setSessionState]=useState<SessionState>("idle");
  const [selectedModelId,setSelectedModelId]=useState(models[0]?String(models[0].id):""), [pickerOpen,setPickerOpen]=useState(false);
  const [error,setError]=useState(""), [elapsedSeconds,setElapsedSeconds]=useState(0), [pending,setPending]=useState(false);
  const [detections,setDetections]=useState<Detection[]>([]), [events,setEvents]=useState<DetectionEvent[]>([]);
  const [location,setLocation]=useState<RealtimeLocation|null>(null),[locationOpen,setLocationOpen]=useState(false);
  const selectedModel=useMemo(()=>models.find(model=>String(model.id)===selectedModelId),[models,selectedModelId]);

  useEffect(()=>{if(!selectedModelId&&models[0])setSelectedModelId(String(models[0].id));},[models,selectedModelId]);
  useEffect(()=>{if(!pickerOpen)return;const close=(event:MouseEvent)=>{if(!pickerRef.current?.contains(event.target as Node))setPickerOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setPickerOpen(false)};document.addEventListener("mousedown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",escape)}},[pickerOpen]);
  useEffect(()=>{if(sessionState!=="running")return;const timer=window.setInterval(()=>setElapsedSeconds(value=>value+1),1000);return()=>window.clearInterval(timer)},[sessionState]);
  useEffect(()=>()=>{streamRef.current?.getTracks().forEach(track=>track.stop());const id=sessionIdRef.current;if(id)api(`/realtime/sessions/${id}`,{method:"PATCH",body:JSON.stringify({status:"completed"})}).catch(()=>undefined)},[]);

  useEffect(()=>{
    const canvas=overlayRef.current,video=videoRef.current;if(!canvas||!video)return;
    const width=video.clientWidth,height=video.clientHeight,ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    const context=canvas.getContext("2d");if(!context)return;context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);if(sessionState!=="running")return;
    context.lineWidth=2;context.font="700 13px Pretendard, sans-serif";
    detections.forEach(item=>{const x=item.x1*width,y=item.y1*height,w=Math.max(2,(item.x2-item.x1)*width),h=Math.max(2,(item.y2-item.y1)*height),label=`${item.class_name} ${Math.round(item.confidence*100)}%`,labelWidth=context.measureText(label).width+14;context.strokeStyle="#6de0d4";context.fillStyle="rgba(2,46,51,.88)";context.strokeRect(x,y,w,h);context.fillRect(x,Math.max(0,y-24),labelWidth,24);context.fillStyle="#efffff";context.fillText(label,x+7,Math.max(16,y-7));});
  },[detections,sessionState]);

  useEffect(()=>{
    if(sessionState!=="running"||cameraState!=="ready"||!selectedModelId)return;
    let stopped=false,timer=0;const controller=new AbortController();
    async function detect(){const video=videoRef.current;if(stopped)return;if(!video||video.readyState<2||!video.videoWidth){timer=window.setTimeout(detect,500);return}
      const canvas=captureRef.current||document.createElement("canvas");captureRef.current=canvas;const width=Math.min(960,video.videoWidth),height=Math.round(width*video.videoHeight/video.videoWidth);canvas.width=width;canvas.height=height;canvas.getContext("2d")?.drawImage(video,0,0,width,height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.78));if(!blob||stopped)return;const form=new FormData();form.append("model_id",selectedModelId);if(sessionIdRef.current)form.append("session_id",String(sessionIdRef.current));form.append("confidence","0.25");form.append("frame",blob,"webcam.jpg");setPending(true);
      try{const result=await api<DetectResponse>("/realtime/detect",{method:"POST",body:form,signal:controller.signal});if(stopped)return;setDetections(result.detections);const now=Date.now();const fresh=result.detections.filter(item=>{const previous=lastEventRef.current[item.class_name]||0;if(now-previous<3000)return false;lastEventRef.current[item.class_name]=now;return true}).map((item,index)=>({...item,id:`${now}-${item.class_id}-${index}`,detectedAt:new Date(result.captured_at)}));if(fresh.length)setEvents(current=>[...fresh,...current].slice(0,12));setError("");}
      catch(reason){if(!stopped&&!(reason instanceof DOMException&&reason.name==="AbortError"))setError(reason instanceof Error?reason.message:"실시간 탐지 서버에 연결하지 못했습니다.")}
      finally{if(!stopped){setPending(false);timer=window.setTimeout(detect,850)}}}
    detect();return()=>{stopped=true;controller.abort();window.clearTimeout(timer);setPending(false)};
  },[cameraState,selectedModelId,sessionState]);

  async function connectCamera(){setError("");if(!navigator.mediaDevices?.getUserMedia){setCameraState("error");setError("이 브라우저에서는 카메라 연결을 지원하지 않습니다. localhost 또는 HTTPS 환경에서 확인해 주세요.");return}setCameraState("requesting");try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play()}setCameraState("ready")}catch(reason){setCameraState("error");const denied=reason instanceof DOMException&&(reason.name==="NotAllowedError"||reason.name==="PermissionDeniedError");setError(denied?"카메라 권한이 거부되었습니다. 주소창의 카메라 권한을 허용하고 다시 연결해 주세요.":"카메라를 연결하지 못했습니다. 다른 앱에서 카메라를 사용 중인지 확인해 주세요.")}}
  async function startSession(){if(!selectedModelId)return;if(!location){setLocationOpen(true);return}setError("");try{const session=await api<RealtimeSession>("/realtime/sessions",{method:"POST",body:JSON.stringify({model_id:Number(selectedModelId),latitude:location.latitude,longitude:location.longitude,location_name:location.location_name,location_description:location.location_description})});sessionIdRef.current=session.id;lastEventRef.current={};setEvents([]);setElapsedSeconds(0);setSessionState("running")}catch(reason){setError(reason instanceof Error?reason.message:"실시간 탐지 세션을 시작하지 못했습니다.")}}
  async function changeSession(status:"running"|"paused"){const id=sessionIdRef.current;if(!id)return;try{await api(`/realtime/sessions/${id}`,{method:"PATCH",body:JSON.stringify({status})});setSessionState(status==="running"?"running":"paused")}catch(reason){setError(reason instanceof Error?reason.message:"실시간 탐지 상태를 변경하지 못했습니다.")}}
  async function disconnectCamera(){const id=sessionIdRef.current;sessionIdRef.current=null;if(id)try{await api(`/realtime/sessions/${id}`,{method:"PATCH",body:JSON.stringify({status:"completed"})})}catch{}streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;if(videoRef.current)videoRef.current.srcObject=null;setCameraState("idle");setSessionState("idle");setElapsedSeconds(0);setError("");setDetections([])}
  const elapsed=`${String(Math.floor(elapsedSeconds/60)).padStart(2,"0")}:${String(elapsedSeconds%60).padStart(2,"0")}`;

  return <section className="realtime-workbench">
    <header className="realtime-hero"><div><span>LIVE OBSERVATION WORKBENCH</span><h2>카메라 영상을 실시간으로 관찰합니다</h2><p>웹캠 연결부터 모델 선택, AI 탐지 결과까지 한 화면에서 확인합니다.</p></div><div className={`realtime-system-state ${cameraState}`}><i/><span>{cameraState==="ready"?"카메라 연결됨":cameraState==="requesting"?"권한 확인 중":cameraState==="error"?"연결 확인 필요":"카메라 연결 대기"}</span></div></header>
    <div className="realtime-layout"><main className="realtime-monitor-panel"><div className={`realtime-monitor ${cameraState==="ready"?"is-live":""}`}>
      <video ref={videoRef} muted playsInline aria-label="실시간 카메라 미리보기"/><canvas ref={overlayRef} className="realtime-overlay" aria-label="실시간 AI 탐지 결과"/><span className="realtime-corner top-left"/><span className="realtime-corner top-right"/><span className="realtime-corner bottom-left"/><span className="realtime-corner bottom-right"/>
      {cameraState!=="ready"&&<div className="realtime-empty"><span><Camera size={33}/></span><strong>{cameraState==="requesting"?"카메라 권한을 확인하고 있습니다":"관찰할 카메라를 연결해 주세요"}</strong><p>브라우저 권한을 허용하면 이 영역에서 영상이 바로 표시됩니다.</p><button type="button" className="realtime-empty-connect" onClick={connectCamera} disabled={cameraState==="requesting"}><Camera size={16}/>{cameraState==="requesting"?"연결 중...":"카메라 연결"}</button><small><ShieldCheck size={13}/>카메라 영상은 탐지 요청을 위한 프레임으로만 사용됩니다.</small></div>}
      {cameraState==="ready"&&<div className="realtime-monitor-head"><span className={sessionState==="running"?"live":""}>{sessionState==="running"?(pending?"AI ANALYZING":"LIVE AI"):"PREVIEW"}</span><time><Clock3 size={13}/>{elapsed}</time></div>}{cameraState==="ready"&&sessionState==="running"&&<div className="realtime-scan-line" aria-hidden="true"/>}<div className="realtime-monitor-foot"><span><Video size={13}/>LOCAL WEBCAM</span><span>1280 × 720 권장</span></div>
    </div>{cameraState==="ready"&&<div className="realtime-controls">{sessionState==="idle"&&<button type="button" className={`realtime-location-trigger ${location?"selected":""}`} onClick={()=>setLocationOpen(true)}><MapPinned size={16}/><span>{location?.location_name||"촬영 위치 선택"}</span></button>}{sessionState==="idle"&&<button type="button" className="primary" onClick={startSession} disabled={!selectedModelId}><Play size={17}/>탐지 시작</button>}{sessionState==="running"&&<button type="button" className="primary" onClick={()=>changeSession("paused")}><Pause size={17}/>일시정지</button>}{sessionState==="paused"&&<button type="button" className="primary" onClick={()=>changeSession("running")}><Play size={17}/>이어 관찰</button>}<button type="button" onClick={disconnectCamera}><Square size={16}/>카메라 종료</button></div>}{error&&<p className="realtime-error"><AlertCircle size={16}/>{error}</p>}</main>
    <aside className="realtime-side-panel"><section className="realtime-model-card"><header><span>01 · AI MODEL</span></header><div className="realtime-model-heading"><h3>실시간 탐지 모델</h3><button type="button" onClick={()=>{setPickerOpen(false);onManageModels()}} disabled={sessionState!=="idle"}><FolderCog size={14}/>모델 관리</button></div><div className="realtime-model-field" ref={pickerRef}><span>적용 모델</span><button className={`realtime-model-trigger ${pickerOpen?"open":""}`} type="button" aria-haspopup="listbox" aria-expanded={pickerOpen} disabled={sessionState!=="idle"} onClick={()=>setPickerOpen(open=>!open)}><i><Cpu size={16}/></i><span>{selectedModel?<><strong>{selectedModel.name}</strong><small>{formatModelCapability(selectedModel)}</small></>:<strong>모델을 선택해 주세요</strong>}</span><ChevronDown size={16}/></button>{pickerOpen&&<div className="realtime-model-popover" role="listbox"><header><div><span>AVAILABLE MODELS</span><strong>실시간 탐지 모델 선택</strong></div><em>{models.length}개</em></header><div className="realtime-model-options">{models.map(model=>{const active=String(model.id)===selectedModelId;return <button key={model.id} type="button" role="option" aria-selected={active} className={active?"active":""} onClick={()=>{setSelectedModelId(String(model.id));setPickerOpen(false)}}><i><Cpu size={16}/></i><span><strong>{model.name}</strong><small>{formatModelCapability(model)}</small></span>{active&&<b><Check size={13}/></b>}</button>})}{!models.length&&<div className="realtime-model-options-empty"><Cpu size={22}/><strong>등록된 모델이 없습니다</strong><small>모델 관리에서 모델을 먼저 등록해 주세요.</small></div>}</div><footer><ShieldCheck size={13}/>등록이 완료된 모델만 표시합니다.</footer></div>}</div>{selectedModel?<div className="realtime-model-ready"><Check size={15}/><div><strong>{selectedModel.task||"모델 정보 확인 전"}</strong><small>{selectedModel.class_names.length?`${selectedModel.class_names.length}개 탐지 클래스`:"첫 탐지 시 클래스 정보를 자동 확인합니다"}</small></div></div>:<p className="realtime-model-empty">등록된 모델을 선택하면 탐지 준비 상태를 확인할 수 있습니다.</p>}</section>
    <section className="realtime-events-card"><header><span>02 · DETECTION FEED</span><Wifi size={18}/></header><h3>최근 탐지 이벤트</h3>{events.length?<div className="realtime-event-list">{events.map(event=><article key={event.id}><i><ScanLine size={15}/></i><span><strong>{event.class_name}</strong><small>{event.detectedAt.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small></span><b>{Math.round(event.confidence*100)}%</b></article>)}</div>:<div><ScanLine size={25}/><strong>아직 탐지 이벤트가 없습니다</strong><p>실시간 추론에서 객체가 감지되면 클래스, 신뢰도, 시간이 기록됩니다.</p></div>}</section></aside></div>
    {locationOpen&&<RealtimeLocationDialog initial={location} onClose={()=>setLocationOpen(false)} onConfirm={(next)=>{setLocation(next);setLocationOpen(false)}}/>}
  </section>;
}

function formatModelCapability(model:ModelArtifact){if(!model.class_names.length)return "클래스 정보 미확인 · 첫 탐지 시 자동 확인";return `${model.task||"Object Detection"} · ${model.class_names.length}개 탐지 클래스`}
