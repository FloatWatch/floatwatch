"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Bell, CircleHelp, Clock3, FileVideo, MessageSquareText, ScanLine, Settings2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Analysis, ContentItem, User } from "@/lib/types";
import type { WorkspaceView } from "./workspace-sections";
import { analysisStatusLabel, effectiveAnalysisStatus } from "@/lib/analysis-status";

type Props = {
  user: User;
  analyses: Analysis[];
  modelCount: number;
  videoCount: number;
  onNavigate: (view: WorkspaceView) => void;
  onSelectAnalysis: (id: number) => void;
};

export function WorkspaceHome({ user, analyses, modelCount, videoCount, onNavigate, onSelectAnalysis }: Props) {
  const [notices, setNotices] = useState<ContentItem[]>([]);
  const [faqs, setFaqs] = useState<ContentItem[]>([]);
  useEffect(() => {
    Promise.all([api<ContentItem[]>("/content?category=notice"), api<ContentItem[]>("/content?category=faq")])
      .then(([noticeItems, faqItems]) => { setNotices(noticeItems); setFaqs(faqItems); }).catch(() => {});
  }, []);
  const completed = analyses.filter((item) => item.status === "completed");

  function openRecord(id: number) { onSelectAnalysis(id); onNavigate("records"); }

  return <div className="workspace-home">
    <section className="home-welcome">
      <div><p className="section-kicker">OCEAN OBSERVATION WORKSPACE</p><h2>{user.name}님, 오늘의 관측 영상을 확인하세요.</h2><p>새 영상에서 부유물을 탐색하거나, 축적된 결과를 이어서 확인할 수 있습니다.</p></div>
      <button className="home-main-action" onClick={() => onNavigate("analysis")}><ScanLine size={19}/><span><small>START OBSERVATION</small><strong>부유물 탐색</strong></span><ArrowRight size={18}/></button>
    </section>

    <section className="home-status">
      <div><span><BarChart3/></span><small>완료한 분석</small><strong>{completed.length}<em>건</em></strong></div>
      <div><span><ScanLine/></span><small>누적 탐지</small><strong>{completed.reduce((sum, item) => sum + item.total_detections, 0).toLocaleString()}<em>건</em></strong></div>
      <div><span><Settings2/></span><small>등록 모델</small><strong>{modelCount}<em>개</em></strong></div>
      <div><span><FileVideo/></span><small>등록 영상</small><strong>{videoCount}<em>개</em></strong></div>
    </section>

    <section className="home-shortcuts">
      <button onClick={() => onNavigate("records")}><span><Clock3/></span><div><strong>내 분석 기록</strong><small>완료된 결과 영상과 통계 확인</small></div><ArrowRight/></button>
      <button onClick={() => onNavigate("free")}><span><MessageSquareText/></span><div><strong>자유게시판</strong><small>분석 경험과 관련 정보 공유</small></div><ArrowRight/></button>
      <button onClick={() => onNavigate("inquiry")}><span><ShieldCheck/></span><div><strong>1:1 문의</strong><small>관리자에게 비공개로 문의</small></div><ArrowRight/></button>
      {user.role === "admin" ? <button className="admin-shortcut" onClick={() => onNavigate("admin")}><span><Settings2/></span><div><strong>관리자 콘솔</strong><small>회원, 기록, 게시글 및 문의 관리</small></div><ArrowRight/></button> : <button onClick={() => onNavigate("faq")}><span><CircleHelp/></span><div><strong>자주 묻는 질문</strong><small>이용 방법과 지표 안내</small></div><ArrowRight/></button>}
    </section>

    <div className="home-columns">
      <section className="home-feed"><header><div><p className="section-kicker">RECENT ANALYSIS</p><h3>최근 분석 기록</h3></div><button onClick={() => onNavigate("records")}>전체 보기<ArrowRight size={15}/></button></header><div>{analyses.slice(0, 4).map((item) => { const effective = effectiveAnalysisStatus(item.status, item.error_code); return <button className="home-record" key={item.id} onClick={() => openRecord(item.id)}><span className={`run-icon ${effective}`}><ScanLine size={17}/></span><div><strong>{item.video.name}</strong><small>{item.model.name} · {formatDate(item.created_at)}</small></div><span className={`status ${effective}`}>{statusName(item.status, item.error_code)}</span></button>; })}{!analyses.length && <div className="home-empty"><ScanLine size={24}/><p>아직 분석 기록이 없습니다.</p><button onClick={() => onNavigate("analysis")}>첫 분석 시작</button></div>}</div></section>

      <section className="home-feed home-news"><header><div><p className="section-kicker">SERVICE NEWS</p><h3>공지사항</h3></div><Bell size={19}/></header><div>{notices.slice(0, 3).map((item) => <button key={item.id} onClick={() => onNavigate("notice")}><span>{item.pinned ? "중요" : "공지"}</span><div><strong>{item.title}</strong><small>{formatDate(item.created_at)}</small></div></button>)}{!notices.length && <div className="home-empty"><p>등록된 공지가 없습니다.</p></div>}</div><footer><button onClick={() => onNavigate("faq")}><CircleHelp size={16}/>자주 묻는 질문 {faqs.length}건<ArrowRight size={14}/></button></footer></section>
    </div>
  </div>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function statusName(value: Analysis["status"], errorCode?: Analysis["error_code"]) { return analysisStatusLabel(value, 0, errorCode).replace(/ \d+%$/, ""); }
