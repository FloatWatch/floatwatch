"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CircleHelp, Code2, Database, Download, Eye, FileText, Inbox, Layers3, LoaderCircle, Megaphone, MessageSquareText, Paperclip, PenLine, RadioTower, ScanLine, Send, ShieldCheck, Ship, Trash2, UserCog, Video, Waves } from "lucide-react";
import { API_URL, api } from "@/lib/api";
import type { AdminUser, Analysis, AuditLog, ContentItem, Inquiry, User } from "@/lib/types";
import { DevelopmentInfoPage, ProjectOverviewPage } from "./public-home";

export type WorkspaceView = "home" | "overview" | "development" | "analysis" | "records" | "compare" | "free" | "inquiry" | "faq" | "notice" | "admin";

export const viewTitles: Record<WorkspaceView, { kicker: string; title: string }> = {
  home: { kicker: "MY FLOATWATCH", title: "홈" },
  overview: { kicker: "PROJECT OVERVIEW", title: "프로젝트 개요" },
  development: { kicker: "DEVELOPMENT INFO", title: "개발정보" },
  analysis: { kicker: "AI OBSERVATION", title: "부유물 탐색" },
  records: { kicker: "OBSERVATION LOG", title: "내 탐색 기록" },
  compare: { kicker: "AI PERFORMANCE", title: "AI 성능 비교" },
  free: { kicker: "COMMUNITY", title: "자유게시판" },
  inquiry: { kicker: "PRIVATE SUPPORT", title: "1:1 문의" },
  faq: { kicker: "HELP CENTER", title: "자주 묻는 질문" },
  notice: { kicker: "SERVICE NEWS", title: "공지사항" },
  admin: { kicker: "ADMINISTRATION", title: "관리자 페이지" },
};

export function WorkspaceSection({ view, user, onNavigate }: { view: Exclude<WorkspaceView, "home" | "analysis" | "records" | "compare">; user: User; onNavigate?: (view: WorkspaceView) => void }) {
  if (view === "overview") return <ProjectOverviewPage onStart={() => onNavigate?.("analysis")}/>;
  if (view === "development") return <DevelopmentInfoPage/>;
  if (view === "inquiry") return <InquirySection user={user}/>;
  if (view === "admin") return <AdminConsole/>;
  return <ContentSection category={view} user={user}/>;
}

