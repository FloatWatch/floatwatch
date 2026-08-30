"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CircleHelp, Code2, Database, Download, Eye, FileText, Inbox, Layers3, LoaderCircle, MapPinned, Megaphone, MessageSquareText, Paperclip, PenLine, RadioTower, ScanLine, Send, ShieldCheck, Ship, Trash2, TriangleAlert, UserCog, Video, Waves } from "lucide-react";
import { API_URL, api } from "@/lib/api";
import type { AdminUser, Analysis, AuditLog, ContentItem, Inquiry, User } from "@/lib/types";
import { DevelopmentInfoPage, ProjectOverviewPage } from "./public-home";
import { AdminObservationMap, OBSERVATION_DUMMY_CLASS_SUMMARY } from "./admin-observation-map";
import { analysisStatusLabel, effectiveAnalysisStatus } from "@/lib/analysis-status";
import { AnalysisDetail } from "./analysis-detail";
import { AdminRealtimeDemo } from "./admin-realtime-demo";

export type WorkspaceView = "home" | "overview" | "development" | "analysis" | "realtime" | "records" | "free" | "bug" | "inquiry" | "faq" | "notice" | "admin";

export const viewTitles: Record<WorkspaceView, { kicker: string; title: string }> = {
  home: { kicker: "MY FLOATWATCH", title: "홈" },
  overview: { kicker: "PROJECT OVERVIEW", title: "프로젝트 개요" },
  development: { kicker: "DEVELOPMENT INFO", title: "개발정보" },
  analysis: { kicker: "AI OBSERVATION", title: "부유물 탐색" },
  realtime: { kicker: "LIVE OBSERVATION", title: "실시간 탐색" },
  records: { kicker: "OBSERVATION LOG", title: "탐색 기록" },
  free: { kicker: "COMMUNITY", title: "자유게시판" },
  bug: { kicker: "BUG REPORT", title: "버그 제보" },
  inquiry: { kicker: "PRIVATE SUPPORT", title: "1:1 문의" },
  faq: { kicker: "HELP CENTER", title: "자주 묻는 질문" },
  notice: { kicker: "SERVICE NEWS", title: "공지사항" },
  admin: { kicker: "ADMINISTRATION", title: "관리자 페이지" },
};

export function WorkspaceSection({ view, user, onNavigate }: { view: Exclude<WorkspaceView, "home" | "analysis" | "realtime" | "records">; user: User; onNavigate?: (view: WorkspaceView) => void }) {
  if (view === "overview") return <ProjectOverviewPage onStart={() => onNavigate?.("analysis")}/>;
  if (view === "development") return <DevelopmentInfoPage/>;
  if (view === "inquiry") return <InquirySection user={user}/>;
  if (view === "admin") return <AdminConsole onNavigate={onNavigate}/>;
  return <ContentSection category={view} user={user}/>;
}

function ContentSection({ category, user }: { category: "free" | "bug" | "faq" | "notice"; user: User }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [writing, setWriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const canWrite = category === "free" || category === "bug" || user.role === "admin";
  const labels = { free: "자유게시판", bug: "버그 제보", faq: "자주 묻는 질문", notice: "공지사항" };

  async function load() { setLoading(true); try { setItems(await api<ContentItem[]>(`/content?category=${category}`)); } finally { setLoading(false); } }
  useEffect(() => { setSelected(null); setWriting(false); load(); }, [category]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await api("/content", { method: "POST", body: JSON.stringify({ category, title: data.get("title"), content: data.get("content"), pinned: data.get("pinned") === "on" }) });
    setWriting(false); await load();
  }
  async function remove(item: ContentItem) { if (!confirm("게시글을 삭제하시겠습니까?")) return; await api(`/content/${item.id}`, { method: "DELETE" }); setSelected(null); await load(); }

  return <div className="section-page">
    <div className="section-toolbar"><div><p>{labels[category]} 전체 {items.length}건</p></div>{canWrite && <button className="primary-button" onClick={() => setWriting(!writing)}><PenLine size={16}/>{writing ? "작성 취소" : "글쓰기"}</button>}</div>
    {writing && <form className="editor-panel" onSubmit={submit}><label>제목<input name="title" required minLength={2} placeholder="제목을 입력하세요"/></label><label>내용<textarea name="content" required minLength={2} rows={8} placeholder="내용을 입력하세요"/></label>{user.role === "admin" && category !== "free" && <label className="check-label"><input type="checkbox" name="pinned"/>상단 고정</label>}<div><button className="primary-button">등록</button></div></form>}
    {selected ? <article className="content-reader"><button className="text-action" onClick={() => setSelected(null)}>목록으로</button><header><span>{labels[selected.category]}</span><h2>{selected.title}</h2><p>{selected.author?.name ?? "관리자"} · {formatDate(selected.created_at)} · 조회 {selected.views}</p></header><div>{selected.content}</div>{(user.role === "admin" || selected.author?.id === user.id) && <button className="danger-button" onClick={() => remove(selected)}><Trash2 size={15}/>삭제</button>}</article> : <div className="board-table"><div className="board-head"><span>번호</span><span>제목</span><span>작성자</span><span>작성일</span><span>조회</span></div>{items.map((item) => <button className="board-row" key={item.id} onClick={() => setSelected(item)}><span>{item.pinned ? <b>공지</b> : item.id}</span><strong>{item.title}</strong><span>{item.author?.name ?? "관리자"}</span><time>{formatDate(item.created_at)}</time><span>{item.views}</span></button>)}{loading && <div className="table-empty"><LoaderCircle className="spin"/></div>}{!loading && !items.length && <div className="table-empty">등록된 게시글이 없습니다.</div>}</div>}
  </div>;
}

function InquirySection({ user }: { user: User }) {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [writing, setWriting] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function load() { setItems(await api<Inquiry[]>("/inquiries")); }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!attachment?.type.startsWith("image/")) { setPreview(""); return; }
    const url = URL.createObjectURL(attachment); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setFeedback("");
    try {
      const data = new FormData(event.currentTarget);
      const saved = await api<Inquiry>("/inquiries", { method: "POST", body: JSON.stringify({ title: data.get("title"), content: data.get("content") }) });
      if (attachment) { const upload = new FormData(); upload.append("file", attachment); await api(`/inquiries/${saved.id}/attachments`, { method: "POST", body: upload }); }
      setAttachment(null); setWriting(false); await load();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "문의를 등록하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function toggleInquiry(item: Inquiry) {
    if (open === item.id) { setOpen(null); return; }
    setOpen(item.id);
    if (!item.has_new_answer) return;
    try {
      const updated = await api<Inquiry>(`/inquiries/${item.id}/read`, { method: "PATCH" });
      setItems((current) => current.map((value) => value.id === updated.id ? updated : value));
    } catch (error) { setFeedback(error instanceof Error ? error.message : "답변 확인 상태를 저장하지 못했습니다."); }
  }
  if (writing) return <div className="section-page inquiry-compose-page"><header><button type="button" onClick={() => setWriting(false)}><ArrowLeft size={17}/>문의 목록</button><div><p className="section-kicker">PRIVATE SUPPORT</p><h2>1:1 문의 작성</h2><p>서비스 이용 중 확인이 필요한 내용을 남겨주세요.</p></div><span><ShieldCheck size={17}/>비공개 문의</span></header><form onSubmit={submit}><label><span>문의 제목</span><input name="title" required minLength={2} maxLength={120} placeholder="문의 내용을 한 문장으로 입력하세요"/></label><label><span>문의 내용</span><textarea name="content" rows={10} required minLength={5} maxLength={5000} placeholder="확인이 필요한 상황과 요청 사항을 구체적으로 작성해주세요."/></label><div className={`inquiry-attachment-picker ${preview ? "has-preview" : ""}`}>{preview && <img src={preview} alt="첨부 이미지 미리보기"/>}<label><Paperclip size={19}/><span><strong>{attachment ? attachment.name : "파일 첨부"}</strong><small>{attachment ? `${formatBytes(attachment.size)} · 다른 파일을 선택하려면 클릭하세요` : "이미지와 문서를 첨부할 수 있습니다. 최대 20MB"}</small></span><input type="file" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}/></label></div>{feedback && <p className="inquiry-feedback" role="alert">{feedback}</p>}<footer><p><ShieldCheck size={14}/>작성한 문의와 첨부파일은 본인과 관리자만 확인할 수 있습니다.</p><div><button type="button" disabled={busy} onClick={() => setWriting(false)}>취소</button><button className="primary-button" disabled={busy}><Send size={16}/>{busy ? "등록 중..." : "문의 등록"}</button></div></footer></form></div>;
  return <div className="section-page inquiry-page"><header className="inquiry-hero"><div><span><Inbox size={22}/></span><div><p className="section-kicker">MY INQUIRIES</p><h2>1:1 문의</h2><p>문의 진행 상태와 관리자 답변을 한곳에서 확인합니다.</p></div></div><button className="primary-button" onClick={() => { setFeedback(""); setWriting(true); }}><PenLine size={16}/>문의 작성</button></header><div className="inquiry-summary"><div><small>전체 문의</small><strong>{items.length}<em>건</em></strong></div><div><small>답변 대기</small><strong>{items.filter((item) => item.status !== "answered").length}<em>건</em></strong></div><p><ShieldCheck size={14}/>문의 내용은 비공개로 보호됩니다.</p></div>{feedback && <p className="inquiry-feedback" role="alert">{feedback}</p>}<div className="inquiry-list">{items.map((item) => <article key={item.id} className={open === item.id ? "open" : ""}><button onClick={() => toggleInquiry(item)}><span className={`status ${item.status === "answered" ? "completed" : "processing"}`}>{item.status === "answered" ? "답변 완료" : "접수"}</span><strong>{item.title}{item.has_new_answer && <em className="inquiry-new-answer">새 답변</em>}</strong><time>{formatDate(item.created_at)}</time><ChevronDown size={18}/></button>{open === item.id && <div className="inquiry-body"><div><small>문의 내용</small><p>{item.content}</p>{item.attachments?.length > 0 && <InquiryAttachments files={item.attachments}/>}</div>{item.answer ? <section><b>관리자 답변</b><p>{item.answer}</p></section> : <aside>문의가 접수되었습니다. 관리자가 내용을 확인하고 있습니다.</aside>}</div>}</article>)}{!items.length && <div className="inquiry-empty"><Inbox size={28}/><strong>등록한 문의가 없습니다.</strong><p>궁금한 내용이 있다면 문의를 작성해주세요.</p><button onClick={() => setWriting(true)}>첫 문의 작성</button></div>}</div></div>;
}

