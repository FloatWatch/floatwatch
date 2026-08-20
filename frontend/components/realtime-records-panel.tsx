"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Bookmark, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Cpu, MapPinned, Radio, RefreshCw, ScanLine, X } from "lucide-react";
import { API_URL, api } from "@/lib/api";
import { ZoomableImage } from "./zoomable-image";

type LiveEvent = { id: number; class_id: number; class_name: string; confidence: number; detected_at: string; evidence_url:string|null; protected:boolean };
type LiveSession = { id: number; model_id: number; model_name: string; status: "running" | "paused" | "completed" | "interrupted"; total_events: number; started_at: string; ended_at: string | null; latitude:number|null; longitude:number|null; location_name:string|null; location_description:string|null; coastal_eligible:boolean|null; is_demo:boolean; events?: LiveEvent[] };

export function RealtimeRecordsPanel({ onStartRealtime }: { onStartRealtime: () => void }) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [selected, setSelected] = useState<LiveSession | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setSessions(await api<LiveSession[]>("/realtime/sessions")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "실시간 탐지 기록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  async function open(session: LiveSession) {
    try { setSelected(await api<LiveSession>(`/realtime/sessions/${session.id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "상세 기록을 불러오지 못했습니다."); }
  }
  async function toggleProtection(event:LiveEvent){if(!selected)return;const next=!event.protected;try{await api(`/realtime/events/${event.id}/protection`,{method:"PATCH",body:JSON.stringify({protected:next})});setSelected({...selected,events:selected.events?.map(item=>item.id===event.id?{...item,protected:next}:item)});}catch(reason){setError(reason instanceof Error?reason.message:"보존 상태를 변경하지 못했습니다.")}}
  const classSummary = useMemo(() => {
    const counts = new Map<string, number>();
    selected?.events?.forEach((event) => counts.set(event.class_name, (counts.get(event.class_name) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [selected]);
  const peakCount = Math.max(1, ...classSummary.map((item) => item[1]));
  const sessionsPerPage = 5;
  const pageCount = Math.max(1, Math.ceil(sessions.length / sessionsPerPage));
  const pageGroupStart = Math.floor((page - 1) / 5) * 5 + 1;
  const visiblePages = Array.from(
    { length: Math.min(5, pageCount - pageGroupStart + 1) },
    (_, index) => pageGroupStart + index,
  );
  const paginatedSessions = sessions.slice((page - 1) * sessionsPerPage, page * sessionsPerPage);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);

  return <section className={`realtime-records ${expanded ? "expanded" : ""}`}>
    <header>
      <button type="button" className="realtime-records-heading" onClick={() => setExpanded((value) => !value)}><span><Radio size={18}/></span><div><small>LIVE OBSERVATION HISTORY</small><strong>실시간 탐지 기록</strong><p>웹캠 탐지 세션과 저장된 이벤트를 별도로 확인합니다.</p></div><em>{sessions.length}개 세션</em><ChevronDown size={18}/></button>
      <button type="button" className="realtime-records-start" onClick={onStartRealtime}><ScanLine size={14}/>실시간 탐색</button>
    </header>
    {expanded && <div className="realtime-records-body">
      {error && <p className="realtime-records-error">{error}<button onClick={() => void load()}><RefreshCw size={13}/>다시 불러오기</button></p>}
      {loading ? <div className="realtime-records-empty"><RefreshCw className="spin" size={22}/>기록을 불러오고 있습니다.</div> : sessions.length ? <><div className="realtime-session-list">{paginatedSessions.map((session) => <button type="button" key={session.id} onClick={() => void open(session)}><span className={`live-session-icon ${session.status}`}><Activity size={17}/></span><span className="live-session-identity"><strong>{session.model_name}{session.is_demo&&<em className="realtime-demo-badge">DEMO</em>}</strong><small>{statusLabel(session.status)}</small></span><span className="live-session-place"><small>관찰 위치</small><strong>{session.location_name||"위치 미등록"}</strong></span><span className="live-session-started"><small>탐지 시작</small><strong>{formatDateTime(session.started_at)}</strong></span><b>{session.total_events}<small>이벤트</small></b><ChevronRight size={17}/></button>)}</div>{sessions.length > sessionsPerPage && <nav className="records-pagination realtime-records-pagination" aria-label="실시간 탐지 기록 페이지"><button type="button" aria-label="첫 페이지" title="맨 처음" disabled={page === 1} onClick={() => setPage(1)}><ChevronFirst size={15}/></button><button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15}/></button>{visiblePages.map((item)=><button key={item} type="button" className={page===item?"active":""} aria-current={page===item?"page":undefined} onClick={()=>setPage(item)}>{item}</button>)}<button type="button" aria-label="다음 페이지" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={15}/></button><button type="button" aria-label="마지막 페이지" title="맨 끝" disabled={page === pageCount} onClick={() => setPage(pageCount)}><ChevronLast size={15}/></button></nav>}</> : <div className="realtime-records-empty"><Radio size={24}/><strong>저장된 실시간 탐지 기록이 없습니다.</strong><button onClick={onStartRealtime}>실시간 탐색 시작</button></div>}
    </div>}
    {selected && <div className="realtime-session-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-labelledby="live-record-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>LIVE SESSION · #{selected.id}{selected.is_demo&&<em className="realtime-demo-badge">DEMO</em>}</small><h2 id="live-record-title">실시간 탐지 상세 기록</h2><p>{selected.model_name} · {formatDateTime(selected.started_at)}</p></div><button aria-label="닫기" onClick={() => setSelected(null)}><X size={19}/></button></header>
      <div className="live-session-summary"><article><small>세션 상태</small><strong>{statusLabel(selected.status)}</strong></article><article><small>저장 이벤트</small><strong>{selected.total_events}<em>건</em></strong></article><article><small>탐지 클래스</small><strong>{classSummary.length}<em>종</em></strong></article><article><small>관찰 시간</small><strong>{duration(selected.started_at, selected.ended_at)}</strong></article></div>
      <div className="live-session-location"><MapPinned size={17}/><div><small>촬영 위치</small><strong>{selected.location_name||"등록된 위치가 없습니다."}</strong>{selected.location_description&&<p>{selected.location_description}</p>}</div>{selected.latitude!=null&&<em>{selected.coastal_eligible?"해안 통계 반영":"통계 제외 위치"}</em>}</div>
      <div className="live-session-detail"><section><h3>클래스별 탐지</h3>{classSummary.length ? classSummary.map(([name, count], index) => <div className="live-class-row" key={name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><i><b style={{ width: `${Math.max(8, count / peakCount * 100)}%` }}/></i><em>{count}건</em></div>) : <p>저장된 탐지 이벤트가 없습니다.</p>}</section><section><h3>최근 탐지 이벤트</h3><div className="live-event-history">{selected.events?.length ? selected.events.slice(0, 20).map((event) => <article key={event.id} className={event.evidence_url?"has-evidence":""}>{event.evidence_url?<ZoomableImage className="live-event-evidence" src={`${API_URL}${event.evidence_url}`} alt={`${event.class_name} 탐지 증거 · 신뢰도 ${Math.round(event.confidence * 100)}%`}/>:<span><Cpu size={14}/></span>}<div><strong>{event.class_name}</strong><small>{formatDateTime(event.detected_at)}</small></div><b>{Math.round(event.confidence * 100)}%</b>{event.evidence_url&&<button className={event.protected?"protected":""} title={event.protected?"자동 삭제 보호 해제":"중요 기록으로 보호"} onClick={()=>void toggleProtection(event)}><Bookmark size={13}/></button>}</article>) : <p>저장된 탐지 이벤트가 없습니다.</p>}</div></section></div>
    </section></div>}
  </section>;
}

function statusLabel(status: LiveSession["status"]) { return ({ running: "진행 중", paused: "일시정지", completed: "완료", interrupted: "연결 중단" })[status]; }
function formatDateTime(value: string) { return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function duration(start: string, end: string | null) { const seconds = Math.max(0, Math.floor((new Date(end || Date.now()).getTime() - new Date(start).getTime()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
