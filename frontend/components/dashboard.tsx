"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BarChart3, Box, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, FileText, FileVideo, LogOut, Megaphone,
  Menu, MessageSquareText, Plus, ScanLine, ShieldCheck, UserCircle, Waves, X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Analysis, ModelArtifact, User, VideoAsset } from "@/lib/types";
import { AnalysisDetail } from "./analysis-detail";
import { UploadDialog } from "./upload-dialog";
import { WorkspaceSection, type WorkspaceView, viewTitles } from "./workspace-sections";
import { AnalysisComparison } from "./analysis-comparison";
import { BrandWordmark } from "./brand-wordmark";
import { AuthScreen } from "./auth-screen";

export function Dashboard({
  user,
  onLogout,
  onUserUpdated,
  initialView = "home",
}: {
  user: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
  initialView?: WorkspaceView;
}) {
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [viewRevision, setViewRevision] = useState(0);
  const [models, setModels] = useState<ModelArtifact[]>([]);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [inquiryCount, setInquiryCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<number | null>(null);
  const [upload, setUpload] = useState<"model" | "video" | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileName, setProfileName] = useState(user.name);
  const [profilePassword, setProfilePassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<"project" | "analysis" | "board" | null>(null);
  const [openPicker, setOpenPicker] = useState<"video" | "model" | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [error, setError] = useState("");
  const resultSectionRef = useRef<HTMLElement>(null);

  async function refresh() {
    const [modelItems, videoItems, analysisItems, summary] = await Promise.all([
      api<ModelArtifact[]>("/models"),
      api<VideoAsset[]>("/videos"),
      api<Analysis[]>("/analyses"),
      api<{ analyses: number; inquiries: number }>("/auth/me/summary").catch(() => ({ analyses: 0, inquiries: 0 })),
    ]);
    setModels(modelItems); setVideos(videoItems); setAnalyses(analysisItems);
    setInquiryCount(summary.inquiries);
    if (!selected && analysisItems.length) setSelected(analysisItems[0].id);
  }
  useEffect(() => {
    refresh().catch((error) => {
      if (error instanceof ApiError && error.status === 401) onLogout();
      else setError(error instanceof Error ? error.message : "서비스 정보를 불러오지 못했습니다.");
    });
  }, []);
  useEffect(() => {
    if (!analyses.some((item) => item.status === "queued" || item.status === "processing")) return;
    const timer = setInterval(() => refresh().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [analyses]);
  useEffect(() => {
    if (!currentAnalysisId) return;
    const frame = window.requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentAnalysisId]);
  useEffect(() => {
    function restoreWorkspaceLocation() {
      const next = new URLSearchParams(window.location.search).get("workspace") as WorkspaceView | null;
      setProfilePanelOpen(false);
      setView(next ?? "home");
    }
    window.addEventListener("popstate", restoreWorkspaceLocation);
    return () => window.removeEventListener("popstate", restoreWorkspaceLocation);
  }, []);

  const completed = useMemo(() => analyses.filter((item) => item.status === "completed"), [analyses]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const item = await api<Analysis>("/analyses", { method: "POST", body: JSON.stringify({ model_id: Number(data.get("model")), video_id: Number(data.get("video")), confidence: Number(data.get("confidence")), frame_stride: Number(data.get("stride")) }) });
      await refresh(); setSelected(item.id); setCurrentAnalysisId(item.id);
    } catch (err) { setError(err instanceof Error ? err.message : "분석을 시작하지 못했습니다."); }
  }
  async function logout() { await api("/auth/logout", { method: "POST" }).catch(() => {}); onLogout(); }
  function openUpload(type: "model" | "video") {
    setOpenPicker(null);
    setUpload(type);
  }
  function navigate(next: WorkspaceView) {
    setProfilePanelOpen(false);
    setView(next);
    setViewRevision((value) => value + 1);
    const url = next === "home" ? "/auth" : `/auth?workspace=${next}`;
    window.history.pushState({ workspace: next }, "", url);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setNavOpen(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function openMyPage() {
    setProfilePanelOpen(true);
    setProfileMessage("");
    window.history.replaceState({ workspace: view, profile: true }, "", `/auth?workspace=${view}&profile=1`);
  }
  function closeMyPage() {
    setProfilePanelOpen(false);
    setProfileEditing(false);
    window.history.replaceState({ workspace: view }, "", `/auth?workspace=${view}`);
  }
  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProfileBusy(true); setProfileMessage("");
    try {
      const updated = await api<User>("/auth/me", { method: "PATCH", body: JSON.stringify({ name: profileName.trim(), password: profilePassword || undefined }) });
      onUserUpdated(updated); setProfilePassword(""); setProfileEditing(false); setProfileMessage("개인 정보가 변경되었습니다.");
    } catch (err) { setProfileMessage(err instanceof Error ? err.message : "개인 정보를 변경하지 못했습니다."); }
    finally { setProfileBusy(false); }
  }
  if (view === "home" || view === "overview" || view === "development" || view === "notice" || view === "free" || view === "faq") {
    return <AuthScreen
      authenticatedUser={user}
      initialPanelCollapsed
      isPanelOpen={false}
      showPanelToggle={false}
      onWorkspaceNavigate={navigate}
      onAuthenticatedLogout={logout}
      onUserUpdated={onUserUpdated}
      profileStats={{ analyses: analyses.length, inquiries: inquiryCount }}
      contentView={view === "overview" ? "overview" : view === "development" ? "development" : view === "free" ? "community" : view === "notice" || view === "faq" ? view : "home"}
      onStartAnalysis={() => navigate("analysis")}
      onHeaderNavigate={(next) => navigate(next === "community" ? "free" : next)}
    />;
  }
  const isStoryView = false;

  return <div className={`auth-entry-shell analysis-entry-shell analysis-center-shell analysis-center-${view}`}>
    <main className="auth-shell auth-shell-collapsed analysis-auth-shell">
    <section className="auth-visual analysis-auth-visual">
    <span className="auth-shade" aria-hidden="true"/>
    <header className="auth-topline analysis-workspace-topline">
      <button className="brand-lockup auth-brand-home" type="button" onClick={() => navigate("home")} aria-label="메인 화면으로 이동"><BrandWordmark inverse/></button>
      <nav className="auth-top-menu" aria-label="상단 메뉴" onMouseLeave={() => setOpenMenu(null)}>
        <div className={`auth-menu-group ${openMenu === "project" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("project")}>
          <button className="auth-menu-trigger" type="button">프로젝트 소개</button>
          <div><button type="button" onClick={() => { setOpenMenu(null); navigate("overview"); }}>프로젝트 개요</button><button type="button" onClick={() => { setOpenMenu(null); navigate("development"); }}>개발정보</button></div>
        </div>
        <div className={`auth-menu-group ${openMenu === "analysis" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("analysis")}>
          <button className="auth-menu-trigger" type="button">분석 센터</button>
          <div><button type="button" onClick={() => { setOpenMenu(null); navigate("analysis"); }}>부유물 탐색</button><button type="button" onClick={() => { setOpenMenu(null); navigate("records"); }}>탐색 기록</button><button type="button" onClick={() => { setOpenMenu(null); navigate("compare"); }}>AI 성능 비교</button></div>
        </div>
        <div className={`auth-menu-group ${openMenu === "board" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("board")}>
          <button className="auth-menu-trigger" type="button">게시판</button>
          <div><button type="button" onClick={() => { setOpenMenu(null); navigate("notice"); }}>공지사항</button><button type="button" onClick={() => { setOpenMenu(null); navigate("free"); }}>자유게시판</button><button type="button" onClick={() => { setOpenMenu(null); navigate("faq"); }}>자주 묻는 질문</button></div>
        </div>
      </nav>
      <button className="header-login auth-header-login" type="button" onClick={openMyPage}><UserCircle size={15}/>마이페이지</button>
    </header>

    <div className="workspace analysis-workspace">
      {!isStoryView && <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setNavOpen(true)}><Menu size={20}/></button>
        <div><p className="section-kicker">{viewTitles[view].kicker}</p><h1>{viewTitles[view].title}</h1></div>
      </header>}

      <div key={`${view}-${viewRevision}`} className={`${isStoryView ? "workspace-body story-workspace-body public-shell public-view-" + view : "workspace-body"} page-content-transition`}>
        {view === "analysis" && <>
          <section className="analysis-upload-workspace"><form onSubmit={start}>
            <div className="analysis-upload-columns">
              <article><span className="analysis-upload-icon"><FileVideo size={24}/></span><div><p className="section-kicker">INPUT MEDIA</p><h2>분석 미디어</h2><p>부유물을 탐지할 이미지 또는 동영상을 등록하세요.</p></div><button type="button" className="secondary-button" aria-haspopup="dialog" onClick={() => openUpload("video")}><Plus size={16}/>미디어 업로드</button><AnalysisPicker name="video" label="등록된 미디어" placeholder="분석할 미디어 선택" icon={<FileVideo size={18}/>} value={selectedVideoId} open={openPicker === "video"} onOpen={() => setOpenPicker(openPicker === "video" ? null : "video")} onClose={() => setOpenPicker(null)} onChange={setSelectedVideoId} options={videos.map((item) => ({ value: String(item.id), label: item.name, meta: item.media_type === "image" ? "이미지" : "동영상" }))}/></article>
              <article><span className="analysis-upload-icon"><Box size={24}/></span><div><p className="section-kicker">AI MODEL</p><h2>탐지 모델</h2><p>YOLOv8 또는 YOLO11 기반 PT 모델을 등록하세요.</p></div><button type="button" className="secondary-button" aria-haspopup="dialog" onClick={() => openUpload("model")}><Plus size={16}/>AI 모델 업로드</button><AnalysisPicker name="model" label="등록된 모델" placeholder="적용할 PT 모델 선택" icon={<Box size={18}/>} value={selectedModelId} open={openPicker === "model"} onOpen={() => setOpenPicker(openPicker === "model" ? null : "model")} onClose={() => setOpenPicker(null)} onChange={setSelectedModelId} options={models.map((item) => ({ value: String(item.id), label: item.name, meta: "YOLO PT 모델" }))}/></article>
            </div>
            <input type="hidden" name="confidence" value="0.25"/><input type="hidden" name="stride" value="3"/>
            <div className="analysis-run"><p>{models.length && videos.length ? "미디어와 모델을 선택하면 분석을 시작할 수 있습니다." : "미디어와 AI 모델을 각각 한 개 이상 업로드하세요."}</p><button className="primary-button" disabled={!selectedModelId || !selectedVideoId}><ScanLine size={18}/>분석 시작</button></div>
          </form>{error && <p className="form-error">{error}</p>}</section>
          {currentAnalysisId && <section ref={resultSectionRef} className="analysis-inline-result" aria-live="polite"><AnalysisDetail id={currentAnalysisId} onUpdated={refresh}/></section>}
        </>}

        {view === "records" && <div className="content-layout records-layout"><section className="history-panel panel"><div className="panel-heading"><div><p className="section-kicker">MY OBSERVATIONS</p><h3>탐색 목록</h3></div><span>{analyses.length}</span></div><div className="history-list">{analyses.map((item) => <button key={item.id} className={selected === item.id ? "history-item selected" : "history-item"} onClick={() => setSelected(item.id)}><span className={`run-icon ${item.status}`}><ScanLine size={18}/></span><div><strong>{item.video.name}</strong><small>{item.model.name} · {formatDate(item.created_at)}</small><Status status={item.status} progress={item.progress}/></div><ChevronRight size={17}/></button>)}{!analyses.length && <div className="empty-compact"><ScanLine size={26}/><strong>첫 탐색을 시작해보세요.</strong><p>완료된 분석이 시간순으로 정리됩니다.</p></div>}</div></section><section className="detail-panel">{selected ? <AnalysisDetail id={selected} onUpdated={refresh}/> : <div className="empty-state"><ScanLine size={34}/><p className="section-kicker">NO OBSERVATION YET</p><h3>아직 저장된 탐색 결과가 없습니다.</h3><p>이미지 또는 동영상과 PT 모델을 연결하면 탐지 결과와 클래스 통계가 이곳에 기록됩니다.</p><button className="secondary-button" onClick={() => navigate("analysis")}>분석 시작<ChevronRight size={16}/></button></div>}</section></div>}

        {view === "compare" && <AnalysisComparison analyses={analyses} onStartAnalysis={() => navigate("analysis")}/>}
        {!(["home", "analysis", "records", "compare"] as WorkspaceView[]).includes(view) && <WorkspaceSection key={`${view}-${viewRevision}`} view={view as Exclude<WorkspaceView, "home" | "analysis" | "records" | "compare">} user={user} onNavigate={navigate}/>}
      </div>
    </div>
    </section>
    </main>
    {profilePanelOpen && <><button className="analysis-profile-backdrop" type="button" aria-label="마이페이지 닫기" onClick={closeMyPage}/><aside className="auth-panel analysis-profile-drawer" aria-label="마이페이지">
      <div className="auth-form-wrap"><div className="profile-panel-content">
        <div className="auth-form-backline-wrap"><button className="auth-form-backline" type="button" onClick={closeMyPage} aria-label="마이페이지 닫기"><ArrowLeft size={16}/></button></div>
        <div className="auth-form-heading"><span className="auth-lock"><UserCircle size={19}/></span><div><p className="section-kicker">MY FLOATWATCH</p><h2>마이페이지</h2></div></div>
        <div className="profile-identity"><span>{user.name.slice(0, 1)}</span><div><small>다시 만나 반갑습니다</small><strong>{user.name}님</strong><p>{user.email}</p></div>{user.role === "admin" ? <button className="profile-admin-badge" type="button" onClick={() => navigate("admin")} title="관리자 페이지로 이동"><ShieldCheck size={11}/>관리자</button> : <em><ShieldCheck size={11}/>일반 회원</em>}</div>
        <div className="profile-activity"><div><small>분석 기록</small><strong>{analyses.length}<em>건</em></strong></div><div><small>1:1 문의</small><strong>{inquiryCount}<em>건</em></strong></div></div>
        <p className="profile-section-label">나의 서비스</p>
        {profileEditing ? <form className="profile-edit-form" onSubmit={updateProfile}><label><span>이름</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} required/></label><label><span>새 비밀번호</span><input type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} minLength={8} placeholder="변경하지 않으려면 비워두세요"/></label><div><button type="button" onClick={() => setProfileEditing(false)}>취소</button><button type="submit" disabled={profileBusy}>{profileBusy ? "저장 중..." : "변경 저장"}</button></div></form> : <div className="profile-shortcuts"><button type="button" onClick={() => setProfileEditing(true)}><UserCircle size={18}/><span><strong>개인 정보 관리</strong><small>이름 및 비밀번호 변경</small></span><ChevronRight size={16}/></button><button type="button" onClick={() => navigate("records")}><ScanLine size={18}/><span><strong>내 탐색 기록</strong><small>분석 결과와 탐지 기록 확인</small></span><ChevronRight size={16}/></button><button type="button" onClick={() => navigate("inquiry")}><FileText size={18}/><span><strong>1:1 문의</strong><small>문의 작성 및 답변 확인</small></span><ChevronRight size={16}/></button></div>}
        {profileMessage && <p className="profile-message">{profileMessage}</p>}
        <button className="profile-logout" type="button" onClick={logout}><LogOut size={16}/>로그아웃</button>
      </div></div>
    </aside></>}
    {upload && <UploadDialog type={upload} onClose={() => setUpload(null)} onUploaded={refresh}/>}
  </div>;
}

function AnalysisPicker({ name, label, placeholder, icon, value, open, options, onOpen, onClose, onChange }: {
  name: string;
  label: string;
  placeholder: string;
  icon: ReactNode;
  value: string;
  open: boolean;
  options: Array<{ value: string; label: string; meta: string }>;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);
  return <div className="analysis-picker-field">
    <span className="analysis-picker-label">{label}</span>
    <div className={`analysis-picker ${open ? "open" : ""}`} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onClose();
    }}>
      <button className="analysis-select-control" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={onOpen}>
        {icon}<span><strong>{selectedOption?.label ?? placeholder}</strong>{selectedOption && <small>{selectedOption.meta}</small>}</span><ChevronDown size={18}/>
      </button>
      {open && <div className="analysis-select-menu" role="listbox" aria-label={label}>
        {options.length ? options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} onClick={() => { onChange(option.value); onClose(); }}>
          <span>{icon}</span><span><strong>{option.label}</strong><small>{option.meta}</small></span>{option.value === value && <Check size={17}/>}
        </button>) : <p>등록된 항목이 없습니다.</p>}
      </div>}
    </div>
    <input type="hidden" name={name} value={value}/>
  </div>;
}

function TopNavGroup({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) { return <div className={active ? "topnav-group active" : "topnav-group"}><button>{label}<ChevronDown size={14}/></button><div className="topnav-dropdown">{children}</div></div>; }
function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button className={active ? "active" : ""} onClick={onClick}>{icon}{children}</button>; }
function Status({ status, progress }: { status: Analysis["status"]; progress: number }) { const text = { queued: "대기 중", processing: `분석 중 ${progress.toFixed(0)}%`, completed: "완료", failed: "실패" }[status]; return <span className={`status ${status}`}>{text}</span>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
