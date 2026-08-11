"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronLeft, ChevronRight, Download, Italic, LoaderCircle, Paperclip, PenLine, Pencil, Send, Star, Trash2, Underline } from "lucide-react";
import { API_URL, api } from "@/lib/api";
import type { ContentItem, User } from "@/lib/types";

type BoardCategory = "notice" | "free" | "faq";

const boardMeta = {
  notice: { kicker: "SERVICE NOTICE", title: "공지사항", description: "서비스 운영과 분석 기능의 주요 변경 사항을 전합니다." },
  free: { kicker: "COMMUNITY", title: "자유게시판", description: "분석 경험과 부유물 관측 정보를 자유롭게 나눌 수 있습니다." },
  faq: { kicker: "HELP CENTER", title: "자주 묻는 질문", description: "모델 등록부터 결과 확인까지 자주 묻는 내용을 정리했습니다." },
};

export function OceanBoardPage({ category, user, onLogin }: { category: BoardCategory; user?: User; onLogin: () => void }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const meta = boardMeta[category];
  const isAdmin = user?.role === "admin";
  const canWrite = category === "free" ? Boolean(user) : isAdmin;
  const pageCount = Math.max(1, Math.ceil(items.length / 10));
  const pageItems = items.slice((page - 1) * 10, page * 10);

  async function load() {
    setLoading(true);
    try {
      const loaded = (await api<ContentItem[]>(`/content?category=${category}`)).map(sanitizeItem);
      setItems(loaded.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() || b.id - a.id));
    }
    finally { setLoading(false); }
  }

  useEffect(() => {
    setSelected(null);
    setOpenFaq(null);
    setWriting(false);
    setEditing(null);
    setPage(1);
    load();
  }, [category]);

  useEffect(() => {
    function restoreBoardLocation() {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("post")) setSelected(null);
      if (!params.has("compose")) { setWriting(false); setEditing(null); }
    }
    window.addEventListener("popstate", restoreBoardLocation);
    return () => window.removeEventListener("popstate", restoreBoardLocation);
  }, []);

  function pushBoardState(key: "post" | "compose", value: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete(key === "post" ? "compose" : "post");
    url.searchParams.set(key, value);
    window.history.pushState({ [key]: value }, "", `${url.pathname}${url.search}`);
  }

  async function openItem(item: ContentItem) {
    const detail = await api<ContentItem>(`/content/${item.id}`);
    setSelected(sanitizeItem(detail));
    pushBoardState("post", String(item.id));
    setItems((current) => current.map((entry) => entry.id === detail.id ? detail : entry));
  }

  function startCreate() {
    if (!user) { onLogin(); return; }
    setEditing(null);
    setWriting(true);
    pushBoardState("compose", "new");
  }

  function startEdit(item: ContentItem) {
    setEditing(item);
    setWriting(true);
    setSelected(null);
    setOpenFaq(null);
    pushBoardState("compose", String(item.id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      category,
      title: String(data.get("title") ?? ""),
      content: String(data.get("content") ?? ""),
      pinned: isAdmin && category === "notice" ? data.get("pinned") === "on" : editing?.pinned ?? false,
    };
    const saved = editing
      ? await api<ContentItem>(`/content/${editing.id}`, { method: "PATCH", body: JSON.stringify({ title: body.title, content: body.content, pinned: body.pinned }) })
      : await api<ContentItem>("/content", { method: "POST", body: JSON.stringify(body) });
    const attachment = data.get("attachment");
    if (attachment instanceof File && attachment.size > 0) {
      const upload = new FormData();
      upload.append("file", attachment);
      await api(`/content/${saved.id}/attachments`, { method: "POST", body: upload });
    }
    setWriting(false);
    setEditing(null);
    await load();
  }

  async function togglePinned(item: ContentItem) {
    await api(`/content/${item.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !item.pinned }) });
    if (selected?.id === item.id) setSelected({ ...selected, pinned: !item.pinned });
    await load();
  }

  async function remove(item: ContentItem) {
    if (!window.confirm(`'${item.title}' 게시글을 삭제하시겠습니까?`)) return;
    await api(`/content/${item.id}`, { method: "DELETE" });
    setSelected(null);
    setOpenFaq(null);
    await load();
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!user) { onLogin(); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    await api(`/content/${selected.id}/comments`, { method: "POST", body: JSON.stringify({ content: data.get("comment") }) });
    form.reset();
    setSelected(sanitizeItem(await api<ContentItem>(`/content/${selected.id}`)));
  }

  async function removeComment(commentId: number) {
    if (!selected || !window.confirm("댓글을 삭제하시겠습니까?")) return;
    await api(`/comments/${commentId}`, { method: "DELETE" });
    setSelected(sanitizeItem(await api<ContentItem>(`/content/${selected.id}`)));
  }

  if (writing) {
    return (
      <section className="ocean-board-page ocean-board-compose-page page-content-transition">
        <header className="ocean-compose-heading">
          <button type="button" onClick={() => window.history.back()}><ChevronLeft size={17} />목록으로</button>
          <span>{editing ? "EDIT POST" : "NEW POST"}</span>
          <h2>{editing ? `${meta.title} 수정` : `${meta.title} 글쓰기`}</h2>
          <p>{editing ? "내용을 확인하고 필요한 부분을 수정하세요." : "전달할 내용을 명확하게 작성해 주세요."}</p>
        </header>
        <form className="ocean-compose-form" onSubmit={submit} key={editing?.id ?? "new"}>
          <label><span>제목</span><input name="title" required minLength={2} defaultValue={editing?.title} placeholder="제목을 입력하세요" /></label>
          <RichTextEditor initialValue={editing?.content ?? ""} />
          <AttachmentPicker />
          {editing?.attachments?.length ? <div className="ocean-existing-files">{editing.attachments.map((file) => <a href={`${API_URL}${file.url}`} key={file.id}><Paperclip size={13} />{file.name}</a>)}</div> : null}
          <footer>
            {isAdmin && category === "notice" && <label className="ocean-compose-pin"><input type="checkbox" name="pinned" defaultChecked={editing?.pinned} /><Star size={14} /><span>중요 게시글로 지정</span></label>}
            <div><button type="button" onClick={() => window.history.back()}>취소</button><button type="submit">{editing ? "수정 완료" : "등록하기"}</button></div>
          </footer>
        </form>
      </section>
    );
  }

  return (
    <section className="ocean-board-page page-content-transition">
      <header className="ocean-board-heading">
        <div><span>{meta.kicker}</span><h2>{meta.title}</h2><p>{meta.description}</p></div>
        <div className="ocean-board-status"><span><strong>{items.length}</strong>개의 게시물</span></div>
      </header>

      <div className="ocean-board-content">
        {category === "faq" ? (
          <div className="ocean-faq-list">
            {pageItems.map((item, index) => (
              <article className={openFaq === item.id ? "open" : ""} key={item.id}>
                <button type="button" onClick={() => setOpenFaq(openFaq === item.id ? null : item.id)}>
                  <span>{String((page - 1) * 10 + index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><ChevronDown size={19} />
                </button>
                <div className="ocean-faq-answer"><div dangerouslySetInnerHTML={{ __html: item.content }} />{item.attachments?.length > 0 && <div className="ocean-faq-files">{item.attachments.map((file) => <AttachmentLink file={file} key={file.id} />)}</div>}</div>
                {isAdmin && <AdminActions onEdit={() => startEdit(item)} onDelete={() => remove(item)} />}
              </article>
            ))}
            {loading && <BoardLoading />}{!loading && !items.length && <BoardEmpty />}
          </div>
        ) : selected ? (
          <article className="ocean-board-reader">
            <button type="button" onClick={() => window.history.back()}><ChevronLeft size={17} />목록으로</button>
            <header><span>{selected.pinned ? "중요 안내" : meta.title}</span><h3>{selected.title}</h3><p>{selected.author?.name ?? "FloatWatch"} · {formatDate(selected.created_at)} · 조회 {selected.views}</p></header>
            <div className="ocean-reader-body" dangerouslySetInnerHTML={{ __html: selected.content }} />
            {selected.attachments?.length > 0 && <div className="ocean-reader-files"><strong><Paperclip size={14} />첨부파일</strong>{selected.attachments.map((file) => <AttachmentLink file={file} key={file.id} />)}</div>}
            {category === "free" && <section className="ocean-comments"><header><strong>댓글</strong><span>{selected.comments?.length ?? 0}</span></header><form onSubmit={submitComment}><input name="comment" required maxLength={2000} placeholder={user ? "댓글을 입력하세요" : "로그인 후 댓글을 작성할 수 있습니다"} /><button type="submit"><Send size={15} />등록</button></form><div>{selected.comments?.map((comment) => <article key={comment.id}><div><strong>{comment.author?.name ?? "탈퇴한 회원"}</strong><time>{formatDateTime(comment.created_at)}</time></div><p>{comment.content}</p>{(isAdmin || comment.author?.id === user?.id) && <button type="button" onClick={() => removeComment(comment.id)}><Trash2 size={13} />삭제</button>}</article>)}{!selected.comments?.length && <p className="ocean-comments-empty">첫 댓글을 남겨보세요.</p>}</div></section>}
            {isAdmin && <AdminActions showPin={category === "notice"} pinned={selected.pinned} onPin={() => togglePinned(selected)} onEdit={() => startEdit(selected)} onDelete={() => remove(selected)} />}
          </article>
        ) : (
          <div className="ocean-board-list">
            <div className="ocean-board-list-head"><span>구분</span><span>제목</span><span>작성자</span><span>작성일</span><span>조회</span></div>
            {pageItems.map((item, index) => (
              <div className="ocean-board-row" key={item.id}>
                <button type="button" onClick={() => openItem(item)}><span>{String((page - 1) * 10 + index + 1).padStart(2, "0")}</span><strong>{item.pinned && <em>중요</em>}{item.title}</strong><span>{item.author?.name ?? "FloatWatch"}</span><time>{formatDate(item.created_at)}</time><span>{item.views}</span></button>
                {isAdmin && category === "notice" && <button className={`ocean-pin-quick ${item.pinned ? "active" : ""}`} type="button" title={item.pinned ? "중요 해제" : "중요 지정"} onClick={() => togglePinned(item)}><Star size={14} /></button>}
              </div>
            ))}
            {loading && <BoardLoading />}{!loading && !items.length && <BoardEmpty />}
          </div>
        )}
      </div>

      {!selected && <footer className="ocean-board-footer">
        <nav className="ocean-board-pagination" aria-label="게시판 페이지">
          <button type="button" aria-label="이전 페이지" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button type="button" className={page === number ? "active" : ""} key={number} onClick={() => { setPage(number); setOpenFaq(null); }}>{number}</button>)}
          <button type="button" aria-label="다음 페이지" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={16} /></button>
        </nav>
        {canWrite && <div className="ocean-board-bottom-actions"><button type="button" onClick={startCreate}><PenLine size={16} />{writing && !editing ? "작성 취소" : "글쓰기"}</button></div>}
      </footer>}
    </section>
  );
}

function AdminActions({ showPin = false, pinned = false, onPin, onEdit, onDelete }: { showPin?: boolean; pinned?: boolean; onPin?: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="ocean-admin-actions">
    {showPin && <button type="button" className={pinned ? "active" : ""} onClick={onPin}><Star size={14} />{pinned ? "중요 해제" : "중요 지정"}</button>}
    <button type="button" onClick={onEdit}><Pencil size={14} />수정</button>
    <button type="button" className="danger" onClick={onDelete}><Trash2 size={14} />삭제</button>
  </div>;
}

function BoardLoading() { return <div className="ocean-board-empty"><LoaderCircle className="spin" size={22} />불러오는 중입니다.</div>; }
function BoardEmpty() { return <div className="ocean-board-empty">등록된 게시물이 없습니다.</div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))}KB` : `${(value / 1024 / 1024).toFixed(1)}MB`; }

function RichTextEditor({ initialValue }: { initialValue: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(initialValue);
  function run(command: string, argument?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    setValue(editorRef.current?.innerHTML ?? "");
  }
  return <label className="ocean-compose-content"><span>내용</span><div className="ocean-editor-shell"><div className="ocean-editor-toolbar" aria-label="본문 서식 도구">
    <button type="button" title="굵게" onMouseDown={(event) => { event.preventDefault(); run("bold"); }}><Bold size={15} /></button>
    <button type="button" title="기울임" onMouseDown={(event) => { event.preventDefault(); run("italic"); }}><Italic size={15} /></button>
    <button type="button" title="밑줄" onMouseDown={(event) => { event.preventDefault(); run("underline"); }}><Underline size={15} /></button>
    <span />
    <button type="button" title="왼쪽 정렬" onMouseDown={(event) => { event.preventDefault(); run("justifyLeft"); }}><AlignLeft size={15} /></button>
    <button type="button" title="가운데 정렬" onMouseDown={(event) => { event.preventDefault(); run("justifyCenter"); }}><AlignCenter size={15} /></button>
    <button type="button" title="오른쪽 정렬" onMouseDown={(event) => { event.preventDefault(); run("justifyRight"); }}><AlignRight size={15} /></button>
    <label title="글자색"><input type="color" defaultValue="#eaf7f5" onChange={(event) => run("foreColor", event.target.value)} /></label>
  </div><div ref={editorRef} className="ocean-rich-editor" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: initialValue }} onInput={(event) => setValue(event.currentTarget.innerHTML)} data-placeholder="내용을 입력하세요" /></div><input type="hidden" name="content" value={value} /></label>;
}

function AttachmentPicker() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className={`ocean-compose-file-wrap ${preview ? "has-preview" : ""}`}>
    {preview && <div className="ocean-compose-image-preview"><img src={preview} alt="첨부 이미지 미리보기" /></div>}
    <label className="ocean-compose-file"><Paperclip size={19} /><span><strong>{file ? file.name : "파일 첨부"}</strong><small>{file ? `${formatBytes(file.size)} · 다른 파일을 선택하려면 클릭하세요` : "파일을 선택하거나 이 영역으로 끌어오세요. 파일당 최대 20MB"}</small></span><input type="file" name="attachment" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
  </div>;
}

