"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, ChevronRight, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ContentItem } from "@/lib/types";

type ChatMessage = { id: number; role: "bot" | "user"; text: string; action?: { label: string; view: string } };

const quickQuestions = ["이 프로젝트는 왜 만들었나요?", "분석은 어떻게 시작하나요?", "어떤 PT 파일을 지원하나요?", "실시간 CCTV도 지원하나요?"];
const followUpsByView: Record<string, string[]> = {
  overview: ["무엇을 탐지할 수 있나요?", "분석은 어떻게 시작하나요?", "실시간 CCTV도 지원하나요?", "결과는 어디에 저장되나요?"],
  development: ["어떤 PT 파일을 지원하나요?", "분석 시간은 얼마나 걸리나요?", "지원하는 미디어 형식은?", "Detection과 Segmentation 차이는?"],
  analysis: ["어떤 PT 파일을 지원하나요?", "지원하는 미디어 형식은?", "최소 신뢰도는 무엇인가요?", "결과는 어디에 저장되나요?"],
  compare: ["신뢰도는 정확도인가요?", "두 모델은 어떻게 비교하나요?", "결과는 어디에 저장되나요?", "최소 신뢰도는 무엇인가요?"],
  records: ["두 모델은 어떻게 비교하나요?", "신뢰도는 정확도인가요?", "분석은 어떻게 시작하나요?", "분석 실패 시 어떻게 하나요?"],
  inquiry: ["분석 실패 시 어떻게 하나요?", "업로드 용량 제한은?", "지원하는 미디어 형식은?", "내 기록은 다른 사람도 보나요?"],
  login: ["내 기록은 다른 사람도 보나요?", "분석은 어떻게 시작하나요?", "결과는 어디에 저장되나요?", "1:1 문의는 비공개인가요?"],
  home: ["내 기록은 다른 사람도 보나요?", "결과는 어디에 저장되나요?", "분석은 어떻게 시작하나요?", "1:1 문의는 비공개인가요?"],
};
const guides = [
  {
    words: ["프로젝트 목적", "만든 목적", "만든 이유", "개발 목적", "개발 이유", "개발 배경", "왜 만들", "무엇을 위해"],
    text: "FloatWatch는 영상 속 해양 부유물의 종류와 위치를 AI로 식별하고, 탐지 결과와 모델 성능을 비교 가능한 기록으로 제공하기 위해 개발되었습니다. 반복적인 관측 과정을 줄이고 더 빠르고 명확한 대응 판단을 돕는 것이 목적입니다.",
    action: { label: "프로젝트 개요 보기", view: "overview" },
  },
  {
    words: ["실시간", "cctv", "드론", "연안", "카메라", "라이브"],
    text: "현재 MVP는 사용자가 업로드한 이미지와 동영상을 분석합니다. 드론과 연안 CCTV 영상을 실시간으로 연계하는 기능은 최종 목표이며, 현재 시연 범위에는 포함되지 않습니다.",
    action: { label: "개발정보 보기", view: "development" },
  },
  {
    words: ["학습", "라벨링", "로보플로우", "roboflow", "데이터셋", "훈련"],
    text: "FloatWatch는 AI 모델을 직접 학습시키지 않습니다. Roboflow 등에서 라벨링과 학습을 완료한 YOLO PT 모델을 업로드해 이미지나 동영상에서 추론하고 결과를 확인하는 서비스입니다.",
    action: { label: "개발정보 보기", view: "development" },
  },
  {
    words: ["지원 형식", "파일 형식", "확장자", "mp4", "avi", "mov", "mkv", "webm", "jpg", "jpeg", "png", "webp", "bmp"],
    text: "미디어는 JPG·JPEG·PNG·WEBP·BMP 이미지와 MP4·AVI·MOV·MKV·WEBM 동영상을 지원합니다. 미디어는 최대 2GB까지 업로드할 수 있습니다.",
    action: { label: "미디어 업로드", view: "analysis" },
  },
  {
    words: ["용량", "최대 크기", "몇 기가", "몇기가", "업로드 제한", "파일 크기"],
    text: "AI 모델은 .pt 형식으로 최대 500MB, 이미지와 동영상은 최대 2GB까지 업로드할 수 있습니다. 게시글과 1:1 문의 첨부파일은 파일당 최대 20MB입니다.",
    action: { label: "부유물 탐색 열기", view: "analysis" },
  },
  {
    words: ["박스", "바운딩", "세그먼트", "세그멘트", "segmentation", "detection", "마스크"],
    text: "YOLO Detection 모델은 부유물 위치를 바운딩 박스로 표시하고, Segmentation 모델은 물체 영역을 마스크 형태로 표시합니다. 업로드한 PT 모델의 작업 유형에 따라 결과 표현이 달라집니다.",
    action: { label: "부유물 탐색 열기", view: "analysis" },
  },
  {
    words: ["무엇을 탐지", "탐지 대상", "어떤 쓰레기", "쓰레기 종류", "클래스", "부유물 종류"],
    text: "탐지 대상과 클래스 이름은 업로드한 PT 모델의 학습 내용에 따라 결정됩니다. 폐플라스틱, 부표, 나무 조각 등 원하는 부유물 클래스로 학습한 모델을 사용하면 해당 종류와 위치를 구분해 표시할 수 있습니다.",
    action: { label: "프로젝트 개요 보기", view: "overview" },
  },
  {
    words: ["정확도", "map", "성능 지표", "평가 지표", "신뢰도", "처리 속도", "fps"],
    text: "분석 결과에서는 탐지 개수, 평균 신뢰도, 클래스별 통계와 처리 FPS를 확인할 수 있습니다. 이는 업로드한 미디어에서의 추론 결과이며, 정답 라벨 기반의 mAP처럼 모델의 공식 검증 정확도를 대신하지는 않습니다.",
    action: { label: "AI 성능 비교", view: "compare" },
  },
  {
    words: ["신뢰도 기준", "최소 신뢰도", "confidence", "오탐", "미탐"],
    text: "최소 신뢰도는 결과에 포함할 탐지의 기준값입니다. 값을 높이면 확실한 탐지만 남아 오탐이 줄 수 있지만 미탐이 늘 수 있고, 낮추면 더 많은 후보를 확인할 수 있습니다.",
    action: { label: "부유물 탐색 열기", view: "analysis" },
  },
  {
    words: ["gpu", "그래픽카드", "cpu", "분석 시간", "얼마나 걸", "처리 시간", "속도"],
    text: "현재 MVP는 별도 GPU 없이 로컬 PC의 CPU로 추론합니다. 처리 시간은 영상 길이와 해상도, 모델 크기, PC 성능에 따라 달라지므로 긴 영상은 시간이 더 걸릴 수 있습니다.",
    action: { label: "개발정보 보기", view: "development" },
  },
  {
    words: ["로그인", "회원가입", "카카오", "네이버", "구글", "소셜"],
    text: "이메일 계정으로 가입하거나 카카오·네이버·Google 간편 로그인을 이용할 수 있습니다. 부유물 탐색, 탐색 기록, AI 성능 비교와 1:1 문의는 로그인 후 사용할 수 있습니다.",
    action: { label: "로그인 화면 열기", view: "login" },
  },
  {
    words: ["다른 사용자", "남이", "공개", "보이나", "개인정보", "내 모델", "내 영상", "보안"],
    text: "업로드한 미디어와 PT 모델, 분석 기록은 사용자 계정별로 구분됩니다. 다른 일반 사용자의 목록에는 노출되지 않으며, 1:1 문의도 작성자와 관리자만 확인할 수 있습니다.",
    action: { label: "마이페이지로 이동", view: "home" },
  },
  {
    words: ["실패", "오류", "안돼", "안되", "멈춤", "업로드 문제", "분석 문제"],
    text: "먼저 파일 형식과 용량, PT 모델이 YOLOv8 또는 YOLO11 기반인지 확인해주세요. 계속 실패하면 오류가 발생한 단계와 파일 정보를 적어 1:1 문의로 남겨주시면 확인할 수 있습니다.",
    action: { label: "1:1 문의하기", view: "inquiry" },
  },
  {
    words: ["분석 방법", "사용 방법", "어떻게 시작", "분석 시작", "탐색 시작", "사용법"],
    text: "분석 센터의 부유물 탐색에서 이미지 또는 동영상과 학습된 YOLO PT 모델을 각각 업로드하고 선택한 뒤 분석 시작 버튼을 누르면 됩니다.",
    action: { label: "부유물 탐색 열기", view: "analysis" },
  },
  {
    words: ["pt", "모델 지원", "지원 모델", "yolov8", "yolo11", "yolo 11", "yolo 8"],
    text: "현재 YOLOv8 또는 YOLO11 기반 Detection·Segmentation PT 파일을 지원하며, 모델 파일은 최대 500MB까지 등록할 수 있습니다.",
    action: { label: "모델 등록하기", view: "analysis" },
  },
  {
    words: ["기록", "결과 어디", "이력", "지난 분석", "저장"],
    text: "완료된 결과는 내 탐색 기록에 자동으로 저장됩니다. 분석 미디어, 탐지 결과, 클래스별 통계와 처리 지표를 다시 확인할 수 있습니다.",
    action: { label: "탐색 기록 보기", view: "records" },
  },
  {
    words: ["비교", "모델별", "어떤 모델", "성능 비교"],
    text: "AI 성능 비교에서 내 탐색 기록 중 비교할 결과를 선택하면 모델별 탐지 개수, 평균 신뢰도와 처리 성능의 차이를 한눈에 확인할 수 있습니다.",
    action: { label: "AI 성능 비교", view: "compare" },
  },
  {
    words: ["문의", "질문", "상담", "1 1", "일대일"],
    text: "해결되지 않은 내용은 1:1 문의로 남겨주세요. 작성한 문의와 첨부파일은 본인과 관리자만 확인할 수 있습니다.",
    action: { label: "1:1 문의하기", view: "inquiry" },
  },
];

