"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileUp, LoaderCircle, Upload, X } from "lucide-react";
import { api } from "@/lib/api";

type Props = { type: "model" | "video"; onClose: () => void; onUploaded: () => void };

export function UploadDialog({ type, onClose, onUploaded }: Props) {
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const isModel = type === "model";

  useEffect(() => {
    setMounted(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("file", file);
    try {
      const name = new FormData(event.currentTarget).get("name");
      const suffix = isModel ? `?name=${encodeURIComponent(String(name))}` : "";
      await api(`/${isModel ? "models" : "videos"}${suffix}`, { method: "POST", body: data });
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <div className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="section-kicker">새 자산 등록</p><h2>{isModel ? "YOLO 모델 업로드" : "이미지·동영상 업로드"}</h2></div><button className="icon-button" title="닫기" onClick={onClose}><X size={20} /></button></header>
      <form onSubmit={submit} className="form-stack">
        {isModel && <label>모델 이름<input name="name" required placeholder="예: YOLO11 해양쓰레기 v1" /></label>}
        <button type="button" className={`drop-zone ${file ? "selected" : ""}`} onClick={() => input.current?.click()}>
          {file ? <><FileUp size={28} /><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></> : <><Upload size={28} /><strong>파일을 선택하세요</strong><span>{isModel ? ".pt · 최대 500MB" : "JPG, PNG, WEBP 또는 MP4, AVI, MOV · 최대 2GB"}</span></>}
        </button>
        <input ref={input} hidden type="file" accept={isModel ? ".pt" : "image/*,video/*"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {isModel && <p className="notice">신뢰할 수 있는 모델 파일만 사용하세요. PT 파일은 실행 가능한 Python 객체를 포함할 수 있습니다.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" disabled={!file || busy}>{busy && <LoaderCircle className="spin" size={17} />}업로드</button></div>
      </form>
    </div>
  </div>, document.body);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
