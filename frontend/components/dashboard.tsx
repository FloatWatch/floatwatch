"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, BarChart3, Box, Check, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CircleHelp, Clock3, FileText, FileVideo, LogOut, Megaphone,
  CalendarDays, Cpu, FolderCog, Gauge, ImageIcon, LoaderCircle, MapPinned, Menu, MessageSquareText, MoreHorizontal, Plus, RotateCcw, ScanLine, Search, Settings2, ShieldCheck, Trash2, UserCircle, Waves, X,
} from "lucide-react";
import { API_URL, api, ApiError } from "@/lib/api";
import type { Analysis, ModelArtifact, User, VideoAsset } from "@/lib/types";
import { AnalysisDetail } from "./analysis-detail";
import { UploadDialog } from "./upload-dialog";
import { WorkspaceSection, type WorkspaceView, viewTitles } from "./workspace-sections";
import { BrandWordmark } from "./brand-wordmark";
import { AuthScreen } from "./auth-screen";
import { ZoomableImage } from "./zoomable-image";
import { AssetManagerDialog } from "./asset-manager-dialog";
import { RealtimeDetection } from "./realtime-detection";
import { RealtimeRecordsPanel } from "./realtime-records-panel";
import { analysisStatusLabel, effectiveAnalysisStatus } from "@/lib/analysis-status";

function analysisErrorCopy(message: string) {
  if (message.includes("분석 요청이 많")) return { label: "SERVER QUEUE", title: "분석 대기열이 혼잡합니다", detail: "현재 작업이 끝난 뒤 다시 시도해 주세요. 선택한 미디어와 모델은 그대로 유지됩니다.", tone: "busy" };
  if (message.includes("요청이 너무 많")) return { label: "REQUEST LIMIT", title: "잠시 쉬었다가 다시 요청해 주세요", detail: "짧은 시간에 요청이 반복되어 서버를 보호하고 있습니다. 잠시 후 같은 설정으로 다시 실행할 수 있습니다.", tone: "limit" };
  if (message.includes("공간") || message.includes("용량")) return { label: "STORAGE CHECK", title: "분석 저장 공간을 확인해 주세요", detail: "기존 결과나 사용하지 않는 파일을 정리한 뒤 다시 시도해 주세요.", tone: "storage" };
  return { label: "ANALYSIS NOTICE", title: "분석을 시작하지 못했습니다", detail: message, tone: "default" };
}

