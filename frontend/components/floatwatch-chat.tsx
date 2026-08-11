"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronRight, MessageCircle, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ContentItem } from "@/lib/types";

type ChatMessage = { id: number; role: "bot" | "user"; text: string; action?: { label: string; view: string } };

const quickQuestions = ["분석은 어떻게 시작하나요?", "어떤 PT 파일을 지원하나요?", "분석 기록은 어디서 보나요?"];
const guides = [
  { words: ["분석", "시작", "탐색"], text: "분석 센터의 부유물 탐색에서 이미지 또는 동영상과 YOLO PT 모델을 각각 등록한 뒤 분석을 시작할 수 있습니다.", action: { label: "부유물 탐색 열기", view: "analysis" } },
  { words: ["pt", "모델", "yolo"], text: "현재 YOLOv8 또는 YOLO11 기반 Detection·Segmentation PT 파일을 지원합니다.", action: { label: "모델 등록하기", view: "analysis" } },
  { words: ["기록", "결과", "이력"], text: "완료된 결과는 탐색 기록에서 영상, 탐지 결과와 클래스별 통계를 함께 확인할 수 있습니다.", action: { label: "탐색 기록 보기", view: "records" } },
  { words: ["비교", "성능", "모델별"], text: "AI 성능 비교에서 기존 탐색 기록을 선택해 모델별 탐지 결과와 처리 성능을 비교할 수 있습니다.", action: { label: "AI 성능 비교", view: "compare" } },
  { words: ["문의", "질문", "상담"], text: "해결되지 않은 내용은 1:1 문의로 남겨주세요. 작성한 문의와 첨부파일은 본인과 관리자만 확인합니다.", action: { label: "1:1 문의하기", view: "inquiry" } },
];

export function FloatWatchChat({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [faqs, setFaqs] = useState<ContentItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 1, role: "bot", text: "안녕하세요. FloatWatch 이용 방법을 안내해드릴게요." }]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { api<ContentItem[]>("/content?category=faq").then(setFaqs).catch(() => {}); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, open]);
  const normalizedFaqs = useMemo(() => faqs.map((item) => ({ ...item, plain: stripHtml(`${item.title} ${item.content}`) })), [faqs]);

  function ask(raw: string) {
    const question = raw.trim(); if (!question) return;
    const nextId = Date.now();
    const normalized = normalize(question);
    const guide = guides.map((item) => ({ item, score: item.words.filter((word) => normalized.includes(normalize(word))).length })).sort((a, b) => b.score - a.score)[0];
    const faq = normalizedFaqs.map((item) => ({ item, score: scoreText(normalized, normalize(item.plain)) })).sort((a, b) => b.score - a.score)[0];
    let reply: ChatMessage;
    if (faq && faq.score >= 2 && (!guide || faq.score > guide.score)) reply = { id: nextId + 1, role: "bot", text: stripHtml(faq.item.content) };
    else if (guide && guide.score > 0) reply = { id: nextId + 1, role: "bot", text: guide.item.text, action: guide.item.action };
    else reply = { id: nextId + 1, role: "bot", text: "관련 안내를 찾지 못했습니다. 정확한 확인이 필요하면 1:1 문의로 내용을 남겨주세요.", action: { label: loggedIn ? "1:1 문의 작성" : "로그인 후 문의하기", view: loggedIn ? "inquiry" : "login" } };
    setMessages((items) => [...items, { id: nextId, role: "user", text: question }, reply]); setInput("");
  }
  function submit(event: FormEvent) { event.preventDefault(); ask(input); }
  function navigate(view: string) { window.location.href = view === "login" ? "/auth?login=1" : `/auth?workspace=${view}`; }

  return <div className={`float-chat ${open ? "open" : ""}`}>
    {open && <section className="float-chat-panel" aria-label="FloatWatch 도움말 챗봇"><header><div><span><Bot size={19}/></span><div><strong>FloatWatch 도우미</strong><small>FAQ와 서비스 안내에서 답변합니다</small></div></div><button type="button" onClick={() => setOpen(false)} aria-label="챗봇 닫기"><X size={18}/></button></header><div className="float-chat-messages" ref={scrollRef}>{messages.map((message) => <article className={message.role} key={message.id}><p>{message.text}</p>{message.action && <button type="button" onClick={() => navigate(message.action!.view)}>{message.action.label}<ChevronRight size={14}/></button>}</article>)}</div>{messages.length === 1 && <div className="float-chat-quick">{quickQuestions.map((question) => <button type="button" onClick={() => ask(question)} key={question}>{question}</button>)}</div>}<form onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={300} placeholder="궁금한 내용을 입력하세요" aria-label="챗봇 질문"/><button type="submit" disabled={!input.trim()} aria-label="질문 보내기"><Send size={17}/></button></form><footer>현재 답변은 OpenAI를 사용하지 않습니다.</footer></section>}
    <button className="float-chat-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "챗봇 닫기" : "도움말 챗봇 열기"}>{open ? <X size={21}/> : <MessageCircle size={22}/>}<span>도움말</span></button>
  </div>;
}

function normalize(value: string) { return value.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim(); }
function stripHtml(value: string) { return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function scoreText(question: string, target: string) { const tokens = question.split(" ").filter((token) => token.length > 1); return tokens.reduce((score, token) => score + (target.includes(token) ? 1 : 0), 0); }