function AttachmentLink({ file }: { file: ContentItem["attachments"][number] }) {
  const image = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
  return <a className={image ? "ocean-attachment-image" : ""} href={`${API_URL}${file.url}`} target="_blank" rel="noreferrer">
    {image && <img src={`${API_URL}${file.url}`} alt={`${file.name} 미리보기`} loading="lazy" />}
    <span>{file.name}<small>{formatBytes(file.size_bytes)}</small></span><Download size={15} />
  </a>;
}

function sanitizeItem(item: ContentItem): ContentItem { return { ...item, content: sanitizeRichHtml(item.content) }; }
function sanitizeRichHtml(value: string) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(value, "text/html");
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "P", "DIV", "BR", "SPAN"]);
  for (const element of Array.from(documentNode.body.querySelectorAll("*"))) {
    if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); continue; }
    for (const attribute of Array.from(element.attributes)) if (attribute.name !== "style") element.removeAttribute(attribute.name);
    const style = element.getAttribute("style") ?? "";
    const safe = style.split(";").map((part) => part.trim()).filter((part) => /^(color:\s*#[0-9a-f]{3,8}|text-align:\s*(left|center|right))$/i.test(part));
    if (safe.length) element.setAttribute("style", safe.join(";")); else element.removeAttribute("style");
  }
  return documentNode.body.innerHTML;
}
