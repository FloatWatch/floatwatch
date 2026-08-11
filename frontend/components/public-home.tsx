"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cpu,
  FileText,
  Menu,
  MessageSquareText,
  Navigation,
  Radar,
  ScanLine,
  ShieldCheck,
  Ship,
  Target,
  Route,
  Waves,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ContentItem } from "@/lib/types";
import { BrandWordmark } from "./brand-wordmark";

type PublicView = "home" | "overview" | "development" | "notice" | "community" | "faq";

export function PublicHome({ onLogin }: { onLogin: () => void }) {
  const [view, setView] = useState<PublicView>("home");
  const [notices, setNotices] = useState<ContentItem[]>([]);
  const [faqs, setFaqs] = useState<ContentItem[]>([]);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    Promise.all([
      api<ContentItem[]>("/content?category=notice"),
      api<ContentItem[]>("/content?category=faq"),
      api<ContentItem[]>("/content?category=free"),
    ])
      .then(([noticeItems, faqItems, postItems]) => {
        setNotices(noticeItems);
        setFaqs(faqItems);
        setPosts(postItems);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const validViews: PublicView[] = ["overview", "development", "notice", "community", "faq"];
    const syncHash = () => {
      const hash = window.location.hash.slice(1) as PublicView;
      setView(validViews.includes(hash) ? hash : "home");
      window.scrollTo({ top: 0 });
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  function navigate(next: PublicView) {
    setView(next);
    setMenu(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const nextHash = next === "home" ? "" : `#${next}`;
    if (`${window.location.pathname}${window.location.hash}` !== `${window.location.pathname}${nextHash}`) {
      window.history.pushState(null, "", `${window.location.pathname}${nextHash}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className={`public-shell public-view-${view}`}>
      <header className="public-header">
        <button className="public-brand" onClick={() => navigate("home")}>
          <BrandMark />
        </button>
        <button className="icon-button public-menu" onClick={() => setMenu((prev) => !prev)} aria-label="메뉴">
          {menu ? <X size={18} /> : <Menu size={18} />}
        </button>
        <nav className={menu ? "open" : ""}>
          <PublicNavGroup
            label="프로젝트 소개"
            active={view === "overview" || view === "development"}
          >
            <button className={view === "overview" ? "active" : ""} onClick={() => navigate("overview")}>
              <FileText size={16} />
              프로젝트 개요
            </button>
            <button className={view === "development" ? "active" : ""} onClick={() => navigate("development")}>
              <Cpu size={16} />
              개발 정보
            </button>
          </PublicNavGroup>

          <PublicNavGroup label="분석 센터" active={false}>
            <button onClick={onLogin}>
              <Clock3 size={16} />
              분석 시작
            </button>
            <button onClick={onLogin}>
              <ScanLine size={16} />
              탐색 기록
            </button>
            <button onClick={onLogin}>
              <BarChart3 size={16} />
              AI 성능 비교
            </button>
          </PublicNavGroup>

          <PublicNavGroup label="게시판" active={view === "notice" || view === "community" || view === "faq"}>
            <button className={view === "notice" ? "active" : ""} onClick={() => navigate("notice")}>
              <Bell size={16} />
              공지사항
            </button>
            <button className={view === "community" ? "active" : ""} onClick={() => navigate("community")}>
              <MessageSquareText size={16} />
              자유게시판
            </button>
            <button className={view === "faq" ? "active" : ""} onClick={() => navigate("faq")}>
              <CircleHelp size={16} />
              자주 묻는 질문
            </button>
          </PublicNavGroup>
        </nav>
        <button className="header-login" onClick={onLogin}>
          <ScanLine size={16} />
          로그인
        </button>
      </header>

      {view === "home" && <PublicLandingPage onStart={onLogin} onOverview={() => navigate("overview")} />}
      {view === "overview" && <ProjectOverviewPage onStart={onLogin} />}
      {view === "development" && <DevelopmentInfoPage />}
      {view === "notice" && (
        <PublicSubpage
          kicker="NOTICE"
          title="공지사항"
          description="최신 공지사항을 확인할 수 있습니다."
          icon={<Bell size={20} />}
          onBack={() => navigate("home")}
        >
          <section className="public-content subpage-content">
            <div className="notice-list">
              {notices.map((item) => (
                <article key={item.id}>
                  <span>{item.pinned ? "고정" : "일반"}</span>
                  <strong>{item.title}</strong>
                  <time>{formatDate(item.created_at)}</time>
                </article>
              ))}
              {!notices.length && <p className="public-empty">공지사항이 없습니다.</p>}
            </div>
          </section>
        </PublicSubpage>
      )}
      {view === "community" && (
        <PublicSubpage
          kicker="COMMUNITY"
          title="자유게시판"
          description="회원들이 공유한 소식을 확인하세요."
          icon={<MessageSquareText size={20} />}
          onBack={() => navigate("home")}
        >
          <section className="community-band subpage-content">
            <div className="community-list">
              {posts.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.author?.name ?? "익명"} · 조회수 {item.views}</span>
                  </div>
                  <time>{formatDate(item.created_at)}</time>
                </article>
              ))}
              {!posts.length && <p className="public-empty">작성된 게시글이 없습니다.</p>}
            </div>
          </section>
        </PublicSubpage>
      )}
      {view === "faq" && (
        <PublicSubpage
          kicker="HELP CENTER"
          title="자주 묻는 질문"
          description="기능 사용법과 문제 해결을 안내합니다."
          icon={<CircleHelp size={20} />}
          onBack={() => navigate("home")}
        >
          <section className="faq-band subpage-content">
            <div className="faq-list">
              {faqs.map((item) => (
                <article key={item.id} className={openFaq === item.id ? "open" : ""}>
                  <button type="button" onClick={() => setOpenFaq(openFaq === item.id ? null : item.id)}>
                    <span>Q</span>
                    <strong>{item.title}</strong>
                    <ChevronDown size={16} />
                  </button>
                  {openFaq === item.id && <p>{item.content}</p>}
                </article>
              ))}
              {!faqs.length && <p className="public-empty">FAQ가 없습니다.</p>}
            </div>
          </section>
        </PublicSubpage>
      )}

      {(view === "notice" || view === "community" || view === "faq") && (
        <footer className="public-footer">
          <div className="public-brand">
            <BrandMark />
          </div>
          <p>AI 기반 수질·해양 쓰레기 탐지 프로젝트</p>
        </footer>
      )}
    </main>
  );
}

export function PublicLandingPage({ onStart, onOverview }: { onStart: () => void; onOverview: () => void }) {
  return (
    <>
      <section className="public-hero">
        <div className="hero-art" />
        <div className="public-hero-inner">
          <div className="hero-story-logo">
            <BrandWordmark />
          </div>
          <h1>
            AI가 읽어내는 바다
            <br />
            <strong>실시간 위험요소 분류 플랫폼</strong>
          </h1>
          <p>
            바다와 하천에서 수집한 영상을 분석해 떠다니는 쓰레기 종류를 분류하고, 수거 우선순위를 제시합니다.
          </p>
          <div className="hero-actions">
            <button className="hero-primary" onClick={onStart}>
              <ScanLine size={18} />
              분석 시작
            </button>
            <button className="hero-secondary" onClick={onOverview}>
              프로젝트 개요 <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <section className="service-band">
        <div>
          <span>
            <Camera />
          </span>
          <p>01. 입력</p>
          <strong>해양 영상 입력을 안정적으로 수집합니다.</strong>
        </div>
        <div>
          <span>
            <ScanLine />
          </span>
          <p>02. 탐지</p>
          <strong>빠르게 PT 모델로 객체를 탐지합니다.</strong>
        </div>
        <div>
          <span>
            <Navigation />
          </span>
          <p>03. 정리</p>
          <strong>탐지 결과를 분석 화면에서 즉시 확인합니다.</strong>
        </div>
      </section>
      <footer className="public-footer home-footer">
        <div className="public-brand">
          <BrandMark />
        </div>
        <p>한 번의 클릭으로 바다를 지키는 첫걸음입니다.</p>
      </footer>
    </>
  );
}

export function ProjectOverviewPage({ onStart }: { onStart: () => void }) {
  return (
    <section className="ocean-info-page ocean-overview-page">
      <div className="ocean-info-shade" aria-hidden="true" />
      <div className="ocean-info-content">
        <div className="ocean-info-lead">
          <p className="section-kicker">PROJECT OVERVIEW</p>
          <h1>발견에서 대응까지,<br /><strong>바다를 읽는 흐름</strong></h1>
          <p>영상 속 부유물을 AI가 식별하고 종류와 위치, 위험도를 정리합니다. 흩어진 관측 정보를 실제 대응에 필요한 판단으로 바꾸는 것이 FloatWatch의 역할입니다.</p>
          <button className="ocean-info-action" onClick={onStart}>
            <ScanLine size={17} /> 분석 시작 <ArrowRight size={15} />
          </button>
        </div>

        <div className="ocean-info-values" aria-label="프로젝트 핵심 가치">
          <article><Target /><small>01 · DETECT</small><strong>놓치지 않는 탐지</strong><p>영상 속 부유물 후보를 빠르게 찾아 종류별로 분류합니다.</p></article>
          <article><Radar /><small>02 · UNDERSTAND</small><strong>한눈에 읽는 결과</strong><p>탐지 수와 신뢰도, 클래스 통계를 명확하게 시각화합니다.</p></article>
          <article><Navigation /><small>03 · RESPOND</small><strong>대응으로 이어지는 정보</strong><p>필요한 구간을 선별해 효율적인 수거 판단을 지원합니다.</p></article>
        </div>
      </div>

      <div className="ocean-info-flow" aria-label="서비스 처리 흐름">
        <span><Waves /><b>영상 입력</b><small>보유 영상 업로드</small></span>
        <ArrowRight />
        <span><Cpu /><b>AI 분석</b><small>YOLO PT 모델 추론</small></span>
        <ArrowRight />
        <span><BarChart3 /><b>결과 확인</b><small>탐지 영상과 성능 지표</small></span>
      </div>
    </section>
  );
}

export function DevelopmentInfoPage() {
  return (
    <section className="ocean-info-page ocean-development-page">
      <div className="ocean-info-shade" aria-hidden="true" />
      <div className="development-info-layout">
        <header>
          <p className="section-kicker">DEVELOPMENT INFO</p>
          <h1>학습 모델의 가치를<br /><strong>검증하는 MVP</strong></h1>
          <p>AI 학습 과정은 분리하고, 완성된 PT 모델과 영상을 업로드해 탐지 결과와 성능을 비교하는 데 집중합니다.</p>
        </header>

        <section className="development-stages" aria-label="개발 처리 단계">
          <article><span>01</span><UploadIcon /><div><small>INPUT</small><strong>모델과 영상 등록</strong><p>YOLOv8·YOLO11 PT 파일과 분석할 동영상을 업로드합니다.</p></div></article>
          <article><span>02</span><Cpu /><div><small>INFERENCE</small><strong>CPU 기반 탐지 실행</strong><p>신뢰도 기준을 조정하며 박스 또는 세그먼트 결과를 생성합니다.</p></div></article>
          <article><span>03</span><BarChart3 /><div><small>REPORT</small><strong>성능과 기록 확인</strong><p>클래스별 통계, 처리 성능, 결과 영상과 모델별 이력을 확인합니다.</p></div></article>
        </section>
      </div>

      <footer className="development-tech-footer">
        <span><small>FRONTEND</small><b>Next.js · React</b></span>
        <span><small>BACKEND</small><b>FastAPI · Python</b></span>
        <span><small>DATABASE</small><b>SQLite</b></span>
        <span><small>INFERENCE</small><b>Ultralytics · CPU</b></span>
        <p><ShieldCheck /> 로컬 PC 시연 환경에 맞춘 MVP 구성</p>
      </footer>
    </section>
  );
}

function UploadIcon() {
  return <FileText />;
}

function BrandMark() {
  return <BrandWordmark />;
}

function PublicNavGroup({
  label,
  active,
  children,
}: {
  label: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={active ? "public-nav-group active" : "public-nav-group"}>
      <button>
        {label}
        <ChevronDown size={14} />
      </button>
      <div className="public-nav-dropdown">{children}</div>
    </div>
  );
}

function PublicSubpage({
  kicker,
  title,
  description,
  icon,
  onBack,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="public-page-heading">
        <div>
          <button type="button" onClick={onBack}>
            <ArrowLeft size={15} />
            뒤로가기
          </button>
          <p className="section-kicker">{kicker}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {icon ? <span>{icon}</span> : null}
      </section>
      {children}
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