function InquiryAttachments({ files }: { files: Inquiry["attachments"] }) { return <div className="inquiry-attachments"><strong><Paperclip size={14}/>첨부파일</strong>{files.map((file) => <a href={`${API_URL}${file.url}`} target="_blank" rel="noreferrer" key={file.id}><span>{file.name}<small>{formatBytes(file.size_bytes)}</small></span><Download size={15}/></a>)}</div>; }

type AdminAnalysis = Analysis & { owner: { id: number; name: string } };
type AdminRealtimeSession = { id:number; status:string; total_events:number; started_at:string; ended_at:string|null; latitude:number|null; longitude:number|null; location_name:string|null; location_description:string|null; coastal_eligible:boolean|null; is_demo:boolean; events:Array<{class_name:string;confidence:number}> };

function OperationsBriefing({ onNavigate }: { onNavigate?: (view: WorkspaceView) => void }) {
  const [analyses, setAnalyses] = useState<AdminAnalysis[]>([]);
  const [reports, setReports] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<AdminAnalysis[]>("/admin/analyses"), api<ContentItem[]>("/content?category=bug")])
      .then(([analysisItems, reportItems]) => { setAnalyses(analysisItems); setReports(reportItems); })
      .finally(() => setLoading(false));
  }, []);

  const completed = analyses.filter((item) => item.status === "completed");
  const classMap = new Map<string, { count: number; confidenceTotal: number }>();
  for (const item of completed) for (const stat of item.class_stats ?? []) {
    const current = classMap.get(stat.class_name) ?? { count: 0, confidenceTotal: 0 };
    current.count += stat.count;
    current.confidenceTotal += stat.avg_confidence * stat.count;
    classMap.set(stat.class_name, current);
  }
  const classRanking = Array.from(classMap, ([name, value]) => ({ name, count: value.count, confidence: value.count ? Math.round(value.confidenceTotal / value.count * 100) : 0 })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(classRanking[0]?.count ?? 0, 1);
  const totalDetections = completed.reduce((sum, item) => sum + item.total_detections, 0);
  const lead = classRanking[0];

  return <div className="operations-briefing">
    <header className="operations-briefing-head"><div><p className="section-kicker">LIVE MARINE BRIEFING</p><h2>지금, 바다에서 반복되는 신호</h2><p>분석 결과를 나열하지 않고 다음 관측이 필요한 대상을 중심으로 읽습니다.</p></div><div className="operations-head-actions"><span><i/>분석 기록 기반</span></div></header>
    {loading ? <div className="operations-loading"><LoaderCircle className="spin"/><span>관측 자료를 정리하고 있습니다.</span></div> : <>
      <section className="operations-situation">
        <div className="operations-map-stage">
          <div className="operations-map-copy"><span>OBSERVATION FIELD</span><strong>관측 위치를 연결할 준비가<br/>되어 있습니다.</strong><p>현재 완료된 분석 {completed.length.toLocaleString()}건은 위치 정보 없이 저장되어 있습니다.</p></div>
          <svg viewBox="0 0 760 470" role="img" aria-label="해양 관측 위치 지도 준비 화면"><defs><radialGradient id="seaGlow"><stop offset="0" stopColor="#77d8cf" stopOpacity=".28"/><stop offset="1" stopColor="#77d8cf" stopOpacity="0"/></radialGradient></defs><circle cx="390" cy="235" r="205" fill="none" stroke="rgba(174,224,219,.12)"/><circle cx="390" cy="235" r="145" fill="none" stroke="rgba(174,224,219,.16)"/><circle cx="390" cy="235" r="82" fill="url(#seaGlow)" stroke="rgba(174,224,219,.22)"/><path d="M427 62c-25 18-36 42-29 69 6 25-5 42-24 61-18 18-14 41 6 57 17 14 14 31 1 51-10 17-6 38 14 54 17 14 33 31 42 55 15-17 23-37 19-58-3-18 4-33 18-48 20-21 19-46 1-64-14-14-15-31-5-48 15-26 10-49-10-68-11-10-20-28-33-51Z" fill="rgba(191,226,222,.1)" stroke="rgba(187,229,224,.48)" strokeWidth="2"/><path d="M452 371c14 4 24 13 30 27M373 191c-32-4-61 2-86 19M380 298c-35 8-60 26-75 53" fill="none" stroke="rgba(229,107,63,.38)" strokeDasharray="6 8"/><circle cx="286" cy="209" r="5" fill="#e87850"/><circle cx="304" cy="352" r="5" fill="#e87850"/><circle cx="482" cy="399" r="5" fill="#e87850"/></svg>
          <div className="operations-map-note"><MapPinned size={18}/><div><strong>위치 데이터 미등록</strong><span>분석·현장 신고에 지역을 연결하면 이 화면에 관측 밀도가 표시됩니다.</span></div></div>
        </div>
        <aside className="operations-priority"><div className="operations-priority-label"><span>FIRST SIGNAL</span><b>빈도 기반 관측 우선순위</b></div>{lead ? <><div className="operations-lead"><small>가장 반복적으로 탐지됨</small><strong>{lead.name}</strong><p><b>{lead.count.toLocaleString()}</b>건 · 평균 신뢰도 {lead.confidence}%</p></div><p className="operations-interpretation"><TriangleAlert size={16}/>위험도 판정이 아니라, 현재 데이터에서 반복적으로 나타난 순서입니다.</p></> : <div className="operations-no-signal"><ScanLine size={28}/><strong>아직 집계할 탐지 결과가 없습니다.</strong></div>}<div className="operations-rank-list">{classRanking.slice(0, 5).map((item, index) => <article key={item.name}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.name}</strong><i><b style={{ width: `${Math.max(8, item.count / maxCount * 100)}%` }}/></i></div><em>{item.count.toLocaleString()}건</em></article>)}</div></aside>
      </section>
      <section className="operations-lower">
        <div className="operations-class-stream"><header><div><span>DETECTION FLOW</span><h3>자주 포착된 클래스</h3></div><p>완료된 분석에서 누적 <strong>{totalDetections.toLocaleString()}건</strong>의 탐지 신호를 읽었습니다.</p></header><div>{classRanking.slice(0, 7).map((item, index) => <article key={item.name}><span>{index + 1}</span><strong>{item.name}</strong><div><i style={{ width: `${item.count / maxCount * 100}%` }}/></div><b>{item.count.toLocaleString()}</b></article>)}{!classRanking.length && <p className="operations-empty-copy">분석이 완료되면 클래스 흐름이 이곳에 표시됩니다.</p>}</div></div>
        <div className="operations-report-feed"><header><div><span>CLIENT REPORTS</span><h3>최근 클라이언트 제보</h3></div><button type="button" onClick={() => onNavigate?.("bug")}>전체 보기<ArrowUpRight size={14}/></button></header><div>{reports.slice(0, 4).map((item) => <article key={item.id}><span>{item.comments.length ? "확인 중" : "접수"}</span><div><strong>{item.title}</strong><small>{item.author?.name ?? "탈퇴한 회원"} · {formatDate(item.created_at)}</small></div><em>{item.comments.length}개의 의견</em></article>)}{!reports.length && <p className="operations-empty-copy">접수된 클라이언트 제보가 없습니다.</p>}</div><footer><MessageSquareText size={15}/>현재는 버그 제보를 표시합니다. 현장 신고 채널은 위치 입력 기능과 함께 연결할 수 있습니다.</footer></div>
      </section>
    </>}
  </div>;
}

