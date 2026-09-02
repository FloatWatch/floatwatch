"use client";

import { CSSProperties, FormEvent, MouseEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
  ScanLine,
  FileText,
  FileVideo,
  BarChart3,
  Code2,
  Cpu,
  Database,
  Server,
  LogOut,
  Presentation,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { API_URL, api } from "@/lib/api";
import type { User as UserType } from "@/lib/types";
import { BrandWordmark } from "./brand-wordmark";
import { OceanBoardPage } from "./ocean-board-page";

type PublicView = "home" | "overview" | "development" | "notice" | "community" | "bug" | "faq";
type AuthMode = "login" | "register";

type AuthProps = {
  onSuccess?: (user: UserType) => void;
  onBack?: () => void;
  onHeaderNavigate?: (view: PublicView) => void;
  onHeaderLogin?: () => void;
  onStartAnalysis?: () => void;
  initialMode?: AuthMode;
  initialPanelCollapsed?: boolean;
  initialProfileOpen?: boolean;
  showPanelToggle?: boolean;
  showAuthTabs?: boolean;
  compactMode?: boolean;
  isPanelOpen?: boolean;
  externalError?: string;
  authenticatedUser?: UserType;
  onWorkspaceNavigate?: (view: "analysis" | "realtime" | "records" | "free" | "inquiry" | "admin") => void;
  onAuthenticatedLogout?: () => void;
  onUserUpdated?: (user: UserType) => void;
  profileStats?: { analyses: number; inquiries: number };
  contentView?: "home" | "overview" | "development" | "notice" | "community" | "bug" | "faq";
};

type FormState = { name: string; email: string; password: string };

export function AuthScreen({
  onSuccess,
  onBack,
  onHeaderNavigate,
  onHeaderLogin,
  onStartAnalysis,
  initialMode = "login",
  initialPanelCollapsed = true,
  initialProfileOpen = false,
  showPanelToggle = true,
  showAuthTabs = true,
  compactMode = false,
  isPanelOpen,
  externalError = "",
  authenticatedUser,
  onWorkspaceNavigate,
  onAuthenticatedLogout,
  onUserUpdated,
  profileStats = { analyses: 0, inquiries: 0 },
  contentView = "home",
}: AuthProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [values, setValues] = useState<FormState>({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(initialProfileOpen);
  const [profileClosing, setProfileClosing] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [openMenu, setOpenMenu] = useState<"project" | "analysis" | "board" | null>(null);
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileDeleteConfirmation, setProfileDeleteConfirmation] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [boardRevision, setBoardRevision] = useState(0);
  const [panelCollapsed, setPanelCollapsed] = useState(
    isPanelOpen === undefined ? initialPanelCollapsed : true,
  );
  const [panelClosing, setPanelClosing] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [stageHeight, setStageHeight] = useState(910);

  useEffect(() => {
    const updateStageScale = () => {
      if (window.innerWidth < 900) {
        setStageScale(1);
        setStageHeight(window.innerHeight);
        return;
      }
      const nextScale = window.innerWidth / 1900;
      setStageScale(nextScale);
      setStageHeight(window.innerHeight / nextScale);
    };
    updateStageScale();
    window.addEventListener("resize", updateStageScale);
    return () => window.removeEventListener("resize", updateStageScale);
  }, []);

  useEffect(() => {
    if (isPanelOpen === undefined) return;
    if (isPanelOpen) {
      setPanelClosing(false);
      const frame = window.requestAnimationFrame(() => setPanelCollapsed(false));
      return () => window.cancelAnimationFrame(frame);
    }
    if (panelCollapsed) return;
    setPanelClosing(true);
    const timer = window.setTimeout(() => {
      setPanelCollapsed(true);
      setPanelClosing(false);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [isPanelOpen]);

  function closeProfilePanel() {
    if (profileClosing) return;
    setProfileClosing(true);
    window.setTimeout(() => {
      setProfileOpen(false);
      setPanelCollapsed(true);
      setProfileClosing(false);
      setProfileEditing(false);
      setProfileCurrentPassword("");
      setProfilePassword("");
      setProfileDeleteConfirmation("");
      setProfileMessage("");
    }, 360);
  }

  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [contentView]);

  function handleHeaderNavigate(next: PublicView) {
    if (onHeaderNavigate) onHeaderNavigate(next);
    else window.location.href = next === "home" ? "/" : `/#${next}`;
  }

  function handleHeaderLogin() {
    if (authenticatedUser && onWorkspaceNavigate) {
      onWorkspaceNavigate("analysis");
      return;
    }
    if (onHeaderLogin) onHeaderLogin();
    else window.location.href = "/auth";
  }

  function handleStartAnalysis() {
    if (onStartAnalysis) onStartAnalysis();
    else handleHeaderLogin();
  }

  function handleWorkspaceShortcut(view: "realtime" | "analysis" | "free") {
    if (onWorkspaceNavigate) {
      onWorkspaceNavigate(view);
      return;
    }
    if (view === "analysis") {
      handleStartAnalysis();
      return;
    }
    handleHeaderLogin();
  }

  function handleProjectOverview() {
    if (onHeaderNavigate) onHeaderNavigate("overview");
    else window.location.href = "/#overview";
  }

  function navigateFromMenu(view: PublicView) {
    setOpenMenu(null);
    if (view === "notice" || view === "community" || view === "bug" || view === "faq") {
      setBoardRevision((revision) => revision + 1);
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (onHeaderNavigate) onHeaderNavigate(view);
  }

  function handleSocialLogin(provider: "kakao" | "naver" | "google") {
    window.location.assign(`${API_URL}/auth/oauth/${provider}`);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!values.email.trim() || !values.password.trim()) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (mode === "register" && !values.name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }

    setBusy(true);
    try {
      const payload =
        mode === "register"
          ? { name: values.name.trim(), email: values.email.trim(), password: values.password.trim() }
          : { email: values.email.trim(), password: values.password.trim() };
      const user = await api<UserType>(mode === "register" ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSuccess?.(user);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("요청 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProfileMessage("");
    try {
      await api<void>("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({ current_password: profileCurrentPassword, new_password: profilePassword }),
      });
      onAuthenticatedLogout?.();
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "개인 정보를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (profileDeleteConfirmation !== "회원 탈퇴") {
      setProfileMessage("확인란에 '회원 탈퇴'를 정확히 입력해 주세요.");
      return;
    }
    setBusy(true);
    setProfileMessage("");
    try {
      await api<void>("/auth/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: profileDeleteConfirmation, current_password: profileCurrentPassword || undefined }),
      });
      onAuthenticatedLogout?.();
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "회원 탈퇴를 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function closePanelFromMain(event: MouseEvent<HTMLElement>) {
    if (panelCollapsed) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label, [role='button']")) return;

    if (authenticatedUser) {
      closeProfilePanel();
      return;
    }
    if (onBack) onBack();
    else setPanelCollapsed(true);
  }

  return (
    <div
      className="auth-entry-shell"
      style={{
        "--auth-stage-scale": stageScale,
        "--auth-stage-height": `${stageHeight}px`,
      } as CSSProperties}
    >
      <main className={`auth-shell ${compactMode ? "auth-shell-compact" : ""} ${panelCollapsed ? "auth-shell-collapsed" : ""} ${panelClosing ? "auth-panel-closing" : ""} ${authenticatedUser && profileOpen ? "profile-overlay-open" : ""} ${profileClosing ? "profile-overlay-closing" : ""}`}>
        {!compactMode && (
          <section onClick={closePanelFromMain} className={`auth-visual ${contentView !== "home" ? "auth-visual-overview" : ""} ${contentView === "development" ? "auth-visual-development" : ""} ${contentView === "notice" || contentView === "community" || contentView === "bug" || contentView === "faq" ? "auth-visual-board" : ""}`}>
            <span className="auth-shade" aria-hidden="true" />

            <div className="auth-topline">
              <button
                className="brand-lockup auth-brand-home"
                type="button"
                onClick={() => handleHeaderNavigate("home")}
                aria-label="메인 화면으로 이동"
              >
                <BrandWordmark inverse />
              </button>
              <nav className="auth-top-menu" aria-label="상단 메뉴" onMouseLeave={() => setOpenMenu(null)}>
                <div className={`auth-menu-group ${openMenu === "project" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("project")}>
                  <button className="auth-menu-trigger" type="button" onFocus={() => setOpenMenu("project")}>프로젝트 소개</button>
                  <div>
                    <button type="button" onClick={() => navigateFromMenu("overview")}>
                      프로젝트 개요
                    </button>
                    <button type="button" onClick={() => navigateFromMenu("development")}>
                      개발정보
                    </button>
                  </div>
                </div>
                <div className={`auth-menu-group ${openMenu === "analysis" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("analysis")}>
                  <button className="auth-menu-trigger" type="button" onFocus={() => setOpenMenu("analysis")}>분석 센터</button>
                  <div>
                    <button type="button" onClick={() => { setOpenMenu(null); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); authenticatedUser && onWorkspaceNavigate ? onWorkspaceNavigate("realtime") : handleHeaderLogin(); }}>
                      실시간 탐색
                    </button>
                    <button type="button" onClick={() => { setOpenMenu(null); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); authenticatedUser && onWorkspaceNavigate ? onWorkspaceNavigate("analysis") : handleHeaderLogin(); }}>
                      부유물 탐색
                    </button>
                    <button type="button" onClick={() => { setOpenMenu(null); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); authenticatedUser && onWorkspaceNavigate ? onWorkspaceNavigate("records") : handleHeaderLogin(); }}>
                      탐색 기록
                    </button>
                  </div>
                </div>
                <div className={`auth-menu-group ${openMenu === "board" ? "menu-open" : ""}`} onMouseEnter={() => setOpenMenu("board")}>
                  <button className="auth-menu-trigger" type="button" onFocus={() => setOpenMenu("board")}>게시판</button>
                  <div>
                    <button type="button" onClick={() => navigateFromMenu("notice")}>
                      공지사항
                    </button>
                    <button type="button" onClick={() => navigateFromMenu("community")}>
                      자유게시판
                    </button>
                    <button type="button" onClick={() => navigateFromMenu("bug")}>
                      버그 제보
                    </button>
                    <button type="button" onClick={() => navigateFromMenu("faq")}>
                      자주 묻는 질문
                    </button>
                    <button type="button" onClick={() => { setOpenMenu(null); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); authenticatedUser && onWorkspaceNavigate ? onWorkspaceNavigate("inquiry") : handleHeaderLogin(); }}>
                      1:1 문의
                    </button>
                  </div>
                </div>
              </nav>

              {authenticatedUser ? (
                <div className="auth-account-actions">
                  <button className="header-login auth-header-login" type="button" aria-expanded={profileOpen} onClick={() => {
                    if (profileOpen) {
                      closeProfilePanel();
                      return;
                    }
                    setProfileClosing(false);
                    setProfileOpen((open) => {
                      setPanelCollapsed(open);
                      return !open;
                    });
                  }}>
                    <User size={15} />
                    {authenticatedUser.name}님
                  </button>
                </div>
              ) : (
                <button className="header-login auth-header-login" type="button" onClick={handleHeaderLogin}>
                  로그인
                </button>
              )}
            </div>

            {contentView === "overview" ? (
              <section key="overview" className="overview-page-content overview-architecture-page page-content-transition">
                <div className="ocean-development-layout overview-architecture-layout">
                  <header className="development-heading overview-architecture-heading">
                    <div><span>PROJECT OVERVIEW · VIDEO BASED</span><h2>관측 영상을<br /><strong>판단 가능한 기록으로</strong></h2></div>
                    <p>FloatWatch는 영상 속 부유물의 종류와 위치를 식별하고, 탐지 결과와 처리 성능을 비교 가능한 기록으로 전환합니다. 사람이 반복해서 찾아보던 관측 과정을 더 빠르고 명확하게 만듭니다.</p>
                  </header>

                  <section className="development-stack-panel overview-stack-panel" aria-label="서비스 분석 흐름">
                    <div className="development-stack-flow overview-stack-flow">
                      <article><div><FileVideo size={27} /></div><small>VIDEO INPUT</small><h3>영상 등록</h3><p>보유한 관측 영상 업로드</p></article>
                      <ArrowRight aria-hidden="true" />
                      <article><div><Cpu size={27} /></div><small>MODEL APPLY</small><h3>PT 모델 적용</h3><p>학습된 YOLO 모델 연결</p></article>
                      <ArrowRight aria-hidden="true" />
                      <article><div><ScanLine size={27} /></div><small>AI DETECTION</small><h3>부유물 탐지</h3><p>종류 · 위치 · 신뢰도 시각화</p></article>
                      <ArrowRight aria-hidden="true" />
                      <article><div><BarChart3 size={27} /></div><small>PERFORMANCE</small><h3>결과 비교</h3><p>클래스 통계 · 처리 지표 기록</p></article>
                    </div>
                    <footer className="development-specs overview-specs">
                      <div><small>ANALYSIS TARGET</small><strong>드론 · CCTV 관측 영상</strong></div>
                      <div><small>AI MODEL</small><strong>사용자 등록 YOLO PT</strong></div>
                      <div><small>DETECTION RESULT</small><strong>종류 · 위치 · 신뢰도</strong></div>
                      <div><small>USAGE</small><strong>기록 확인 · 성능 비교</strong></div>
                    </footer>
                  </section>
                </div>
              </section>
            ) : contentView === "development" ? (
              <section key="development" className="development-page-content page-content-transition">
                <div className="ocean-development-layout">
                  <header className="development-heading">
                    <div><span>TECHNOLOGY STACK · MVP</span><h2>분석 결과를 만드는<br /><strong>하나의 기술 흐름</strong></h2></div>
                    <p>사용자 화면에서 시작된 분석 요청이 API와 데이터 저장소를 거쳐 AI 추론 결과로 돌아오는 구조입니다. 학습된 PT 모델을 실제 영상에서 검증하는 데 필요한 기술만 선별했습니다.</p>
                  </header>

                  <section className="development-stack-panel" aria-label="기술 아키텍처와 MVP 명세">
                    <div className="development-stack-flow">
                      <article><div><Code2 size={27} /></div><small>FRONTEND</small><h3>Next.js</h3><p>React · TypeScript</p></article>
                      <ArrowRight aria-hidden="true" />
                      <article><div><Server size={27} /></div><small>BACKEND API</small><h3>FastAPI</h3><p>Python · REST API</p></article>
                      <ArrowRight aria-hidden="true" />
                      <article><div><Database size={27} /></div><small>DATA LAYER</small><h3>SQLite</h3><p>사용자 · 모델 · 분석 기록</p></article>
                      <ArrowRight aria-hidden="true" />
                      <article><div><Cpu size={27} /></div><small>AI INFERENCE</small><h3>Ultralytics</h3><p>YOLO · OpenCV · CPU</p></article>
                    </div>
                    <footer className="development-specs">
                      <div><small>SUPPORTED MODEL</small><strong>YOLOv8 · YOLO11</strong></div>
                      <div><small>VISION TASK</small><strong>Detection · Segmentation</strong></div>
                      <div><small>INPUT / OUTPUT</small><strong>Video · Annotated Video</strong></div>
                      <div><small>RUNTIME</small><strong>Local PC · CPU</strong></div>
                    </footer>
                  </section>
                </div>
              </section>
            ) : contentView === "notice" || contentView === "community" || contentView === "bug" || contentView === "faq" ? (
              <OceanBoardPage
                key={`${contentView}-${boardRevision}`}
                category={contentView === "community" ? "free" : contentView}
                user={authenticatedUser}
                onLogin={handleHeaderLogin}
              />
            ) : (
            <div className="auth-copy page-content-transition">
              <h1>AI가 읽어내는 바다</h1>
              <div className="auth-copy-description">
                <p>드론과 CCTV 영상 속 부유물을 감지해 종류와 위치,<br />위험도를 실시간으로 분류합니다.</p>
                <p>필요한 구간을 빠르게 파악하고 효율적인 수거 동선으로 연결합니다.</p>
              </div>
              <div className="auth-visual-actions">
                <button type="button" className="auth-analysis-button" onClick={handleStartAnalysis} aria-label="분석 시작">
                  <ScanLine size={16} />
                  <span>분석 시작</span>
                  <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="auth-analysis-button auth-overview-button"
                  onClick={handleProjectOverview}
                  aria-label="프로젝트 소개"
                >
                  <FileText size={16} />
                  <span>프로젝트 소개</span>
                </button>
              </div>
            </div>
            )}

            {contentView === "home" && <div className="auth-capabilities" aria-label="주요 탐색 기능 바로가기">
              <button type="button" onClick={() => handleWorkspaceShortcut("realtime")}>
                <span><small>LIVE MONITORING</small><strong>실시간 해양 현장을 관측하세요</strong></span><ArrowRight aria-hidden="true" />
              </button>
              <button type="button" onClick={() => handleWorkspaceShortcut("analysis")}>
                <span><small>OBJECT DETECTION</small><strong>영상 속 부유물을 탐지하세요</strong></span><ArrowRight aria-hidden="true" />
              </button>
              <button type="button" onClick={() => { window.location.href = "/presentation"; }}>
                <span><small>PROJECT PRESENTATION</small><strong>FloatWatch 프로젝트 PPT 보기</strong></span><Presentation aria-hidden="true" />
              </button>
            </div>}
          </section>
        )}

        <section className={`auth-panel ${panelCollapsed ? "auth-panel-collapsed" : ""}`}>
          {showPanelToggle ? (
            <button
              className="icon-button auth-panel-toggle"
              type="button"
              aria-expanded={!panelCollapsed}
              aria-controls="auth-panel-content"
              onClick={() => setPanelCollapsed((prev) => !prev)}
              aria-label={panelCollapsed ? "로그인 패널 열기" : "로그인 패널 접기"}
              title={panelCollapsed ? "로그인 패널 열기" : "로그인 패널 접기"}
            >
              <ChevronRight size={16} />
            </button>
          ) : null}

          <div className={`auth-form-wrap ${panelCollapsed ? "auth-form-wrap-collapsed" : ""}`} id="auth-panel-content">
            {authenticatedUser ? (
              <div className="profile-panel-content">
                <div className="auth-form-backline-wrap">
                  <button className="auth-form-backline" type="button" onClick={() => {
                    if (profileEditing) {
                      setProfileEditing(false);
                      setProfileCurrentPassword("");
                      setProfilePassword("");
                      setProfileDeleteConfirmation("");
                      setProfileMessage("");
                      return;
                    }
                    closeProfilePanel();
                  }} aria-label={profileEditing ? "마이페이지로 돌아가기" : "마이페이지 닫기"}>
                    <ArrowLeft size={16} />
                  </button>
                </div>
                <div className="auth-form-heading">
                  <span className="auth-lock"><User size={19} /></span>
                  <div><p className="section-kicker">{profileEditing ? "ACCOUNT SETTINGS" : "MY FLOATWATCH"}</p><h2>{profileEditing ? "개인정보 관리" : "마이페이지"}</h2></div>
                </div>
                {!profileEditing && <div className="profile-view-enter"><div className="profile-identity">
                  <span>{authenticatedUser.name.slice(0, 1)}</span>
                  <div>
                    <strong>{authenticatedUser.name}님</strong>
                    <p>{authenticatedUser.email}</p>
                  </div>
                  {authenticatedUser.role === "admin" ? <div className="profile-admin-actions"><button className="profile-admin-badge" type="button" onClick={() => onWorkspaceNavigate?.("admin")} title="관리자 페이지로 이동"><ShieldCheck size={11} />관리자</button></div> : <em><ShieldCheck size={11} />일반 회원</em>}
                </div>
                <div className="profile-activity" aria-label="나의 이용 현황">
                  <div><small>분석 기록</small><strong>{profileStats.analyses}<em>건</em></strong></div>
                  <div><small>1:1 문의</small><strong>{profileStats.inquiries}<em>건</em></strong></div>
                </div>
                <p className="profile-section-label">나의 서비스</p><div className="profile-shortcuts">
                  <button type="button" onClick={() => { setProfileEditing(true); setProfileMessage(""); }}>
                    <User size={18} /><span><strong>개인 정보 관리</strong><small>비밀번호 및 계정 관리</small></span><ChevronRight size={16} />
                  </button>
                  <button type="button" onClick={() => onWorkspaceNavigate?.("records")}>
                    <ScanLine size={18} /><span><strong>내 탐색 기록</strong><small>분석 결과와 탐지 기록 확인</small></span><ChevronRight size={16} />
                  </button>
                  <button type="button" onClick={() => onWorkspaceNavigate?.("inquiry")}>
                    <FileText size={18} /><span><strong>1:1 문의</strong><small>문의 작성 및 답변 확인</small></span><ChevronRight size={16} />
                  </button>
                </div></div>}
                {profileEditing && <form className="profile-edit-form profile-settings-view profile-view-enter" onSubmit={updateProfile}>
                  <div className="profile-settings-intro"><strong>비밀번호 변경</strong><p>현재 비밀번호를 확인한 뒤 새로운 비밀번호로 변경합니다.</p></div>
                  {authenticatedUser.auth_provider === "password" || !authenticatedUser.auth_provider ? <>
                    <label><span>현재 비밀번호</span><input type="password" value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} required placeholder="현재 비밀번호" /></label>
                    <label><span>새 비밀번호</span><input type="password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} minLength={8} required placeholder="8자 이상 입력" /></label>
                    <div className="profile-settings-actions"><button type="button" onClick={() => { setProfileEditing(false); setProfileCurrentPassword(""); setProfilePassword(""); setProfileDeleteConfirmation(""); }}>취소</button><button type="submit" disabled={busy}>{busy ? "처리 중..." : "비밀번호 변경"}</button></div>
                  </> : <p className="profile-account-note">소셜 로그인으로 가입한 계정은 FloatWatch에서 비밀번호를 변경할 수 없습니다. {authenticatedUser.auth_provider} 계정에서 비밀번호를 관리해 주세요.</p>}
                  <section className="profile-danger-zone"><div><strong>회원 탈퇴</strong><p>탈퇴하면 분석 기록과 업로드 파일이 함께 삭제됩니다.</p></div><label><span>탈퇴 확인</span><input value={profileDeleteConfirmation} onChange={(event) => setProfileDeleteConfirmation(event.target.value)} placeholder="'회원 탈퇴' 입력" /></label><button type="button" className="profile-delete-account" disabled={busy} onClick={deleteAccount}>회원 탈퇴</button></section>
                </form>}
                {profileMessage && <p className="profile-message">{profileMessage}</p>}
                {!profileEditing && <button className="profile-logout" type="button" onClick={onAuthenticatedLogout}>
                  <LogOut size={16} /> 로그아웃
                </button>}
              </div>
            ) : (
              <>
            {onBack && (
              <div className="auth-form-backline-wrap">
                <button className="auth-form-backline" type="button" onClick={onBack} aria-label="뒤로가기">
                  <ArrowLeft size={16} />
                </button>
              </div>
            )}

            <div className="auth-form-heading">
              <span className="auth-lock">
                <ShieldCheck size={19} />
              </span>
              <div>
                <p className="section-kicker">회원 이용</p>
                <h2>{mode === "login" ? "로그인" : "회원가입"}</h2>
              </div>
            </div>

            <p className="muted" style={{ marginBottom: "10px" }}>
              {mode === "login"
                ? "이메일과 비밀번호로 로그인해주세요."
                : "이름, 이메일, 비밀번호로 회원가입이 가능합니다."}
            </p>

            <div className="auth-form-body">
              {showAuthTabs ? (
                <div className="segmented auth-tabs">
                  <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>
                    로그인
                  </button>
                  <button
                    className={mode === "register" ? "active" : ""}
                    type="button"
                    onClick={() => setMode("register")}
                  >
                    회원가입
                  </button>
                </div>
              ) : null}

              <form className="form-stack auth-form" onSubmit={onSubmit}>
                {mode === "register" && (
                  <label>
                    <span>
                      <User size={14} /> 이름
                    </span>
                    <div className="auth-input">
                      <UserPlus size={14} />
                      <input
                        value={values.name}
                        onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="이름"
                        autoComplete="name"
                        required={mode === "register"}
                      />
                    </div>
                  </label>
                )}

                <label>
                  <span>
                    <Mail size={14} /> 이메일
                  </span>
                  <div className="auth-input">
                    <Mail size={14} />
                    <input
                      type="email"
                      value={values.email}
                      onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="name@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </label>

                <label>
                  <span>
                    <Lock size={14} /> 비밀번호
                  </span>
                  <div className="auth-input password-field">
                    <Lock size={14} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={values.password}
                      onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
                      placeholder={mode === "register" ? "비밀번호(8자 이상)" : "비밀번호"}
                      minLength={8}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      required
                    />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                {error && (
                  <div className="auth-feedback" role="alert" aria-live="polite">
                    <span className="auth-feedback-icon"><AlertCircle size={17} /></span>
                    <div>
                      <strong>로그인을 완료하지 못했습니다</strong>
                      <p>{error}</p>
                    </div>
                  </div>
                )}

                <button className="primary-button submit-button" type="submit" disabled={busy}>
                  {busy ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
                  {mode === "register" ? <ArrowRight size={16} /> : null}
                </button>
              </form>

              {mode === "login" && (
                <div className="social-login-block">
                  <div className="social-login-divider"><span>간편 로그인</span></div>
                  <div className="social-login-grid">
                    <button type="button" className="social-login-button" onClick={() => handleSocialLogin("kakao")} aria-label="카카오로 로그인">
                      <span className="social-brand social-brand-kakao">K</span>
                      <strong>카카오</strong>
                    </button>
                    <button type="button" className="social-login-button" onClick={() => handleSocialLogin("naver")} aria-label="네이버로 로그인">
                      <span className="social-brand social-brand-naver">N</span>
                      <strong>네이버</strong>
                    </button>
                    <button type="button" className="social-login-button" onClick={() => handleSocialLogin("google")} aria-label="Google로 로그인">
                      <span className="social-brand social-brand-google">G</span>
                      <strong>Google</strong>
                    </button>
                  </div>
                </div>
              )}

              <p className="auth-security">
                <AlertCircle size={13} />
                <span>업로드한 pt 성능은 별도 기록에서 비교 조회할 수 있습니다.</span>
              </p>
            </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