function normalizeWorkspaceView(raw: string | null): WorkspaceView {
  if (raw === "compare") return "records";
  return raw && raw in viewTitles ? raw as WorkspaceView : "home";
}

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
  const [assetManager, setAssetManager] = useState<"model" | "video" | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [profilePanelClosing, setProfilePanelClosing] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileDeleteConfirmation, setProfileDeleteConfirmation] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<"project" | "analysis" | "board" | null>(null);
  const [openPicker, setOpenPicker] = useState<"video" | "model" | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [resultModelKey, setResultModelKey] = useState<"yolov8s" | "yolov11s" | "yolov26s" | "rt-detr">("yolov8s");
  const [confidence, setConfidence] = useState(0.25);
  const [frameStride, setFrameStride] = useState(3);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsQuery, setRecordsQuery] = useState("");
  const [recordsStatus, setRecordsStatus] = useState<"all" | Analysis["status"]>("all");
  const [recordsMedia, setRecordsMedia] = useState<"all" | VideoAsset["media_type"]>("all");
  const [recordsSort, setRecordsSort] = useState<"newest" | "oldest">("newest");
  const [recordsView, setRecordsView] = useState<"file" | "realtime">("file");
  const [recordMenuId, setRecordMenuId] = useState<number | null>(null);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<Analysis | null>(null);
  const [recordActionBusy, setRecordActionBusy] = useState(false);
  const [recordActionError, setRecordActionError] = useState("");
  const [analysisSubmitting, setAnalysisSubmitting] = useState(false);
  const [error, setError] = useState("");
  const resultSectionRef = useRef<HTMLDivElement>(null);
  const analysisSubmitRef = useRef(false);
  const previousViewRef = useRef<WorkspaceView>(initialView);

  async function refresh() {
    const [modelItems, videoItems, analysisItems, summary] = await Promise.all([
      api<ModelArtifact[]>("/models"),
      api<VideoAsset[]>("/videos"),
      api<Analysis[]>("/analyses"),
      api<{ analyses: number; inquiries: number }>("/auth/me/summary").catch(() => ({ analyses: 0, inquiries: 0 })),
    ]);
    setModels(modelItems); setVideos(videoItems); setAnalyses(analysisItems);
    setInquiryCount(summary.inquiries);
  }
  async function handleUploaded(uploaded?: VideoAsset) {
    await refresh();
    if (!uploaded) return;
    setSelectedVideoId(String(uploaded.id));
    setCurrentAnalysisId(null);
    setOpenPicker(null);
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
  const recordsPerPage = 5;
  const filteredAnalyses = useMemo(() => {
    const query = recordsQuery.trim().toLocaleLowerCase("ko-KR");
    return analyses.filter((item) => {
      const effectiveStatus = effectiveAnalysisStatus(item.status, item.error_code);
      if (recordsStatus === "processing" && !(["queued", "processing"] as Analysis["status"][]).includes(effectiveStatus)) return false;
      if (recordsStatus !== "all" && recordsStatus !== "processing" && effectiveStatus !== recordsStatus) return false;
      if (recordsMedia !== "all" && item.video.media_type !== recordsMedia) return false;
      if (query && !`${item.video.name} ${item.model.name}`.toLocaleLowerCase("ko-KR").includes(query)) return false;
      return true;
    }).sort((left, right) => recordsSort === "newest" ? new Date(right.created_at).getTime() - new Date(left.created_at).getTime() : new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  }, [analyses, recordsQuery, recordsStatus, recordsMedia, recordsSort]);
  const recordsPageCount = Math.max(1, Math.ceil(filteredAnalyses.length / recordsPerPage));
  const recordsPageGroupStart = Math.floor((recordsPage - 1) / 5) * 5 + 1;
  const visibleRecordPages = Array.from({ length: Math.min(5, recordsPageCount - recordsPageGroupStart + 1) }, (_, index) => recordsPageGroupStart + index);
  const paginatedAnalyses = filteredAnalyses.slice((recordsPage - 1) * recordsPerPage, recordsPage * recordsPerPage);
  useEffect(() => {
    setRecordsPage((page) => Math.min(page, recordsPageCount));
  }, [recordsPageCount]);
  useEffect(() => { setRecordsPage(1); setRecordMenuId(null); }, [recordsQuery, recordsStatus, recordsMedia, recordsSort]);
  useEffect(() => {
    if (recordMenuId == null) return;
    function closeRecordMenu(event: PointerEvent) {
      if (!(event.target instanceof Element) || !event.target.closest(".record-row-menu")) setRecordMenuId(null);
    }
    document.addEventListener("pointerdown", closeRecordMenu);
    return () => document.removeEventListener("pointerdown", closeRecordMenu);
  }, [recordMenuId]);
  useEffect(() => {
    if (!currentAnalysisId || view !== "analysis") return;
    const frame = window.requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentAnalysisId, view]);
  useEffect(() => {
    const previousView = previousViewRef.current;
    if (previousView === "analysis" && view !== "analysis") {
      setSelectedVideoId("");
      setSelectedModelId("");
      setCurrentAnalysisId(null);
      setOpenPicker(null);
      setUpload(null);
      setError("");
    }
    if (previousView === "records" && view !== "records") {
      setRecordsQuery("");
      setRecordsStatus("all");
      setRecordsMedia("all");
      setRecordsSort("newest");
      setRecordsPage(1);
      setRecordMenuId(null);
      setRecordActionError("");
    }
    previousViewRef.current = view;
  }, [view]);
  useEffect(() => {
    function restoreWorkspaceLocation() {
      const params = new URLSearchParams(window.location.search);
      const requestedWorkspace = params.get("workspace");
      const next = normalizeWorkspaceView(requestedWorkspace);
      const analysisId = Number(params.get("analysis"));
      const validAnalysisId = Number.isInteger(analysisId) && analysisId > 0 ? analysisId : null;
      if (requestedWorkspace === "compare") {
        window.history.replaceState({ workspace: "records" }, "", "/auth?workspace=records");
      }
      setProfilePanelOpen(false);
      setView(next);
      setSelected(next === "records" ? validAnalysisId : null);
      if (next === "records") setRecordsView("file");
      setCurrentAnalysisId(next === "analysis" ? validAnalysisId : null);
    }
    restoreWorkspaceLocation();
    window.addEventListener("popstate", restoreWorkspaceLocation);
    return () => window.removeEventListener("popstate", restoreWorkspaceLocation);
  }, []);

  const completed = useMemo(() => analyses.filter((item) => item.status === "completed"), [analyses]);
  const selectedVideo = useMemo(() => videos.find((item) => String(item.id) === selectedVideoId) ?? null, [videos, selectedVideoId]);
  const selectedModel = useMemo(() => models.find((item) => String(item.id) === selectedModelId) ?? null, [models, selectedModelId]);
  const comparisonModelsReady = models.filter((item) => item.model_key).length === 4;
  const availableComparisonModelCount = models.filter((item) => item.model_key).length;
  useEffect(() => {
    if (comparisonModelsReady && !selectedModelId) setSelectedModelId(String(models[0].id));
  }, [comparisonModelsReady, models, selectedModelId]);
  const activeAnalysis = useMemo(() => analyses.find((item) => item.status === "queued" || item.status === "processing") ?? null, [analyses]);
  const analysisRunning = activeAnalysis !== null;
  const displayedAnalysisId = currentAnalysisId ?? (view === "analysis" ? activeAnalysis?.id ?? null : null);
  const currentAnalysis = useMemo(() => analyses.find((item) => item.id === displayedAnalysisId) ?? null, [analyses, displayedAnalysisId]);
  const currentBatchAnalyses = useMemo(() => currentAnalysis?.batch_id ? analyses.filter((item) => item.batch_id === currentAnalysis.batch_id) : [], [analyses, currentAnalysis]);
  const selectedResult = useMemo(() => currentBatchAnalyses.find((item) => item.model.model_key === resultModelKey) ?? null, [currentBatchAnalyses, resultModelKey]);
  useEffect(() => {
    if (!currentBatchAnalyses.length) return;
    const preferred = currentBatchAnalyses.find((item) => item.model.model_key === "yolov8s") ?? currentBatchAnalyses[0];
    if (preferred.model.model_key) setResultModelKey(preferred.model.model_key);
  }, [currentAnalysis?.batch_id]);
  const analysisErrorNotice = error ? analysisErrorCopy(error) : null;
  useEffect(() => {
    if (view !== "analysis") return;
    const params = new URLSearchParams(window.location.search);
    const requestedId = Number(params.get("analysis"));
    const requested = Number.isInteger(requestedId) && requestedId > 0 ? analyses.find((item) => item.id === requestedId) : null;
    const active = [...analyses].find((item) => item.status === "queued" || item.status === "processing");
    const target = requested ?? active ?? null;
    if (!target) return;
    if (currentAnalysisId !== target.id) setCurrentAnalysisId(target.id);
    setSelectedVideoId(String(target.video.id));
    setSelectedModelId(String(target.model.id));
    const targetUrl = `/auth?workspace=analysis&analysis=${target.id}`;
    if (`${window.location.pathname}${window.location.search}` !== targetUrl) {
      window.history.replaceState({ workspace: "analysis", analysis: target.id }, "", targetUrl);
    }
  }, [analyses, currentAnalysisId, view]);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (analysisSubmitRef.current) return;
    if (analysisRunning) {
      setError("현재 진행 중인 분석이 있습니다. 완료된 후 새 분석을 시작해 주세요.");
      return;
    }
    const data = new FormData(event.currentTarget);
    analysisSubmitRef.current = true;
    setAnalysisSubmitting(true);
    try {
      const batch = await api<{ batch_id: string; analyses: Analysis[] }>("/analysis-batches", { method: "POST", body: JSON.stringify({ video_id: Number(data.get("video")), confidence: Number(data.get("confidence")), frame_stride: Number(data.get("stride")) }) });
      const item = batch.analyses[0];
      await refresh(); setSelected(item.id); setCurrentAnalysisId(item.id);
      window.history.replaceState({ workspace: "analysis", analysis: item.id }, "", `/auth?workspace=analysis&analysis=${item.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "분석을 시작하지 못했습니다."); }
    finally {
      analysisSubmitRef.current = false;
      setAnalysisSubmitting(false);
    }
  }
  async function logout() { await api("/auth/logout", { method: "POST" }).catch(() => {}); onLogout(); }
  function openUpload(type: "model" | "video") {
    setOpenPicker(null);
    setUpload(type);
  }
  function openAssetManager(type: "model" | "video") {
    setOpenPicker(null);
    setAssetManager(type);
  }
  function openUploadFromManager(type: "model" | "video") {
    setAssetManager(null);
    setUpload(type);
  }
  function handleAssetDeleted(type: "model" | "video", id: number) {
    if (type === "model" && selectedModelId === String(id)) setSelectedModelId("");
    if (type === "video" && selectedVideoId === String(id)) setSelectedVideoId("");
  }
  async function retryRecord(item: Analysis) {
    setRecordMenuId(null); setRecordActionBusy(true); setRecordActionError("");
    try {
      const next = await api<Analysis>(`/analyses/${item.id}/retry`, { method: "POST" });
      await refresh();
      selectAnalysisRecord(next.id);
    } catch (err) { setRecordActionError(err instanceof Error ? err.message : "분석을 다시 시작하지 못했습니다."); }
    finally { setRecordActionBusy(false); }
  }
  async function deleteRecord() {
    if (!deleteRecordTarget) return;
    setRecordActionBusy(true); setRecordActionError("");
    try {
      await api(`/analyses/${deleteRecordTarget.id}`, { method: "DELETE" });
      setDeleteRecordTarget(null);
      await refresh();
    } catch (err) { setRecordActionError(err instanceof Error ? err.message : "기록을 삭제하지 못했습니다."); }
    finally { setRecordActionBusy(false); }
  }
  function openAnalysisRecord(id: number) {
    setCurrentAnalysisId(null);
    navigate("records");
    selectAnalysisRecord(id);
  }
  function prepareNewAnalysis() {
    setCurrentAnalysisId(null);
    setSelectedVideoId("");
    setSelectedModelId("");
    setOpenPicker(null);
    setError("");
    window.history.replaceState({ workspace: "analysis" }, "", "/auth?workspace=analysis");
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }
  function selectAnalysisRecord(id: number) {
    setSelected(id);
    window.history.pushState({ workspace: "records", analysis: id }, "", `/auth?workspace=records&analysis=${id}`);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  function closeAnalysisRecord() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspace") === "records" && params.has("analysis")) {
      window.history.back();
      return;
    }
    setSelected(null);
    window.history.replaceState({ workspace: "records" }, "", "/auth?workspace=records");
  }
  function navigate(next: WorkspaceView) {
    setProfilePanelOpen(false);
    if (next === "records") {
      setSelected(null);
      setRecordsView("file");
    }
    setView(next);
    setViewRevision((value) => value + 1);
    const url = next === "home" ? "/auth" : `/auth?workspace=${next}`;
    window.history.pushState({ workspace: next }, "", url);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setNavOpen(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
  function openMyPage() {
    setProfilePanelClosing(false);
    setProfilePanelOpen(true);
    setProfileMessage("");
    window.history.replaceState({ workspace: view, profile: true }, "", `/auth?workspace=${view}&profile=1`);
  }
  function closeMyPage() {
    window.history.replaceState({ workspace: view }, "", `/auth?workspace=${view}`);
    if (profilePanelClosing) return;
    setProfilePanelClosing(true);
    window.setTimeout(() => {
      setProfilePanelOpen(false);
      setProfilePanelClosing(false);
      setProfileEditing(false);
      setProfileCurrentPassword("");
      setProfilePassword("");
      setProfileDeleteConfirmation("");
      setProfileMessage("");
    }, 360);
  }
  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setProfileBusy(true); setProfileMessage("");
    try {
      await api<void>("/auth/me/password", { method: "PATCH", body: JSON.stringify({ current_password: profileCurrentPassword, new_password: profilePassword }) });
      onLogout();
    } catch (err) { setProfileMessage(err instanceof Error ? err.message : "개인 정보를 변경하지 못했습니다."); }
    finally { setProfileBusy(false); }
  }
  async function deleteAccount() {
    if (profileDeleteConfirmation !== "회원 탈퇴") {
      setProfileMessage("확인란에 '회원 탈퇴'를 정확히 입력해 주세요.");
      return;
    }
    setProfileBusy(true); setProfileMessage("");
    try {
      await api<void>("/auth/me", { method: "DELETE", body: JSON.stringify({ confirmation: profileDeleteConfirmation, current_password: profileCurrentPassword || undefined }) });
      onLogout();
    } catch (err) { setProfileMessage(err instanceof Error ? err.message : "회원 탈퇴를 처리하지 못했습니다."); }
    finally { setProfileBusy(false); }
  }
  if (view === "home" || view === "overview" || view === "development" || view === "notice" || view === "free" || view === "bug" || view === "faq") {
    return <AuthScreen
      authenticatedUser={user}
      initialPanelCollapsed
      isPanelOpen={false}
      showPanelToggle={false}
      onWorkspaceNavigate={navigate}
      onAuthenticatedLogout={logout}
      onUserUpdated={onUserUpdated}
      profileStats={{ analyses: analyses.length, inquiries: inquiryCount }}
      contentView={view === "overview" ? "overview" : view === "development" ? "development" : view === "free" ? "community" : view === "notice" || view === "bug" || view === "faq" ? view : "home"}
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
          <div><button type="button" onClick={() => { setOpenMenu(null); navigate("realtime"); }}>실시간 탐색</button><button type="button" onClick={() => { setOpenMenu(null); navigate("analysis"); }}>부유물 탐색</button><button type="button" onClick={() => { setOpenMenu(null); navigate("records"); }}>탐색 기록</button></div>
        </div>
        <div className={`auth-menu-group ${openMenu === "board" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("board")}>
          <button className="auth-menu-trigger" type="button">게시판</button>
          <div><button type="button" onClick={() => { setOpenMenu(null); navigate("notice"); }}>공지사항</button><button type="button" onClick={() => { setOpenMenu(null); navigate("free"); }}>자유게시판</button><button type="button" onClick={() => { setOpenMenu(null); navigate("bug"); }}>버그 제보</button><button type="button" onClick={() => { setOpenMenu(null); navigate("faq"); }}>자주 묻는 질문</button><button type="button" onClick={() => { setOpenMenu(null); navigate("inquiry"); }}>1:1 문의</button></div>
        </div>
      </nav>
      <button className="header-login auth-header-login" type="button" onClick={openMyPage}><UserCircle size={15}/>{user.name}님</button>
    </header>

    <div className="workspace analysis-workspace">
      {!isStoryView && <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setNavOpen(true)}><Menu size={20}/></button>
        <div><p className="section-kicker">{viewTitles[view].kicker}</p><h1>{viewTitles[view].title}</h1></div>
      </header>}

      <div key={`${view}-${viewRevision}`} className={`${isStoryView ? "workspace-body story-workspace-body public-shell public-view-" + view : "workspace-body"} page-content-transition`}>
        {view === "analysis" && <>
          <section className={`analysis-upload-workspace analysis-result-modal analysis-explorer-workbench ${displayedAnalysisId ? "has-result" : ""}`}>
            <header className="analysis-result-modal-header explorer-hero"><div><p>AI OBSERVATION WORKBENCH</p><h2>부유물 탐색</h2><span>{displayedAnalysisId ? "진행 중이거나 완료된 분석을 이어서 확인합니다." : "관측 미디어에 AI 모델을 적용해 부유물의 위치와 종류를 탐색합니다."}</span></div>{displayedAnalysisId && currentBatchAnalyses.length > 0 && currentBatchAnalyses.every((item) => !(["queued", "processing"] as Analysis["status"][]).includes(item.status)) ? <button className="secondary-button explorer-new-analysis-button" type="button" onClick={prepareNewAnalysis}><Plus size={15}/>새 탐색 준비</button> : <div className="explorer-status"><i/><span>{displayedAnalysisId ? "모델별 분석 진행 중" : "분석 시스템 준비됨"}</span></div>}</header>
            <form onSubmit={start} className={displayedAnalysisId ? "analysis-form-with-results" : ""}>
              <div className="explorer-steps" aria-label="분석 준비 단계">
                <span className={selectedVideo ? "complete" : "active"}><b>{selectedVideo ? <Check size={14}/> : "1"}</b>미디어 선택</span>
                <span className={availableComparisonModelCount ? "complete" : selectedVideo ? "active" : ""}><b>{availableComparisonModelCount ? <Check size={14}/> : "2"}</b>대표 모델 확인</span>
                <span className={selectedVideo && availableComparisonModelCount ? "active" : ""}><b>3</b>모델 분석</span>
              </div>
              <div className="explorer-grid">
                <section className="explorer-preview-panel">
                  <div className="explorer-section-heading"><div><span>01 · SOURCE MEDIA</span><h3>관측 미디어</h3></div><div className="explorer-heading-actions"><button type="button" onClick={() => openAssetManager("video")}><FolderCog size={14}/>관리</button><button type="button" onClick={() => openUpload("video")}><Plus size={14}/>새 미디어</button></div></div>
                  <AnalysisPicker name="video" label="분석 대상" placeholder="이미지 또는 동영상을 선택하세요" icon={<FileVideo size={18}/>} value={selectedVideoId} open={openPicker === "video"} onOpen={() => setOpenPicker(openPicker === "video" ? null : "video")} onClose={() => setOpenPicker(null)} onChange={setSelectedVideoId} options={videos.map((item) => ({ value: String(item.id), label: item.name, meta: `${item.media_type === "image" ? "이미지" : "동영상"} · ${formatBytes(item.size_bytes)}` }))}/>
                  <div className={`analysis-inline-preview ${selectedVideo ? "has-media" : ""} ${displayedAnalysisId ? "showing-result" : ""}`}>{displayedAnalysisId ? selectedResult?.output_url ? selectedVideo?.media_type === "image" ? <div className="analysis-preview-image-frame"><ZoomableImage src={`${API_URL}${selectedResult.output_url}`} alt={`${selectedResult.model.name} 바운딩 박스 결과`} imageStyle={{ width:"100%",height:"100%",maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"block" }}/></div> : <video src={`${API_URL}${selectedResult.output_url}`} controls preload="metadata"/> : <div className="inline-analysis-loading"><LoaderCircle className="spin" size={32}/><strong>{selectedResult ? `${selectedResult.model.name} 분석 ${Math.round(selectedResult.progress)}%` : "대표 PT 미등록"}</strong><span>{selectedResult ? "바운딩 박스 결과를 생성하고 있습니다." : "다른 모델 탭을 선택해 결과를 확인하세요."}</span></div> : selectedVideo ? selectedVideo.media_type === "image" ? <div className="analysis-preview-image-frame"><ZoomableImage src={`${API_URL}/videos/${selectedVideo.id}/preview`} alt={`${selectedVideo.name} 미리보기`} imageStyle={{ width:"100%",height:"100%",maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"block" }}/></div> : <video src={`${API_URL}/videos/${selectedVideo.id}/preview`} controls preload="metadata"/> : <div><span className="preview-empty-icon"><ImageIcon size={30}/></span><strong>분석 대상을 선택하세요</strong><span>JPG, JPEG, PNG, WEBP, BMP · MP4, AVI, MOV, MKV, WEBM 지원</span><button type="button" onClick={() => openUpload("video")}><Plus size={14}/>미디어 업로드</button></div>}</div>
                  {selectedVideo && <div className={`selected-media-location ${selectedVideo.location_confirmed ? "confirmed" : "missing"}`}><MapPinned size={15}/><div><small>촬영 위치</small><strong>{selectedVideo.location_confirmed && selectedVideo.latitude != null && selectedVideo.longitude != null ? selectedVideo.location_name || `${selectedVideo.latitude.toFixed(5)}, ${selectedVideo.longitude.toFixed(5)}` : "등록된 위치가 없습니다"}</strong></div><span>{selectedVideo.location_source === "metadata" ? "메타데이터" : selectedVideo.location_confirmed ? "직접 선택" : "미등록"}</span></div>}
                </section>
                <aside className="explorer-control-panel">
                  <section><div className="explorer-section-heading"><div><span>02 · {displayedAnalysisId ? "MODEL RESULTS" : "REPRESENTATIVE MODELS"}</span><h3>{displayedAnalysisId ? "모델별 바운딩 박스" : "대표 PT 4종"}</h3></div><div className="explorer-heading-actions">{!displayedAnalysisId&&<><button type="button" onClick={() => openAssetManager("model")}><FolderCog size={14}/>대표 모델 관리</button><button type="button" onClick={() => openUpload("model")}><Plus size={14}/>PT 등록</button></>}</div></div><div className={`representative-model-grid ${displayedAnalysisId ? "result-tabs" : ""}`}>{(["yolov8s","yolov11s","yolov26s","rt-detr"] as const).map((key) => { const model=models.find((item)=>item.model_key===key),result=currentBatchAnalyses.find((item)=>item.model.model_key===key); const content=<><Cpu size={16}/><span><strong>{({yolov8s:"YOLOv8s",yolov11s:"YOLO11s",yolov26s:"YOLO26s","rt-detr":"RT-DETR"})[key]}</strong><small>{displayedAnalysisId?result?result.status==="completed"?"분석 완료":result.status==="processing"?`분석 ${Math.round(result.progress)}%`:result.status==="failed"?"분석 실패":"분석 대기":"대표 PT 미등록":model?model.original_name:"대표 PT 미지정"}</small></span>{result?.status==="completed"?<Check size={14}/>:<CircleHelp size={14}/>}</>; return displayedAnalysisId?<button type="button" className={`${result?"ready":"missing"} ${resultModelKey===key?"active":""}`} key={key} onClick={()=>setResultModelKey(key)}>{content}</button>:<div className={model?"ready":"missing"} key={key}>{content}</div>;})}</div></section>
                  <section className="explorer-settings"><div className="explorer-section-heading"><div><span>03 · PARAMETERS</span><h3>탐지 설정</h3></div><Settings2 size={18}/></div><nav className="analysis-presets" aria-label="분석 설정 프리셋"><button type="button" className={confidence===.35&&frameStride===1?"active":""} onClick={()=>{setConfidence(.35);setFrameStride(1)}}><strong>정밀</strong><small>촘촘한 분석</small></button><button type="button" className={confidence===.25&&frameStride===3?"active":""} onClick={()=>{setConfidence(.25);setFrameStride(3)}}><strong>균형</strong><small>권장 설정</small></button><button type="button" className={confidence===.25&&frameStride===5?"active":""} onClick={()=>{setConfidence(.25);setFrameStride(5)}}><strong>빠름</strong><small>처리 우선</small></button></nav><label><span><strong>최소 신뢰도</strong><output>{Math.round(confidence * 100)}%</output></span><input name="confidence" type="range" min="0.1" max="0.9" step="0.05" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}/><small>낮을수록 더 많은 후보를 탐지합니다.</small></label><label><span><strong>프레임 간격</strong><output>{frameStride} frame</output></span><input name="stride" type="range" min="1" max="10" step="1" value={frameStride} onChange={(event) => setFrameStride(Number(event.target.value))}/><small>간격이 작을수록 정밀하지만 오래 걸립니다.</small></label></section>
                  <div className={`explorer-readiness ${selectedVideo && availableComparisonModelCount ? "ready" : ""}`}><Gauge size={18}/><div><strong>{selectedVideo && availableComparisonModelCount ? `${availableComparisonModelCount}개 모델 분석 준비 완료` : "분석 준비 중"}</strong><span>{!selectedVideo ? "관측 미디어를 선택해 주세요." : !availableComparisonModelCount ? "관리에서 하나 이상의 대표 PT를 지정해 주세요." : comparisonModelsReady ? "네 모델의 결과를 한 번에 생성합니다." : `대표 PT가 있는 ${availableComparisonModelCount}개 모델만 분석하며, 나머지는 미등록으로 표시됩니다.`}</span></div></div>
                </aside>
              </div>
              <div className="analysis-run"><div><small>COMPARISON WORKFLOW</small><p>{analysisSubmitting ? "모델 분석 요청을 등록하고 있습니다." : analysisRunning ? "비교 분석이 순차적으로 진행 중입니다." : selectedVideo && availableComparisonModelCount ? `${selectedVideo.name}을 등록된 ${availableComparisonModelCount}개 대표 모델로 분석합니다.` : "미디어 선택과 대표 PT 등록 상태를 확인해 주세요."}</p></div><button className="primary-button" disabled={!availableComparisonModelCount || !selectedVideoId || analysisRunning || analysisSubmitting}><ScanLine size={18}/>{analysisSubmitting ? "분석 요청 중" : analysisRunning ? "비교 분석 진행 중" : "등록 모델 분석 시작"}<ChevronRight size={17}/></button></div>
            </form>
            {displayedAnalysisId && <section className="explorer-bottom-comparison inline-comparison-graph"><div className="explorer-section-heading"><div><span>04 · COMPARISON GRAPH</span><h3>모델별 비교</h3></div><BarChart3 size={18}/></div>{(["total","confidence","fps"] as const).map((metric)=>{const label={total:"총 탐지 수",confidence:"평균 신뢰도",fps:"처리 속도"}[metric],values=currentBatchAnalyses.map((item)=>metric==="total"?item.total_detections:metric==="confidence"?(item.avg_confidence??0)*100:item.processing_fps??0),max=metric==="confidence"?100:Math.max(1,...values);return <div className="inline-metric" key={metric}><strong>{label}</strong>{(["yolov8s","yolov11s","yolov26s","rt-detr"] as const).map((key)=>{const item=currentBatchAnalyses.find((result)=>result.model.model_key===key),value=item?(metric==="total"?item.total_detections:metric==="confidence"?(item.avg_confidence??0)*100:item.processing_fps??0):0;return <div className={`metric-model-${key}`} key={key}><span>{key}</span><i><b style={{width:`${value/max*100}%`}}/></i><em>{item?value.toFixed(metric==="total"?0:1):"—"}</em></div>})}</div>})}</section>}
            {analysisErrorNotice && <aside className={`analysis-capacity-notice ${analysisErrorNotice.tone}`} role="alert"><span><CircleHelp size={18}/></span><div><small>{analysisErrorNotice.label}</small><strong>{analysisErrorNotice.title}</strong><p>{analysisErrorNotice.detail}</p></div><button type="button" aria-label="안내 닫기" onClick={() => setError("")}><X size={15}/></button></aside>}
          </section>
        </>}

        {view === "realtime" && <RealtimeDetection models={models} onManageModels={() => openAssetManager("model")}/>}

        {view === "records" && <section className={`records-workbench ${selected ? "records-detail-view" : "records-list-view"}`}>
          {!selected ? <>
            <nav className="records-type-tabs" aria-label="탐색 기록 유형">
              <button type="button" className={recordsView === "file" ? "active" : ""} aria-current={recordsView === "file" ? "page" : undefined} onClick={() => setRecordsView("file")}><strong>파일 탐색 기록</strong></button>
              <button type="button" className={recordsView === "realtime" ? "active" : ""} aria-current={recordsView === "realtime" ? "page" : undefined} onClick={() => setRecordsView("realtime")}><strong>실시간 탐지 기록</strong></button>
            </nav>
            {recordsView === "realtime" ? <RealtimeRecordsPanel onStartRealtime={() => navigate("realtime")}/> : <main className="records-catalog">
              <div className="records-catalog-heading"><div><span>FILE ANALYSIS HISTORY</span><h3>파일 분석 기록</h3></div><div className="records-catalog-actions"><b>총 {analyses.length}건</b><button type="button" onClick={() => navigate("analysis")}><Plus size={15}/>새 탐색 시작</button></div></div>
              <div className="records-toolbar"><label className="records-search"><Search size={15}/><input value={recordsQuery} onChange={(event) => setRecordsQuery(event.target.value)} placeholder="미디어 또는 모델명 검색" aria-label="탐색 기록 검색"/>{recordsQuery && <button type="button" aria-label="검색어 지우기" onClick={() => setRecordsQuery("")}><X size={13}/></button>}</label><div className="records-filter-group" aria-label="분석 상태 필터">{(["all", "completed", "processing", "failed", "cancelled"] as const).map((status) => <button key={status} type="button" className={recordsStatus === status ? "active" : ""} onClick={() => setRecordsStatus(status)}>{({ all: "전체", completed: "완료", processing: "진행 중", failed: "시스템 실패", cancelled: "사용자 중단" })[status]}</button>)}</div><select value={recordsMedia} onChange={(event) => setRecordsMedia(event.target.value as typeof recordsMedia)} aria-label="미디어 유형"><option value="all">모든 미디어</option><option value="image">이미지</option><option value="video">동영상</option></select><select value={recordsSort} onChange={(event) => setRecordsSort(event.target.value as typeof recordsSort)} aria-label="기록 정렬"><option value="newest">최신순</option><option value="oldest">오래된 순</option></select></div>
              {recordActionError && !deleteRecordTarget && <p className="records-action-error"><CircleHelp size={14}/>{recordActionError}<button type="button" onClick={() => setRecordActionError("")}><X size={13}/></button></p>}
              <div className="records-catalog-list">{paginatedAnalyses.map((item, index) => <article key={item.id} className="record-row"><button className="record-row-main" type="button" onClick={() => selectAnalysisRecord(item.id)}><span className="record-row-number">{String((recordsPage - 1) * recordsPerPage + index + 1).padStart(2, "0")}</span><span className={`record-card-icon ${item.status}`}>{item.video.media_type === "image" ? <ImageIcon size={19}/> : <FileVideo size={19}/>}</span><span className="record-row-title"><strong>{item.video.name}</strong><small><Cpu size={12}/>{item.model.name}</small></span><span className="record-row-date"><CalendarDays size={13}/>{formatDate(item.created_at)}</span><span className="record-row-detections">탐지 <strong>{item.total_detections.toLocaleString()}</strong>건</span><Status status={item.status} progress={item.progress} errorCode={item.error_code}/><ChevronRight size={18}/></button><div className="record-row-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setRecordMenuId(null); }}><button type="button" aria-label={`${item.video.name} 기록 메뉴`} aria-haspopup="menu" aria-expanded={recordMenuId === item.id} onClick={() => setRecordMenuId(recordMenuId === item.id ? null : item.id)}><MoreHorizontal size={17}/></button>{recordMenuId === item.id && <div role="menu"><button type="button" role="menuitem" onClick={() => selectAnalysisRecord(item.id)}><Search size={14}/>기록 열기</button>{(item.status === "failed" || item.status === "cancelled") && <button type="button" role="menuitem" disabled={recordActionBusy} onClick={() => void retryRecord(item)}><RotateCcw size={14}/>다시 분석</button>}{!(["queued", "processing"] as Analysis["status"][]).includes(item.status) && <button type="button" role="menuitem" className="danger" onClick={() => { setRecordMenuId(null); setRecordActionError(""); setDeleteRecordTarget(item); }}><Trash2 size={14}/>기록 삭제</button>}</div>}</div></article>)}{!analyses.length ? <div className="records-catalog-empty"><ScanLine size={34}/><strong>아직 탐색 기록이 없습니다.</strong><p>부유물 탐색을 실행하면 완료된 결과가 이곳에 시간순으로 저장됩니다.</p><button type="button" onClick={() => navigate("analysis")}>첫 탐색 시작<ChevronRight size={15}/></button></div> : !filteredAnalyses.length && <div className="records-catalog-empty records-filter-empty"><Search size={30}/><strong>조건에 맞는 기록이 없습니다.</strong><p>검색어나 필터 조건을 변경해 주세요.</p><button type="button" onClick={() => { setRecordsQuery(""); setRecordsStatus("all"); setRecordsMedia("all"); }}>필터 초기화</button></div>}</div>
              {filteredAnalyses.length > recordsPerPage && <nav className="records-pagination" aria-label="탐색 기록 페이지"><button type="button" aria-label="첫 페이지" title="맨 처음" disabled={recordsPage === 1} onClick={() => setRecordsPage(1)}><ChevronFirst size={15}/></button><button type="button" aria-label="이전 페이지" disabled={recordsPage === 1} onClick={() => setRecordsPage((page) => page - 1)}><ChevronLeft size={15}/></button>{visibleRecordPages.map((page) => <button key={page} type="button" className={recordsPage === page ? "active" : ""} aria-label={`${page}페이지`} aria-current={recordsPage === page ? "page" : undefined} onClick={() => setRecordsPage(page)}>{page}</button>)}<button type="button" aria-label="다음 페이지" disabled={recordsPage === recordsPageCount} onClick={() => setRecordsPage((page) => page + 1)}><ChevronRight size={15}/></button><button type="button" aria-label="마지막 페이지" title="맨 끝" disabled={recordsPage === recordsPageCount} onClick={() => setRecordsPage(recordsPageCount)}><ChevronLast size={15}/></button></nav>}
            </main>}
          </> : <main className="records-detail-page">
            <header className="records-detail-nav"><button type="button" onClick={closeAnalysisRecord}><ArrowLeft size={17}/>탐색 기록 목록</button><span>ANALYSIS REPORT · #{selected}</span></header>
            <div className="records-detail-content"><AnalysisDetail id={selected} relatedAnalyses={analyses.filter((analysis) => { const target = analyses.find((candidate) => candidate.id === selected); return target?.batch_id ? analysis.batch_id === target.batch_id : analysis.id === selected; })} onUpdated={refresh} onAnalysisCreated={selectAnalysisRecord} onPrepareNew={() => navigate("analysis")}/></div>
          </main>}
        </section>}

        {!(["home", "analysis", "realtime", "records"] as WorkspaceView[]).includes(view) && <WorkspaceSection key={`${view}-${viewRevision}`} view={view as Exclude<WorkspaceView, "home" | "analysis" | "realtime" | "records">} user={user} onNavigate={navigate}/>}
      </div>
    </div>
    </section>
    </main>
    {profilePanelOpen && <><button className={`analysis-profile-backdrop ${profilePanelClosing ? "is-closing" : ""}`} type="button" aria-label="마이페이지 닫기" onClick={closeMyPage}/><aside className={`auth-panel analysis-profile-drawer ${profilePanelClosing ? "is-closing" : ""}`} aria-label="마이페이지">
      <div className="auth-form-wrap"><div className="profile-panel-content">
        <div className="auth-form-backline-wrap"><button className="auth-form-backline" type="button" onClick={() => { if (profileEditing) { setProfileEditing(false); setProfileCurrentPassword(""); setProfilePassword(""); setProfileDeleteConfirmation(""); setProfileMessage(""); } else closeMyPage(); }} aria-label={profileEditing ? "마이페이지로 돌아가기" : "마이페이지 닫기"}><ArrowLeft size={16}/></button></div>
        <div className="auth-form-heading"><span className="auth-lock"><UserCircle size={19}/></span><div><p className="section-kicker">{profileEditing ? "ACCOUNT SETTINGS" : "MY FLOATWATCH"}</p><h2>{profileEditing ? "개인정보 관리" : "마이페이지"}</h2></div></div>
        {!profileEditing && <div className="profile-view-enter"><div className="profile-identity"><span>{user.name.slice(0, 1)}</span><div><strong>{user.name}님</strong><p>{user.email}</p></div>{user.role === "admin" ? <div className="profile-admin-actions"><button className="profile-admin-badge" type="button" onClick={() => navigate("admin")} title="관리자 페이지로 이동"><ShieldCheck size={11}/>관리자</button></div> : <em><ShieldCheck size={11}/>일반 회원</em>}</div>
        <div className="profile-activity"><div><small>분석 기록</small><strong>{analyses.length}<em>건</em></strong></div><div><small>1:1 문의</small><strong>{inquiryCount}<em>건</em></strong></div></div>
        <p className="profile-section-label">나의 서비스</p><div className="profile-shortcuts"><button type="button" onClick={() => setProfileEditing(true)}><UserCircle size={18}/><span><strong>개인 정보 관리</strong><small>비밀번호 및 계정 관리</small></span><ChevronRight size={16}/></button><button type="button" onClick={() => navigate("records")}><ScanLine size={18}/><span><strong>내 탐색 기록</strong><small>분석 결과와 탐지 기록 확인</small></span><ChevronRight size={16}/></button><button type="button" onClick={() => navigate("inquiry")}><FileText size={18}/><span><strong>1:1 문의</strong><small>문의 작성 및 답변 확인</small></span><ChevronRight size={16}/></button></div></div>}
        {profileEditing && <form className="profile-edit-form profile-settings-view profile-view-enter" onSubmit={updateProfile}><div className="profile-settings-intro"><strong>비밀번호 변경</strong><p>현재 비밀번호를 확인한 뒤 새로운 비밀번호로 변경합니다.</p></div>{user.auth_provider === "password" || !user.auth_provider ? <><label><span>현재 비밀번호</span><input type="password" value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} required placeholder="현재 비밀번호"/></label><label><span>새 비밀번호</span><input type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} minLength={8} required placeholder="8자 이상 입력"/></label><div className="profile-settings-actions"><button type="button" onClick={() => { setProfileEditing(false); setProfileCurrentPassword(""); setProfilePassword(""); setProfileDeleteConfirmation(""); }}>취소</button><button type="submit" disabled={profileBusy}>{profileBusy ? "처리 중..." : "비밀번호 변경"}</button></div></> : <p className="profile-account-note">소셜 로그인으로 가입한 계정은 FloatWatch에서 비밀번호를 변경할 수 없습니다. {user.auth_provider} 계정에서 비밀번호를 관리해 주세요.</p>}<section className="profile-danger-zone"><div><strong>회원 탈퇴</strong><p>탈퇴하면 분석 기록과 업로드 파일이 함께 삭제됩니다.</p></div><label><span>탈퇴 확인</span><input value={profileDeleteConfirmation} onChange={(event) => setProfileDeleteConfirmation(event.target.value)} placeholder="'회원 탈퇴' 입력"/></label><button type="button" className="profile-delete-account" disabled={profileBusy} onClick={deleteAccount}>회원 탈퇴</button></section></form>}
        {profileMessage && <p className="profile-message">{profileMessage}</p>}
        {!profileEditing && <button className="profile-logout" type="button" onClick={logout}><LogOut size={16}/>로그아웃</button>}
      </div></div>
    </aside></>}
    {upload && <UploadDialog type={upload} onClose={() => setUpload(null)} onUploaded={handleUploaded}/>}
    {assetManager && <AssetManagerDialog initialType={assetManager} models={models} videos={videos} modelOnly={view === "realtime"} onClose={() => setAssetManager(null)} onUpload={openUploadFromManager} onChanged={refresh} onDeleted={handleAssetDeleted}/>}
    {deleteRecordTarget && <DeleteRecordDialog item={deleteRecordTarget} busy={recordActionBusy} error={recordActionError} onClose={() => { if (!recordActionBusy) { setDeleteRecordTarget(null); setRecordActionError(""); } }} onConfirm={() => void deleteRecord()}/>}
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
function Status({ status, progress, errorCode }: { status: Analysis["status"]; progress: number; errorCode?: Analysis["error_code"] }) { const effective = effectiveAnalysisStatus(status, errorCode); return <span className={`status ${effective}`}>{analysisStatusLabel(status, progress, errorCode)}</span>; }
function DeleteRecordDialog({ item, busy, error, onClose, onConfirm }: { item: Analysis; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) { return createPortal(<div className="record-delete-backdrop" role="presentation" onMouseDown={onClose}><section className="record-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-record-title" onMouseDown={(event) => event.stopPropagation()}><span><Trash2 size={23}/></span><p className="section-kicker">DELETE RECORD</p><h2 id="delete-record-title">탐색 기록을 삭제할까요?</h2><p>분석 결과와 생성된 결과 파일이 함께 삭제되며<br/>삭제한 기록은 복구할 수 없습니다.</p><div><small>삭제할 기록</small><strong>{item.video.name}</strong><em>{item.model.name} · {formatDate(item.created_at)}</em></div>{error && <p className="record-delete-error"><CircleHelp size={14}/>{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="button" className="danger" disabled={busy} onClick={onConfirm}>{busy ? "삭제 중..." : "기록 삭제"}</button></footer></section></div>, document.body); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDuration(seconds: number | null) { if (!seconds) return "—"; const minutes = Math.floor(seconds / 60); const rest = Math.round(seconds % 60); return minutes ? `${minutes}m ${rest}s` : `${rest}s`; }