function OperationsBriefingV2({ onNavigate }: { onNavigate?: (view: WorkspaceView) => void }) {
  const [analyses, setAnalyses] = useState<AdminAnalysis[]>([]);
  const [realtimeSessions, setRealtimeSessions] = useState<AdminRealtimeSession[]>([]);
  const [period, setPeriod] = useState<7 | 30 | 0>(30);
  const [periodChanging, setPeriodChanging] = useState(false);
  const periodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);
  const [classPage, setClassPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<AdminAnalysis[]>("/admin/analyses"),api<AdminRealtimeSession[]>("/admin/realtime-sessions")])
      .then(([analysisItems,liveItems])=>{setAnalyses(analysisItems);setRealtimeSessions(liveItems)})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setHoveredTrendIndex(null); setClassPage(1); }, [period]);
  useEffect(() => () => { if (periodTimerRef.current) clearTimeout(periodTimerRef.current); }, []);

  function changePeriod(nextPeriod: 7 | 30 | 0) {
    if (nextPeriod === period) return;
    if (periodTimerRef.current) clearTimeout(periodTimerRef.current);
    setPeriodChanging(true);
    periodTimerRef.current = setTimeout(() => {
      setPeriod(nextPeriod);
      requestAnimationFrame(() => setPeriodChanging(false));
    }, 120);
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const cutoff = period === 30 ? monthStart : period === 7 ? Date.now() - period * 86400000 : yearStart;
  const scoped = analyses.filter((item) => !cutoff || new Date(item.created_at).getTime() >= cutoff);
  const completedRaw = scoped.filter((entry) => entry.status === "completed");
  const completedByObservation = new Map<string, AdminAnalysis>();
  for (const item of completedRaw) {
    const locationKey = item.video.location_confirmed && item.video.latitude != null && item.video.longitude != null
      ? `${item.video.latitude.toFixed(3)}:${item.video.longitude.toFixed(3)}`
      : "unlocated";
    const observationKey = `${item.video.content_sha256 || `media-${item.video.id}`}@${locationKey}`;
    if (!completedByObservation.has(observationKey)) completedByObservation.set(observationKey, item);
  }
  const uniqueCompleted = Array.from(completedByObservation.values());
  const completed = uniqueCompleted.filter((item) => item.video.coastal_eligible === true);
  const scopedRealtime = realtimeSessions.filter((item) => !item.is_demo && (!cutoff || new Date(item.started_at).getTime() >= cutoff));
  const completedRealtime = scopedRealtime.filter((item) => item.status === "completed" && item.coastal_eligible === true);
  const coastalExcluded = uniqueCompleted.length - completed.length;
  const failed = scoped.filter((item) => effectiveAnalysisStatus(item.status, item.error_code) === "failed");
  const cancelled = scoped.filter((item) => effectiveAnalysisStatus(item.status, item.error_code) === "cancelled");
  const active = scoped.filter((item) => ["queued", "processing"].includes(effectiveAnalysisStatus(item.status, item.error_code)));
  const duplicateCount = Math.max(0, completedRaw.length - uniqueCompleted.length);
  const reviewItems = completed.map((item) => {
    const confidence = Math.round((item.avg_confidence ?? 0) * 100);
    if (item.total_detections === 0) return { item, level: 3, label: "미탐지", reason: "객체가 탐지되지 않아 원본 확인이 필요합니다.", confidence };
    if (confidence < 50) return { item, level: 3, label: "우선 검토", reason: `평균 신뢰도가 ${confidence}%로 낮습니다.`, confidence };
    if (item.total_detections >= 500) return { item, level: 2, label: "과다 탐지", reason: `${item.total_detections.toLocaleString()}건이 탐지되어 중복 탐지 여부를 확인해야 합니다.`, confidence };
    if (confidence < 70) return { item, level: 1, label: "확인 권장", reason: `평균 신뢰도가 ${confidence}%입니다.`, confidence };
    return null;
  }).filter((value): value is NonNullable<typeof value> => value !== null).sort((a, b) => b.level - a.level || a.confidence - b.confidence).slice(0, 4);
  const reviewSignalByClass = new Map<string, (typeof reviewItems)[number]>();
  for (const review of reviewItems) {
    const primaryClass = [...(review.item.class_stats ?? [])].sort((a, b) => b.count - a.count)[0]?.class_name;
    if (primaryClass && !reviewSignalByClass.has(primaryClass)) reviewSignalByClass.set(primaryClass, review);
  }
  const dayCount = period === 7 ? 7 : period === 30 ? now.getDate() : now.getMonth() + 1;
  const daySpan = period === 7 || period === 30 ? 1 : Math.max(1, Math.ceil(Math.max(analyses.length, 1) / 10));
  const shortDate = (value: number) => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(new Date(value)).replace(/\s/g, "");
  const shortDateWithWeekday = (value: number) => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(value)).replace(/\s/g, "");
  const trendLabel = (end: number) => period === 7
    ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(end)).replace(/\s/g, "")
    : `${shortDate(end - daySpan * 86400000)}–${shortDate(end - 86400000)}`;
  const realTrend = Array.from({ length: dayCount }, (_, index) => {
    if (!period) {
      const start = new Date(now.getFullYear(), index, 1).getTime();
      const end = new Date(now.getFullYear(), index + 1, 1).getTime();
      return { label: `${index + 1}월`, count: completed.filter((item) => { const time = new Date(item.created_at).getTime(); return time >= start && time < end; }).length + completedRealtime.filter((item) => { const time = new Date(item.started_at).getTime(); return time >= start && time < end; }).length };
    }
    if (period === 30) {
      const start = monthStart + index * daySpan * 86400000;
      const end = Math.min(start + daySpan * 86400000, Date.now() + 86400000);
      return { label: shortDateWithWeekday(start), count: completed.filter((item) => { const time = new Date(item.created_at).getTime(); return time >= start && time < end; }).length + completedRealtime.filter((item) => { const time = new Date(item.started_at).getTime(); return time >= start && time < end; }).length };
    }
    const end = Date.now() - (dayCount - index - 1) * daySpan * 86400000;
    const start = end - daySpan * 86400000;
    return { label: trendLabel(end), count: completed.filter((item) => { const time = new Date(item.created_at).getTime(); return time >= start && time < end; }).length + completedRealtime.filter((item) => { const time = new Date(item.started_at).getTime(); return time >= start && time < end; }).length };
  });
  const demoCounts = period === 7 ? [4,7,5,10,8,13,9] : period === 30
    ? [3,5,4,7,6,9,5,8,11,7,10,13,9,12,8,16,11,14,10,17,13,15,12,19,14,16,11,18,15,20,17].slice(0,dayCount)
    : [24,31,28,39,46,42,55,61,58,67,73,69].slice(0,dayCount);
  const trend = realTrend.map((item,index)=>({...item,count:item.count+(demoCounts[index]??0)}));
  const rawMaxTrend = Math.max(...trend.map((item) => item.count), 1);
  const roughTrendStep = rawMaxTrend / 4;
  const trendMagnitude = Math.pow(10, Math.floor(Math.log10(roughTrendStep)));
  const normalizedTrendStep = roughTrendStep / trendMagnitude;
  const trendScaleStep = (normalizedTrendStep <= 1 ? 1 : normalizedTrendStep <= 2 ? 2 : normalizedTrendStep <= 5 ? 5 : 10) * trendMagnitude;
  const maxTrend = trendScaleStep * 4;
  const trendTotal = trend.reduce((sum, item) => sum + item.count, 0);
  const trendUnit = period === 7 ? "최근 7일 · 일별 추이" : period === 30 ? "이번 달 · 일별 추이" : "올해 · 월별 추이";
  const trendSummaryLabel = period === 7 ? "최근 7일 관측" : period === 30 ? "이번 달 관측" : "올해 관측";
  const trendCoordinates = trend.map((item, index) => ({ ...item, x: 65 + (trend.length === 1 ? 452 : index / (trend.length - 1) * 905), y: 178 - item.count / maxTrend * 138 }));
  const trendLinePath = trendCoordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const trendAreaPath = trendCoordinates.length ? `${trendLinePath} L${trendCoordinates.at(-1)!.x.toFixed(1)},178 L${trendCoordinates[0].x.toFixed(1)},178 Z` : "";
  const peakTrend = Math.max(...trend.map((item) => item.count), 0);
  const showTrendAxisLabel = (index: number) => period !== 30 || index === 0 || ((index + 1) % 5 === 0 && trendCoordinates.length - index > 2) || index === trendCoordinates.length - 1;
  const trendTooltipLabel = (label: string) => {
    if (period !== 30) return label;
    const [month, day] = label.split(".").filter(Boolean);
    return month && day ? `${month}월 ${day}일` : label;
  };
  const avgConfidence = completed.length ? Math.round(completed.reduce((sum, item) => sum + (item.avg_confidence ?? 0), 0) / completed.length * 100) : 0;
  const realtimeConfidences = completedRealtime.flatMap((item) => item.events.map((event) => event.confidence));
  const fileConfidenceValues = completed.flatMap((item) => item.avg_confidence == null ? [] : [item.avg_confidence]);
  const confidenceValues = [...fileConfidenceValues, ...realtimeConfidences];
  const demoQuality = period === 7
    ? {completed:41,failed:3,cancelled:2,active:2,duplicate:6,excluded:4,confidence:81}
    : period === 30
      ? {completed:168,failed:9,cancelled:7,active:4,duplicate:27,excluded:18,confidence:78}
      : {completed:286,failed:15,cancelled:12,active:5,duplicate:43,excluded:31,confidence:76};
  const actualCompleted = completed.length + completedRealtime.length;
  const qualityCompleted = demoQuality.completed + actualCompleted;
  const qualityFailed = demoQuality.failed + failed.length + scopedRealtime.filter((item) => item.status === "interrupted").length;
  const qualityCancelled = demoQuality.cancelled + cancelled.length;
  const qualityActive = demoQuality.active + active.length + scopedRealtime.filter((item) => item.status === "running" || item.status === "paused").length;
  const qualityDuplicate = demoQuality.duplicate + duplicateCount;
  const qualityExcluded = demoQuality.excluded + coastalExcluded + scopedRealtime.filter((item) => item.status === "completed" && item.coastal_eligible !== true).length;
  const actualConfidence = confidenceValues.length ? Math.round(confidenceValues.reduce((sum,value)=>sum+value,0)/confidenceValues.length*100) : avgConfidence;
  const qualityConfidence = actualCompleted ? Math.round((demoQuality.confidence*demoQuality.completed+actualConfidence*actualCompleted)/qualityCompleted) : demoQuality.confidence;
  const observationByMedia = new Map<number, AdminAnalysis>();
  for (const item of completed) if (!observationByMedia.has(item.video.id)) observationByMedia.set(item.video.id, item);
  const observations = Array.from(observationByMedia.values());
  const locatedObservations = observations.filter((item) => item.video.location_confirmed && item.video.latitude != null && item.video.longitude != null);
  const areaMap = new Map<string, { count: number; detections: number; latitude: number; longitude: number; description: string | null; classes: Map<string, number> }>();
  for (const item of locatedObservations) {
    const label = item.video.location_name?.trim() || `${item.video.latitude!.toFixed(3)}, ${item.video.longitude!.toFixed(3)}`;
    const value = areaMap.get(label) ?? { count: 0, detections: 0, latitude: item.video.latitude!, longitude: item.video.longitude!, description: item.video.location_description, classes: new Map<string, number>() };
    value.count += 1; value.detections += item.total_detections; areaMap.set(label, value);
    for (const stat of item.class_stats ?? []) value.classes.set(stat.class_name, (value.classes.get(stat.class_name) ?? 0) + stat.count);
  }
  for (const session of completedRealtime.filter((item)=>item.latitude!=null&&item.longitude!=null)) {
    const label=session.location_name?.trim()||`${session.latitude!.toFixed(3)}, ${session.longitude!.toFixed(3)}`;
    const value=areaMap.get(label)??{count:0,detections:0,latitude:session.latitude!,longitude:session.longitude!,description:session.location_description,classes:new Map<string,number>()};
    value.count+=1;value.detections+=session.total_events;areaMap.set(label,value);
    for(const event of session.events??[])value.classes.set(event.class_name,(value.classes.get(event.class_name)??0)+1);
  }
  const areas = Array.from(areaMap, ([name, value]) => ({ name, count: value.count, detections: value.detections, latitude: value.latitude, longitude: value.longitude, description: value.description, primaryClass: Array.from(value.classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null })).sort((left, right) => right.count - left.count || right.detections - left.detections);
  const classMap = new Map<string, number>();
  for (const item of completed) for (const stat of item.class_stats ?? []) classMap.set(stat.class_name, (classMap.get(stat.class_name) ?? 0) + stat.count);
  for (const session of completedRealtime) for (const event of session.events ?? []) classMap.set(event.class_name, (classMap.get(event.class_name) ?? 0) + 1);
  for(const item of OBSERVATION_DUMMY_CLASS_SUMMARY)classMap.set(item.name,(classMap.get(item.name)??0)+item.count);
  const classSummary = Array.from(classMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const classTotal = classSummary.reduce((sum, item) => sum + item.count, 0);
  const classPageSize = 10;
  const classPageCount = Math.max(1, Math.ceil(classSummary.length / classPageSize));
  const safeClassPage = Math.min(classPage, classPageCount);
  const visibleClassSummary = classSummary.slice((safeClassPage - 1) * classPageSize, safeClassPage * classPageSize);

  return <div className="ops-insight-board">
    {loading ? <div className="operations-loading"><LoaderCircle className="spin"/><span>관측 통계를 계산하고 있습니다.</span></div> : <div className="ops-period-content">
      <section className={`ops-analysis-row ops-period-transition${periodChanging ? " is-switching" : ""}`}>
        <article className="ops-trend-panel"><header><div><span>UNIQUE OBSERVATION TREND</span><h3>기간별 고유 관측 건수</h3><p>동일 파일의 반복 분석을 제외한 실제 관측 흐름입니다.</p></div><div className="ops-trend-period"><p><span>{trendSummaryLabel}</span><strong>{trendTotal.toLocaleString()}건</strong></p><nav aria-label="통계 기간"><button className={period === 7 ? "active" : ""} onClick={() => changePeriod(7)}>7일</button><button className={period === 30 ? "active" : ""} onClick={() => changePeriod(30)}>이번 달</button><button className={period === 0 ? "active" : ""} onClick={() => changePeriod(0)}>올해</button></nav></div></header>{<div className="ops-trend-line-chart" onMouseLeave={() => setHoveredTrendIndex(null)}><svg viewBox="0 0 1000 220" preserveAspectRatio="none" role="img" aria-label={`${trendUnit} 그래프`}><defs><linearGradient id="opsTrendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#69d3ca" stopOpacity=".38"/><stop offset="1" stopColor="#69d3ca" stopOpacity=".02"/></linearGradient><filter id="opsTrendGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>{[40,74.5,109,143.5,178].map((y, index) => <g key={y} className="trend-scale"><line x1="65" x2="970" y1={y} y2={y} className="trend-guide"/><text x="52" y={y + 3} textAnchor="end">{maxTrend - index * maxTrend / 4}건</text></g>)}<path d={trendAreaPath} className="trend-area"/><path d={trendLinePath} className="trend-line" filter="url(#opsTrendGlow)"/>{trendCoordinates.map((point, index) => <g key={`${point.label}-${index}`} className={point.count === peakTrend ? "trend-point peak" : "trend-point"} onMouseEnter={() => setHoveredTrendIndex(index)} onMouseLeave={() => setHoveredTrendIndex(null)}><circle cx={point.x} cy={point.y} r={point.count === peakTrend ? 4.5 : 2.75}/>{showTrendAxisLabel(index) && <text x={point.x} y="207" textAnchor="middle">{point.label}</text>}</g>)}</svg>{hoveredTrendIndex !== null && trendCoordinates[hoveredTrendIndex] && <div className="ops-trend-tooltip" style={{ left: `${Math.min(92, Math.max(8, trendCoordinates[hoveredTrendIndex].x / 10))}%`, top: `${Math.max(8, trendCoordinates[hoveredTrendIndex].y / 2.2)}%` }}><strong>{trendTooltipLabel(trendCoordinates[hoveredTrendIndex].label)}</strong><span>{trendCoordinates[hoveredTrendIndex].count.toLocaleString()}건</span></div>}</div>}</article>
        <aside className="ops-quality-panel"><header><span>RESULT QUALITY</span><h3>결과 품질과 집계 기준</h3></header><div className="ops-quality-core"><div className="ops-quality-ring" style={{ "--quality": `${qualityConfidence}%` } as React.CSSProperties}><strong>{qualityConfidence}<em>%</em></strong><span>완료 결과 평균 신뢰도</span></div><dl><div><dt>정상 완료</dt><dd>{qualityCompleted}건</dd></div><div><dt>실패</dt><dd className={qualityFailed ? "warning" : ""}>{qualityFailed}건</dd></div><div><dt>사용자 중단</dt><dd className={qualityCancelled ? "warning" : ""}>{qualityCancelled}건</dd></div><div><dt>진행 중</dt><dd>{qualityActive}건</dd></div></dl></div><div className="ops-quality-basis"><div><span>통계 반영</span><strong>{qualityCompleted}건</strong></div><div><span>중복 제외</span><strong className={qualityDuplicate ? "accent" : ""}>{qualityDuplicate}건</strong></div><div><span>범위 밖·미확인</span><strong className={qualityExcluded ? "accent" : ""}>{qualityExcluded}건</strong></div><p>동일 미디어는 한 번만 집계하고, 위치 미등록 또는 해안선 3km 밖의 기록은 제외합니다.</p></div></aside>
      </section>
      <section className="ops-map-section"><div className="ops-map-main"><header><div><span>BEACH OBSERVATION REPORT</span><h3>대표 해수욕장별 관측 현황</h3><p>촬영 위치를 가까운 해수욕장 또는 기타 연안으로 자동 분류합니다.</p></div></header><AdminObservationMap areas={areas}/></div><aside className="ops-map-ranking"><header><div><span>FREQUENT DETECTIONS</span><h3>자주 탐지된 부유물 TOP 10</h3></div><em>탐지량 기준</em></header><div className="ops-ranking-list">{visibleClassSummary.map((item,index) => {const signal=reviewSignalByClass.get(item.name),rank=(safeClassPage-1)*classPageSize+index+1;return <article key={item.name}><b>{String(rank).padStart(2,"0")}</b><div><div className="ops-ranking-name"><strong>{item.name}</strong>{signal&&<span className={`level-${signal.level}`}>{signal.label}</span>}</div><small>전체 탐지의 {classTotal ? Math.round(item.count/classTotal*100) : 0}%{signal&&` · 신뢰도 ${signal.confidence}% · 분석 #${signal.item.id}`}</small></div><em>{item.count.toLocaleString()}<small>탐지</small></em></article>})}{!classSummary.length&&<p className="operations-empty-copy">집계할 탐지 기록이 없습니다.</p>}</div><nav className="ops-ranking-pagination" aria-label="부유물 탐지 순위 페이지"><button type="button" aria-label="이전 순위" disabled={safeClassPage===1} onClick={()=>setClassPage(page=>Math.max(1,page-1))}><ChevronLeft size={14}/></button><span><b>{safeClassPage}</b> / {classPageCount}</span><button type="button" aria-label="다음 순위" disabled={safeClassPage===classPageCount} onClick={()=>setClassPage(page=>Math.min(classPageCount,page+1))}><ChevronRight size={14}/></button></nav></aside></section>
    </div>}
  </div>;
}

function AdminConsole({ onNavigate }: { onNavigate?: (view: WorkspaceView) => void }) {
  const [area, setArea] = useState<"observation" | "service">("observation");
  const [renderedArea, setRenderedArea] = useState<"observation" | "service">("observation");
  const [areaChanging, setAreaChanging] = useState(false);
  const areaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTab] = useState<"users" | "records" | "inquiries">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [records, setRecords] = useState<(Analysis & { owner: { id: number; name: string } })[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [inquiriesTotal, setInquiriesTotal] = useState(0);
  const [pendingInquiries, setPendingInquiries] = useState(0);
  const [analysisCounts, setAnalysisCounts] = useState<Record<AdminAnalysisLogFilter, number>>({ all: 0, active: 0, completed: 0, failed: 0, cancelled: 0 });
  const [logView, setLogView] = useState<"audit" | "analysis">("audit");
  const [analysisLogFilter, setAnalysisLogFilter] = useState<"all" | "active" | "completed" | "failed" | "cancelled">("all");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [inquiriesPage, setInquiriesPage] = useState(1);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [userFeedback, setUserFeedback] = useState("");
  const [userChangeTarget, setUserChangeTarget] = useState<{ item: AdminUser; changes: Partial<Pick<AdminUser, "role" | "active">> } | null>(null);
  const [userChangeReason, setUserChangeReason] = useState("");
  const [userChangeError, setUserChangeError] = useState("");
  const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquiryFeedback, setInquiryFeedback] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<(Analysis & { owner: { id: number; name: string } }) | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [adminListLoading, setAdminListLoading] = useState(false);
  const [adminListError, setAdminListError] = useState("");
  const adminRequestRef = useRef<AbortController | null>(null);
  const adminRequestSequence = useRef(0);
  async function load() {
    adminRequestRef.current?.abort();
    const controller = new AbortController();
    const sequence = ++adminRequestSequence.current;
    adminRequestRef.current = controller;
    setAdminListLoading(true); setAdminListError("");
    try {
      if (tab === "users") {
        const result = await api<AdminPage<AdminUser>>(`/admin/users-page?page=${usersPage}&page_size=10`, { signal: controller.signal });
        if (sequence !== adminRequestSequence.current) return;
        setUsers(result.items); setUsersTotal(result.total);
        if (usersPage > result.pages) setUsersPage(result.pages);
      }
      if (tab === "records") {
        if (logView === "analysis") {
          const result = await api<AdminPage<Analysis & { owner: { id: number; name: string } }> & { counts: Record<AdminAnalysisLogFilter, number> }>(`/admin/analyses-page?page=${logsPage}&page_size=10&status=${analysisLogFilter}`, { signal: controller.signal });
          if (sequence !== adminRequestSequence.current) return;
          setRecords(result.items); setRecordsTotal(result.total); setAnalysisCounts(result.counts);
          if (logsPage > result.pages) setLogsPage(result.pages);
        } else {
          const result = await api<AdminPage<AuditLog>>(`/admin/audit-logs-page?page=${logsPage}&page_size=10`, { signal: controller.signal });
          if (sequence !== adminRequestSequence.current) return;
          setAuditLogs(result.items); setAuditLogsTotal(result.total);
          if (logsPage > result.pages) setLogsPage(result.pages);
        }
      }
      if (tab === "inquiries") {
        const result = await api<AdminPage<Inquiry> & { pending: number }>(`/admin/inquiries-page?page=${inquiriesPage}&page_size=10`, { signal: controller.signal });
        if (sequence !== adminRequestSequence.current) return;
        setInquiries(result.items); setInquiriesTotal(result.total); setPendingInquiries(result.pending); setSelectedInquiry((current) => current ? result.items.find((item) => item.id === current.id) ?? null : null);
        if (inquiriesPage > result.pages) setInquiriesPage(result.pages);
      }
    } catch (error) {
      if (controller.signal.aborted || sequence !== adminRequestSequence.current) return;
      setAdminListError(error instanceof Error ? error.message : "관리 목록을 불러오지 못했습니다.");
    } finally {
      if (sequence === adminRequestSequence.current) setAdminListLoading(false);
    }
  }
  useEffect(() => { void load(); return () => adminRequestRef.current?.abort(); }, [tab, usersPage, logsPage, inquiriesPage, logView, analysisLogFilter]);
  useEffect(() => () => { if (areaTimerRef.current) clearTimeout(areaTimerRef.current); }, []);
  useEffect(() => { setUsersPage(1); setLogsPage(1); setInquiriesPage(1); }, [tab]);
  useEffect(() => { setLogsPage(1); }, [logView, analysisLogFilter]);
  function updateUser(item: AdminUser, changes: Partial<Pick<AdminUser, "role" | "active">>) {
    if (updatingUserId !== null) return;
    setUserChangeTarget({ item, changes }); setUserChangeReason(""); setUserChangeError(""); setUserFeedback("");
  }
  async function confirmUserChange() {
    if (!userChangeTarget || updatingUserId !== null) return;
    const reason = userChangeReason.trim();
    if (!reason) { setUserChangeError("변경 사유를 입력해 주세요."); return; }
    const { item, changes } = userChangeTarget;
    setUpdatingUserId(item.id); setUserChangeError("");
    try {
      await api(`/admin/users/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...changes, reason }) });
      setUserChangeTarget(null); setUserChangeReason("");
      await load(); setUserFeedback(`${item.name} 회원의 정보가 변경되었습니다.`);
    } catch (error) { setUserChangeError(error instanceof Error ? error.message : "회원 정보를 변경하지 못했습니다."); }
    finally { setUpdatingUserId(null); }
  }
  async function deleteRecord(id: number) {
    if (deleteBusy) return;
    const target = records.find((item) => item.id === id);
    if (!target) return;
    setDeleteTarget(target); setDeleteReason(""); setDeleteError("");
  }
  async function confirmDeleteRecord() {
    if (!deleteTarget || deleteBusy) return;
    const reason = deleteReason.trim();
    if (!reason) { setDeleteError("삭제 사유를 입력해 주세요."); return; }
    setDeleteBusy(true); setDeleteError("");
    try {
      await api(`/admin/analyses/${deleteTarget.id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
      setSelectedAnalysisId(null); setDeleteTarget(null); setDeleteReason("");
      await load();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "분석 기록을 삭제하지 못했습니다.");
    } finally { setDeleteBusy(false); }
  }
  async function answerInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedInquiry || inquiryBusy) return;
    const data = new FormData(event.currentTarget); setInquiryBusy(true); setInquiryFeedback("");
    try {
      await api(`/inquiries/${selectedInquiry.id}/answer`, { method: "PATCH", body: JSON.stringify({ answer: data.get("answer") }) });
      await load(); setInquiryFeedback(selectedInquiry.answer ? "답변이 수정되었습니다." : "답변이 등록되었습니다.");
    } catch (error) { setInquiryFeedback(error instanceof Error ? error.message : "답변을 저장하지 못했습니다."); }
    finally { setInquiryBusy(false); }
  }
  const paginatedUsers = users;
  const paginatedAuditLogs = auditLogs;
  const paginatedInquiries = inquiries;
  function changeAnalysisLogFilter(value: AdminAnalysisLogFilter) {
    const scrollTop = window.scrollY;
    setAnalysisLogFilter(value);
    setSelectedAnalysisId(null);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" })));
  }
  function changeAdminArea(nextArea: "observation" | "service") {
    if (nextArea === area) return;
    if (areaTimerRef.current) clearTimeout(areaTimerRef.current);
    setArea(nextArea); setAreaChanging(true);
    areaTimerRef.current = setTimeout(() => {
      setRenderedArea(nextArea);
      requestAnimationFrame(() => setAreaChanging(false));
    }, 120);
  }
  return <div className="admin-console-shell"><nav className="admin-area-tabs" aria-label="관리자 운영 영역"><button type="button" className={area === "observation" ? "active" : ""} aria-current={area === "observation" ? "page" : undefined} onClick={() => changeAdminArea("observation")}><strong>해양 관측 운영</strong></button><button type="button" className={area === "service" ? "active" : ""} aria-current={area === "service" ? "page" : undefined} onClick={() => changeAdminArea("service")}><strong>서비스 관리</strong></button></nav><div className={`admin-page admin-console-page admin-console-content-transition admin-area-${renderedArea}${areaChanging ? " is-switching" : ""}${adminListLoading ? " is-loading" : ""}`}>
    {renderedArea === "observation" ? <OperationsBriefingV2 onNavigate={onNavigate}/> : <><div className="admin-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><UserCog size={17}/><span><strong>회원 관리</strong><small>권한 및 이용 상태</small></span></button><button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}><Video size={17}/><span><strong>로그 관리</strong><small>전체 분석 이력</small></span></button><button className={tab === "inquiries" ? "active" : ""} onClick={() => setTab("inquiries")}><MessageSquareText size={17}/><span><strong>1:1 문의 관리</strong><small>문의 확인 및 답변</small></span></button></div>
    {adminListError && <div className="admin-list-error" role="alert"><TriangleAlert size={17}/><span><strong>목록을 불러오지 못했습니다.</strong><small>{adminListError}</small></span><button type="button" onClick={() => void load()}>다시 시도</button></div>}
    {tab === "users" && <><div className="admin-table admin-users-table"><div className="admin-row head"><span>회원</span><span>이메일</span><span>권한</span><span>이용 상태</span><span>가입일</span></div>{paginatedUsers.map((item) => { const busy = updatingUserId === item.id; const locked = updatingUserId !== null; return <div className={`admin-row ${busy ? "updating" : ""}`} key={item.id}><strong className="admin-member-name">{item.name}</strong><span className="admin-email">{item.email}</span><div className="admin-role-control" aria-label={`${item.name} 권한`}><button type="button" className={item.role === "user" ? "active" : ""} disabled={locked} onClick={() => item.role !== "user" && updateUser(item, { role: "user" })}>일반</button><button type="button" className={item.role === "admin" ? "active" : ""} disabled={locked} onClick={() => item.role !== "admin" && updateUser(item, { role: "admin" })}>관리자</button></div><button type="button" className={`admin-state-switch ${item.active ? "on" : ""}`} disabled={locked} aria-pressed={item.active} onClick={() => updateUser(item, { active: !item.active })}><i><span/></i><b>{item.active ? "활성" : "이용 정지"}</b></button><time>{formatDate(item.created_at)}</time></div>})}{!users.length && <div className="admin-empty">등록된 회원이 없습니다.</div>}{usersTotal > 10 && <AdminPagination page={usersPage} total={usersTotal} onChange={setUsersPage}/>}</div>{userFeedback && <p className="admin-feedback" role="status">{userFeedback}</p>}</>}
    {tab === "records" && <div className="admin-log-view">{selectedAnalysisId ? <main className="records-detail-page"><header className="records-detail-nav"><button type="button" onClick={() => setSelectedAnalysisId(null)}><ArrowLeft size={17}/>분석 기록 목록</button><span>ADMIN ANALYSIS REPORT · #{selectedAnalysisId}</span></header><div className="records-detail-content"><AnalysisDetail adminMode id={selectedAnalysisId} relatedAnalyses={records.filter((analysis) => { const target = records.find((candidate) => candidate.id === selectedAnalysisId); return target?.batch_id ? analysis.batch_id === target.batch_id : analysis.id === selectedAnalysisId; })} onUpdated={() => void load()}/></div></main> : <><nav className="admin-log-switch" aria-label="로그 종류"><button type="button" className={logView === "audit" ? "active" : ""} onClick={() => setLogView("audit")}><strong>감사 로그</strong><small>관리자 운영 작업</small></button><button type="button" className={logView === "analysis" ? "active" : ""} onClick={() => setLogView("analysis")}><strong>분석 기록</strong><small>전체 사용자 분석 이력</small></button></nav>{logView === "audit" ? <section className="admin-log-panel"><header><strong>관리자 감사 로그</strong><span>권한 변경, 계정 정지, 삭제 및 답변 이력</span></header><div className="admin-table"><div className="admin-row audit head"><span>수행 관리자</span><span>작업</span><span>대상</span><span>사유</span><span>수행 시간</span></div>{paginatedAuditLogs.map((item) => <div className="admin-row audit" key={item.id}><strong>{item.actor.name}</strong><span>{auditActionLabel(item.action)}</span><span>{item.target_label ?? `${item.target_type} #${item.target_id ?? "-"}`}</span><span>{item.reason}</span><time>{formatDateTime(item.created_at)}</time></div>)}{!auditLogs.length && <div className="admin-empty">기록된 관리자 작업이 없습니다.</div>}{auditLogsTotal > 10 && <AdminPagination page={logsPage} total={auditLogsTotal} onChange={setLogsPage}/>}</div></section> : <AdminAnalysisLog records={records} total={recordsTotal} counts={analysisCounts} filter={analysisLogFilter} page={logsPage} onPageChange={setLogsPage} onFilterChange={changeAnalysisLogFilter} onOpen={setSelectedAnalysisId} onDelete={deleteRecord}/>}</>}</div>}
    {tab === "inquiries" && <section className="admin-inquiry-list"><header><div><strong>접수된 문의</strong><span>문의 내용을 확인하고 같은 화면에서 답변합니다.</span></div><b>{pendingInquiries}건 대기</b></header>{paginatedInquiries.map((item) => { const expanded = selectedInquiry?.id === item.id; return <article className={expanded ? "open" : ""} key={item.id}><button type="button" onClick={() => { setInquiryFeedback(""); setSelectedInquiry(expanded ? null : item); }}><span className={`status ${item.status === "answered" ? "completed" : "processing"}`}>{item.status === "answered" ? "답변 완료" : "접수"}</span><strong>{item.title}</strong><small>{item.user.name} · {item.user.email}</small><time>{formatDate(item.created_at)}</time><ChevronDown size={17}/></button>{expanded && <div className="admin-inquiry-detail"><div className="admin-inquiry-question"><small>문의 내용</small><p>{item.content}</p>{item.attachments?.length > 0 && <InquiryAttachments files={item.attachments}/>}</div><form onSubmit={answerInquiry}><label><span>관리자 답변</span><textarea name="answer" rows={6} required defaultValue={item.answer ?? ""} placeholder="회원에게 전달할 답변을 작성하세요."/></label>{inquiryFeedback && <p className="inquiry-feedback" role="status">{inquiryFeedback}</p>}<button className="primary-button" disabled={inquiryBusy}><Send size={15}/>{inquiryBusy ? "저장 중..." : item.answer ? "답변 수정" : "답변 등록"}</button></form></div>}</article> })}{!inquiries.length && <div className="admin-empty">접수된 문의가 없습니다.</div>}{inquiriesTotal > 10 && <AdminPagination page={inquiriesPage} total={inquiriesTotal} onChange={(page) => { setInquiriesPage(page); setSelectedInquiry(null); }}/>}</section>}</>}
  </div></div>;
}

function AdminUserChangeDialog({ target, reason, busy, error, onReasonChange, onClose, onConfirm }: { target: { item: AdminUser; changes: Partial<Pick<AdminUser, "role" | "active">> }; reason: string; busy: boolean; error: string; onReasonChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  const isRoleChange = target.changes.role !== undefined;
  const nextValue = isRoleChange ? target.changes.role === "admin" ? "관리자 권한" : "일반 권한" : target.changes.active ? "이용 활성" : "이용 정지";
  return createPortal(<div className="record-delete-backdrop" role="presentation" onMouseDown={onClose}><section className="record-delete-modal admin-record-delete-modal admin-user-change-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-change-title" onMouseDown={(event) => event.stopPropagation()}><span><UserCog size={23}/></span><p className="section-kicker">USER CONTROL</p><h2 id="admin-user-change-title">{isRoleChange ? "회원 권한을 변경할까요?" : "이용 상태를 변경할까요?"}</h2><p>변경 내용과 사유는 관리자 감사 로그에 기록됩니다.</p><div className="admin-delete-target"><small>변경 대상</small><strong>{target.item.name}</strong><em>{target.item.email}</em><small className="admin-change-next">변경 후 · <b>{nextValue}</b></small></div><label className="admin-delete-reason"><span>변경 사유</span><textarea rows={3} maxLength={300} value={reason} disabled={busy} autoFocus onChange={(event) => onReasonChange(event.target.value)} placeholder="권한 또는 이용 상태를 변경하는 사유를 입력해 주세요."/></label>{error && <p className="record-delete-error"><CircleHelp size={14}/>{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="button" className="confirm" disabled={busy || !reason.trim()} onClick={onConfirm}>{busy ? <><LoaderCircle className="spin" size={15}/>변경 중...</> : "변경 적용"}</button></footer></section></div>, document.body);
}

function AdminDeleteAnalysisDialog({ item, reason, busy, error, onReasonChange, onClose, onConfirm }: { item: Analysis & { owner: { id: number; name: string } }; reason: string; busy: boolean; error: string; onReasonChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return createPortal(<div className="record-delete-backdrop" role="presentation" onMouseDown={onClose}><section className="record-delete-modal admin-record-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="admin-delete-record-title" onMouseDown={(event) => event.stopPropagation()}><span><Trash2 size={23}/></span><p className="section-kicker">DELETE ANALYSIS</p><h2 id="admin-delete-record-title">분석 기록을 삭제할까요?</h2><p>분석 결과와 생성 파일이 함께 삭제됩니다.<br/>삭제한 기록은 복구할 수 없습니다.</p><div className="admin-delete-target"><small>삭제할 기록</small><strong>{item.video.name}</strong><em>{item.owner.name} · {item.model.name}</em></div><label className="admin-delete-reason"><span>삭제 사유</span><textarea rows={3} maxLength={300} value={reason} disabled={busy} onChange={(event) => onReasonChange(event.target.value)} placeholder="감사 로그에 남길 삭제 사유를 입력해 주세요."/></label>{error && <p className="record-delete-error"><CircleHelp size={14}/>{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="button" className="danger" disabled={busy || !reason.trim()} onClick={onConfirm}>{busy ? <><LoaderCircle className="spin" size={15}/>삭제 중...</> : "기록 삭제"}</button></footer></section></div>, document.body);
}

type AdminAnalysisLogFilter = "all" | "active" | "completed" | "failed" | "cancelled";
type AdminPage<T> = { items: T[]; total: number; page: number; page_size: number; pages: number };

const analysisFailureMeta: Partial<Record<NonNullable<Analysis["error_code"]>, { label: string; message: string }>> = {
  MODEL_LOAD_FAILED: { label: "모델 오류", message: "AI 모델을 불러오지 못했습니다." },
  MEDIA_READ_FAILED: { label: "미디어 오류", message: "미디어 파일을 읽지 못했습니다." },
  VIDEO_CODEC_UNSUPPORTED: { label: "코덱 오류", message: "지원하지 않는 영상 형식 또는 코덱입니다." },
  OUTPUT_CREATE_FAILED: { label: "결과 생성 오류", message: "분석 결과 파일을 생성하지 못했습니다." },
  INSUFFICIENT_STORAGE: { label: "저장 공간 부족", message: "결과를 저장할 공간이 부족합니다." },
  SERVER_RESTARTED: { label: "서버 재시작", message: "서버 재시작으로 분석이 중단되었습니다." },
  RECOVERY_INPUT_MISSING: { label: "복구 입력 누락", message: "분석 복구에 필요한 입력 파일을 찾지 못했습니다." },
  USER_CANCELLED: { label: "사용자 중단", message: "사용자가 분석을 직접 중단했습니다." },
  INFERENCE_FAILED: { label: "추론 오류", message: "AI 추론 과정에서 문제가 발생했습니다." },
};

function AdminAnalysisLog({ records, total, counts, filter, page, onPageChange, onFilterChange, onOpen, onDelete }: {
  records: (Analysis & { owner: { id: number; name: string } })[];
  total: number;
  counts: Record<AdminAnalysisLogFilter, number>;
  filter: AdminAnalysisLogFilter;
  page: number;
  onPageChange: (page: number) => void;
  onFilterChange: (value: AdminAnalysisLogFilter) => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
}) {
  const [recordType, setRecordType] = useState<"upload" | "realtime">("upload");
  const expandedId: number | null = null;
  const onToggle = onOpen;
  const filtered = records;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered;
  const filters: { value: AdminAnalysisLogFilter; label: string }[] = [
    { value: "all", label: "전체" }, { value: "active", label: "진행 중" }, { value: "completed", label: "완료" },
    { value: "failed", label: "시스템 실패" }, { value: "cancelled", label: "사용자 중단" },
  ];
  return <><nav className="admin-record-type-tabs" aria-label="분석 기록 유형"><button type="button" className={recordType === "upload" ? "active" : ""} onClick={() => setRecordType("upload")}><strong>업로드 분석</strong><small>파일 기반 분석 결과</small></button><button type="button" className={recordType === "realtime" ? "active" : ""} onClick={() => setRecordType("realtime")}><strong>실시간 탐지</strong><small>시작부터 종료까지 세션 기록</small></button></nav>{recordType === "realtime" ? <AdminRealtimeDemo/> : <section className="admin-log-panel admin-analysis-log">
    <header><div><strong>분석 기록</strong><span>오류 원인별로 전체 사용자의 분석 이력을 확인합니다.</span></div><p>실패 통계 <b>{counts.failed}건</b><small>사용자 중단 제외</small></p></header>
    <nav className="admin-analysis-filters" aria-label="분석 상태 필터"><span className="admin-analysis-filter-label">처리 상태</span><div>{filters.map((item) => <button key={item.value} type="button" className={filter === item.value ? "active" : ""} onClick={() => onFilterChange(item.value)}><span>{item.label}</span><b>{counts[item.value]}</b></button>)}</div></nav>
    <div className="admin-table admin-analysis-table"><div className="admin-row record head"><span>사용자</span><span>분석 미디어</span><span>적용 모델</span><span>상태·원인</span><span>관리</span></div>{paginated.map((item) => {
      const effectiveStatus = effectiveAnalysisStatus(item.status, item.error_code);
      const cancelled = effectiveStatus === "cancelled";
      const systemFailed = effectiveStatus === "failed";
      const failureCode = cancelled ? "USER_CANCELLED" : systemFailed ? item.error_code ?? "INFERENCE_FAILED" : null;
      const failure = failureCode ? analysisFailureMeta[failureCode] : undefined;
      const statusLabel = analysisStatusLabel(item.status, item.progress, item.error_code);
      const expanded = expandedId === item.id;
      const resultMessage = failure?.message ?? (item.status === "completed" ? "분석이 정상적으로 완료되었습니다." : item.status === "processing" ? "현재 AI 추론을 진행하고 있습니다." : "분석 시작을 기다리고 있습니다.");
      return <article className={`admin-analysis-entry ${expanded ? "open" : ""}`} key={item.id}><div className="admin-row record"><button type="button" className="admin-analysis-row-main" aria-expanded={expanded} onClick={() => onToggle(item.id)}><strong>{item.owner.name}</strong><span>{item.video.name}</span><span>{item.model.name}</span><span className={`status admin-analysis-status ${effectiveStatus}`}>{statusLabel}</span><ChevronDown size={15}/></button><button className="table-icon" aria-label="분석 로그 삭제" title="분석 로그 삭제" onClick={() => void onDelete(item.id)}><Trash2 size={15}/></button></div>{expanded && <div className="admin-analysis-detail"><div><small>처리 결과 안내</small><strong>{resultMessage}</strong></div><div><small>운영 분류</small><code>{failureCode ?? (effectiveStatus === "completed" ? "NORMAL_COMPLETION" : "IN_PROGRESS")}</code></div><div><small>기록 번호·생성 시각</small><strong>#{item.id} · {formatDateTime(item.created_at)}</strong></div>{systemFailed && <p><TriangleAlert size={14}/>상세 예외 정보는 사용자 화면에 노출하지 않고 서버 로그에서 확인합니다.</p>}</div>}</article>;
    })}{!filtered.length && <div className="admin-empty">선택한 조건에 해당하는 분석 기록이 없습니다.</div>}{total > 10 && <AdminPagination page={safePage} total={total} onChange={onPageChange}/>}</div>
  </section>}</>;
}

function AdminPagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => start + index);
  return <nav className="records-pagination admin-pagination" aria-label="관리 목록 페이지"><button type="button" aria-label="첫 페이지" disabled={page === 1} onClick={() => onChange(1)}><ChevronFirst size={15}/></button><button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15}/></button>{pages.map((item) => <button type="button" key={item} className={page === item ? "active" : ""} aria-current={page === item ? "page" : undefined} onClick={() => onChange(item)}>{item}</button>)}<button type="button" aria-label="다음 페이지" disabled={page === pageCount} onClick={() => onChange(page + 1)}><ChevronRight size={15}/></button><button type="button" aria-label="마지막 페이지" disabled={page === pageCount} onClick={() => onChange(pageCount)}><ChevronLast size={15}/></button></nav>;
}

function categoryName(value: ContentItem["category"]) { return { free: "자유", bug: "버그", notice: "공지", faq: "FAQ" }[value]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function auditActionLabel(value: AuditLog["action"]) { return { "user.update": "회원 정보 변경", "analysis.delete": "분석 기록 삭제", "content.update": "게시글 수정", "content.delete": "게시글 삭제", "inquiry.answer": "문의 답변" }[value]; }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))}KB` : `${(value / 1024 / 1024).toFixed(1)}MB`; }
function shortFailureReason(value: string | null) { if (!value) return "원인을 확인할 수 없습니다."; if (value.includes("중단")) return "사용자가 분석을 중단했습니다."; if (value.includes("모델")) return "모델을 불러오거나 실행하지 못했습니다."; if (value.includes("서버")) return "서버 재시작으로 분석이 종료됐습니다."; return value.length > 54 ? `${value.slice(0, 54)}…` : value; }
