"use client";

import { useState } from "react";
import { BarChart3, Bell, CircleHelp, Clock3, ChevronDown, FileText, LogIn, Menu, MessageSquareText, ScanLine, X } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";

export type PublicView = "home" | "overview" | "development" | "notice" | "community" | "bug" | "faq";

type PublicPageHeaderProps = {
  activeView?: PublicView;
  onNavigate?: (view: PublicView) => void;
  onLogin?: () => void;
};

export function PublicPageHeader({ activeView = "home", onNavigate, onLogin }: PublicPageHeaderProps) {
  const [menu, setMenu] = useState(false);

  const defaultNavigate = (next: PublicView) => {
    window.location.href = next === "home" ? "/auth" : `/#${next}`;
  };

  function handleNavigate(next: PublicView) {
    if (onNavigate) onNavigate(next);
    else defaultNavigate(next);
    setMenu(false);
  }

  function handleLogin() {
    if (onLogin) onLogin();
    else window.location.href = "/auth/login";
    setMenu(false);
  }

  return (
    <header className="public-header">
      <button className="public-brand" onClick={() => handleNavigate("home")}>
        <BrandWordmark />
      </button>
      <button className="icon-button public-menu" onClick={() => setMenu((prev) => !prev)} aria-label="메뉴">
        {menu ? <X size={18} /> : <Menu size={18} />}
      </button>
      <nav className={menu ? "open" : ""}>
        <PublicNavGroup
          label="프로젝트 소개"
          active={activeView === "overview" || activeView === "development"}
        >
          <button className={activeView === "overview" ? "active" : ""} onClick={() => handleNavigate("overview")}>
            <ScanLine size={16} />
            프로젝트 개요
          </button>
          <button className={activeView === "development" ? "active" : ""} onClick={() => handleNavigate("development")}>
            <FileText size={16} />
            개발 정보
          </button>
        </PublicNavGroup>
        <PublicNavGroup label="분석 센터" active={false}>
          <button onClick={handleLogin}>
            <Clock3 size={16} />
            분석 시작
          </button>
          <button onClick={handleLogin}>
            <BarChart3 size={16} />
            탐색 기록
          </button>
          <button onClick={handleLogin}>
            <ScanLine size={16} />
            AI 성능 비교
          </button>
        </PublicNavGroup>
        <PublicNavGroup label="게시판" active={activeView === "notice" || activeView === "community" || activeView === "bug" || activeView === "faq"}>
          <button className={activeView === "notice" ? "active" : ""} onClick={() => handleNavigate("notice")}>
            <Bell size={16} />
            공지사항
          </button>
          <button className={activeView === "community" ? "active" : ""} onClick={() => handleNavigate("community")}>
            <MessageSquareText size={16} />
            자유게시판
          </button>
          <button className={activeView === "bug" ? "active" : ""} onClick={() => handleNavigate("bug")}>
            <MessageSquareText size={16} />
            버그 제보
          </button>
          <button className={activeView === "faq" ? "active" : ""} onClick={() => handleNavigate("faq")}>
            <CircleHelp size={16} />
            자주 묻는 질문
          </button>
        </PublicNavGroup>
      </nav>
      <button className="header-login" onClick={handleLogin}>
        <LogIn size={16} />
        로그인
      </button>
    </header>
  );
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