function ContentSection({ category, user }: { category: "free" | "faq" | "notice"; user: User }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [writing, setWriting] = useState(false);
  const [loading, setLoading] = useState(true);
  const canWrite = category === "free" || user.role === "admin";
  const labels = { free: "자유게시판", faq: "자주 묻는 질문", notice: "공지사항" };

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

function AdminConsole() {
  const [tab, setTab] = useState<"users" | "records" | "inquiries">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [records, setRecords] = useState<(Analysis & { owner: { id: number; name: string } })[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logView, setLogView] = useState<"audit" | "analysis">("audit");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [userFeedback, setUserFeedback] = useState("");
  const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquiryFeedback, setInquiryFeedback] = useState("");
  async function load() {
    if (tab === "users") setUsers(await api<AdminUser[]>("/admin/users"));
    if (tab === "records") {
      const [analysisItems, auditItems] = await Promise.all([
        api<(Analysis & { owner: { id: number; name: string } })[]>("/admin/analyses"),
        api<AuditLog[]>("/admin/audit-logs"),
      ]);
      setRecords(analysisItems);
      setAuditLogs(auditItems);
    }
    if (tab === "inquiries") { const items = await api<Inquiry[]>("/inquiries"); setInquiries(items); setSelectedInquiry((current) => current ? items.find((item) => item.id === current.id) ?? null : null); }
  }
  useEffect(() => { load(); }, [tab]);
  async function updateUser(item: AdminUser, changes: Partial<AdminUser>) {
    const reason = window.prompt("변경 사유를 입력하세요.");
    if (!reason?.trim()) return;
    setUpdatingUserId(item.id); setUserFeedback("");
    try {
      await api(`/admin/users/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...changes, reason: reason.trim() }) });
      await load(); setUserFeedback(`${item.name} 회원의 정보가 변경되었습니다.`);
    } catch (error) { setUserFeedback(error instanceof Error ? error.message : "회원 정보를 변경하지 못했습니다."); }
    finally { setUpdatingUserId(null); }
  }
  async function deleteRecord(id: number) { if (!confirm("분석 기록을 삭제하시겠습니까?")) return; const reason = window.prompt("삭제 사유를 입력하세요."); if (!reason?.trim()) return; await api(`/admin/analyses/${id}?reason=${encodeURIComponent(reason.trim())}`, { method: "DELETE" }); await load(); }
  async function answerInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedInquiry || inquiryBusy) return;
    const data = new FormData(event.currentTarget); setInquiryBusy(true); setInquiryFeedback("");
    try {
      await api(`/inquiries/${selectedInquiry.id}/answer`, { method: "PATCH", body: JSON.stringify({ answer: data.get("answer") }) });
      await load(); setInquiryFeedback(selectedInquiry.answer ? "답변이 수정되었습니다." : "답변이 등록되었습니다.");
    } catch (error) { setInquiryFeedback(error instanceof Error ? error.message : "답변을 저장하지 못했습니다."); }
    finally { setInquiryBusy(false); }
  }
  const itemCount = tab === "users" ? `${users.length}명` : tab === "records" ? `${records.length}건` : `${inquiries.length}건`;
  return <div className="admin-page admin-console-page"><header className="admin-console-intro"><div><p className="section-kicker">SERVICE CONTROL</p><h2>서비스 운영 관리</h2><p>회원 상태와 분석 로그, 비공개 문의를 확인하고 관리합니다.</p></div><span>{itemCount}</span></header><div className="admin-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><UserCog size={17}/><span><strong>회원 관리</strong><small>권한 및 이용 상태</small></span></button><button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}><Video size={17}/><span><strong>로그 관리</strong><small>전체 분석 이력</small></span></button><button className={tab === "inquiries" ? "active" : ""} onClick={() => setTab("inquiries")}><MessageSquareText size={17}/><span><strong>1:1 문의 관리</strong><small>문의 확인 및 답변</small></span></button></div>
    {tab === "users" && <><div className="admin-table"><div className="admin-row head"><span>회원</span><span>이메일</span><span>권한</span><span>이용 상태</span><span>가입일</span></div>{users.map((item) => { const busy = updatingUserId === item.id; return <div className={`admin-row ${busy ? "updating" : ""}`} key={item.id}><strong className="admin-member-name">{item.name}</strong><span className="admin-email">{item.email}</span><div className="admin-role-control" aria-label={`${item.name} 권한`}><button type="button" className={item.role === "user" ? "active" : ""} disabled={busy} onClick={() => item.role !== "user" && updateUser(item, { role: "user" })}>일반</button><button type="button" className={item.role === "admin" ? "active" : ""} disabled={busy} onClick={() => item.role !== "admin" && updateUser(item, { role: "admin" })}>관리자</button></div><button type="button" className={`admin-state-switch ${item.active ? "on" : ""}`} disabled={busy} aria-pressed={item.active} onClick={() => updateUser(item, { active: !item.active })}><i><span/></i><b>{item.active ? "활성" : "이용 정지"}</b></button><time>{formatDate(item.created_at)}</time></div>})}{!users.length && <div className="admin-empty">등록된 회원이 없습니다.</div>}</div>{userFeedback && <p className="admin-feedback" role="status">{userFeedback}</p>}</>}
    {tab === "records" && <div className="admin-log-view"><nav className="admin-log-switch" aria-label="로그 종류"><button type="button" className={logView === "audit" ? "active" : ""} onClick={() => setLogView("audit")}><strong>감사 로그</strong><small>관리자 운영 작업</small></button><button type="button" className={logView === "analysis" ? "active" : ""} onClick={() => setLogView("analysis")}><strong>분석 기록</strong><small>전체 사용자 분석 이력</small></button></nav>{logView === "audit" ? <section className="admin-log-panel"><header><strong>관리자 감사 로그</strong><span>권한 변경, 계정 정지, 삭제 및 답변 이력</span></header><div className="admin-table"><div className="admin-row audit head"><span>수행 관리자</span><span>작업</span><span>대상</span><span>사유</span><span>수행 시간</span></div>{auditLogs.map((item) => <div className="admin-row audit" key={item.id}><strong>{item.actor.name}</strong><span>{auditActionLabel(item.action)}</span><span>{item.target_label ?? `${item.target_type} #${item.target_id ?? "-"}`}</span><span>{item.reason}</span><time>{formatDateTime(item.created_at)}</time></div>)}{!auditLogs.length && <div className="admin-empty">기록된 관리자 작업이 없습니다.</div>}</div></section> : <section className="admin-log-panel"><header><strong>분석 기록</strong><span>전체 사용자의 분석 이력</span></header><div className="admin-table"><div className="admin-row record head"><span>사용자</span><span>분석 미디어</span><span>적용 모델</span><span>상태</span><span>관리</span></div>{records.map((item) => <div className="admin-row record" key={item.id}><strong>{item.owner.name}</strong><span>{item.video.name}</span><span>{item.model.name}</span><span className={`status ${item.status}`}>{({ queued: "대기", processing: "분석 중", completed: "완료", failed: "실패" })[item.status]}</span><button className="table-icon" aria-label="분석 로그 삭제" title="분석 로그 삭제" onClick={() => deleteRecord(item.id)}><Trash2 size={15}/></button></div>)}{!records.length && <div className="admin-empty">저장된 분석 로그가 없습니다.</div>}</div></section>}</div>}
    {tab === "inquiries" && <section className="admin-inquiry-list"><header><div><strong>접수된 문의</strong><span>문의 내용을 확인하고 같은 화면에서 답변합니다.</span></div><b>{inquiries.filter((item) => item.status !== "answered").length}건 대기</b></header>{inquiries.map((item) => { const expanded = selectedInquiry?.id === item.id; return <article className={expanded ? "open" : ""} key={item.id}><button type="button" onClick={() => { setInquiryFeedback(""); setSelectedInquiry(expanded ? null : item); }}><span className={`status ${item.status === "answered" ? "completed" : "processing"}`}>{item.status === "answered" ? "답변 완료" : "접수"}</span><strong>{item.title}</strong><small>{item.user.name} · {item.user.email}</small><time>{formatDate(item.created_at)}</time><ChevronDown size={17}/></button>{expanded && <div className="admin-inquiry-detail"><div className="admin-inquiry-question"><small>문의 내용</small><p>{item.content}</p>{item.attachments?.length > 0 && <InquiryAttachments files={item.attachments}/>}</div><form onSubmit={answerInquiry}><label><span>관리자 답변</span><textarea name="answer" rows={6} required defaultValue={item.answer ?? ""} placeholder="회원에게 전달할 답변을 작성하세요."/></label>{inquiryFeedback && <p className="inquiry-feedback" role="status">{inquiryFeedback}</p>}<button className="primary-button" disabled={inquiryBusy}><Send size={15}/>{inquiryBusy ? "저장 중..." : item.answer ? "답변 수정" : "답변 등록"}</button></form></div>}</article> })}{!inquiries.length && <div className="admin-empty">접수된 문의가 없습니다.</div>}</section>}
  </div>;
}

function categoryName(value: ContentItem["category"]) { return { free: "자유", notice: "공지", faq: "FAQ" }[value]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function auditActionLabel(value: AuditLog["action"]) { return { "user.update": "회원 정보 변경", "analysis.delete": "분석 기록 삭제", "content.update": "게시글 수정", "content.delete": "게시글 삭제", "inquiry.answer": "문의 답변" }[value]; }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))}KB` : `${(value / 1024 / 1024).toFixed(1)}MB`; }