export function FloatWatchChat({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [faqs, setFaqs] = useState<ContentItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 1, role: "bot", text: "안녕하세요. FloatWatch 이용 방법을 안내해드릴게요." }]);
  const [input, setInput] = useState("");
  const [responding, setResponding] = useState(false);
  const [suggestions, setSuggestions] = useState(quickQuestions);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { api<ContentItem[]>("/content?category=faq").then(setFaqs).catch(() => {}); }, []);
  useEffect(() => {
    const update = () => setShowScrollTop(window.scrollY > 640);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, open, responding]);
  useEffect(() => () => {
    if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!chatRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);
  const normalizedFaqs = useMemo(() => faqs.map((item) => ({ ...item, plain: stripHtml(`${item.title} ${item.content}`) })), [faqs]);

  function ask(raw: string) {
    const question = raw.trim(); if (!question || responding) return;
    const nextId = Date.now();
    const normalized = normalize(question);
    const guide = guides.map((item) => ({ item, score: item.words.filter((word) => normalized.includes(normalize(word))).length })).sort((a, b) => b.score - a.score)[0];
    const faq = normalizedFaqs.map((item) => ({ item, score: scoreText(normalized, normalize(item.plain)) })).sort((a, b) => b.score - a.score)[0];
    let reply: ChatMessage;
    if (faq && faq.score >= 2 && (!guide || faq.score > guide.score)) reply = { id: nextId + 1, role: "bot", text: compactAnswer(stripHtml(faq.item.content)) };
    else if (guide && guide.score > 0) reply = { id: nextId + 1, role: "bot", text: compactAnswer(guide.item.text), action: guide.item.action };
    else reply = { id: nextId + 1, role: "bot", text: "관련 안내를 찾지 못했습니다. 정확한 확인이 필요하면 1:1 문의로 내용을 남겨주세요.", action: { label: loggedIn ? "1:1 문의 작성" : "로그인 후 문의하기", view: loggedIn ? "inquiry" : "login" } };
    const related = followUpsByView[reply.action?.view ?? ""] ?? quickQuestions;
    const nextSuggestions = related.filter((item) => normalize(item) !== normalized).slice(0, 4);
    setMessages((items) => [...items, { id: nextId, role: "user", text: question }]);
    setInput("");
    setResponding(true);
    responseTimerRef.current = setTimeout(() => {
      setMessages((items) => [...items, reply]);
      setSuggestions(nextSuggestions.length === 4 ? nextSuggestions : [...nextSuggestions, ...quickQuestions.filter((item) => normalize(item) !== normalized && !nextSuggestions.includes(item))].slice(0, 4));
      setResponding(false);
      responseTimerRef.current = null;
    }, 720);
  }
  function submit(event: FormEvent) { event.preventDefault(); ask(input); }
  function navigate(view: string) { window.location.href = view === "login" ? "/auth?login=1" : `/auth?workspace=${view}`; }

  return <div ref={chatRef} className={`float-chat ${open ? "open" : ""}`}>
    <section className={`float-chat-panel ${open ? "is-open" : "is-closed"}`} aria-label="FloatWatch 도움말 챗봇" aria-hidden={!open}><header><div><span><Bot size={19}/></span><div><strong>FloatWatch 도우미</strong><small>FAQ와 서비스 안내에서 답변합니다</small></div></div><button type="button" onClick={() => setOpen(false)} aria-label="챗봇 닫기"><X size={18}/></button></header><div className="float-chat-messages" ref={scrollRef}>{messages.map((message) => <article className={message.role} key={message.id}><p>{message.text}</p>{message.action && <button type="button" onClick={() => navigate(message.action!.view)}>{message.action.label}<ChevronRight size={14}/></button>}</article>)}{responding && <article className="bot float-chat-typing" aria-label="답변 작성 중"><p><span/><span/><span/></p></article>}</div>{!responding && <div className="float-chat-quick float-chat-followups">{suggestions.map((question) => <button type="button" onClick={() => ask(question)} key={question}>{question}</button>)}</div>}<form onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={300} placeholder={responding ? "답변을 준비하고 있습니다" : "궁금한 내용을 입력하세요"} aria-label="챗봇 질문" disabled={responding}/><button type="submit" disabled={!input.trim() || responding} aria-label="질문 보내기"><Send size={17}/></button></form><footer>현재 답변은 OpenAI를 사용하지 않습니다.</footer></section>
    {showScrollTop && !open && <button className="float-scroll-top" type="button" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" })} aria-label="맨 위로 이동" title="맨 위로"><ArrowUp size={20}/></button>}
    <button className="float-chat-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "챗봇 닫기" : "도움말 챗봇 열기"}>{open ? <X size={25}/> : <Bot size={30}/>}</button>
  </div>;
}

function normalize(value: string) { return value.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim(); }
function stripHtml(value: string) { return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function compactAnswer(value: string) {
  const text = stripHtml(value);
  const sentences = text.match(/[^.!?。]+[.!?。]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [text];
  const concise = sentences.slice(0, 2).join(" ");
  if (concise.length <= 145) return concise;
  const shortened = concise.slice(0, 142);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary > 90 ? boundary : 142).replace(/[.,!?]?$/, "")}…`;
}
function scoreText(question: string, target: string) { const tokens = question.split(" ").filter((token) => token.length > 1); return tokens.reduce((score, token) => score + (target.includes(token) ? 1 : 0), 0); }
