"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Box, Check, ChevronLeft, ChevronRight, Cpu, FileVideo, Image as ImageIcon, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ModelArtifact, VideoAsset } from "@/lib/types";

type AssetType = "model" | "video";
type ModelKey = NonNullable<ModelArtifact["model_key"]>;
const MODEL_TABS: Array<{ key: ModelKey; label: string }> = [
  { key: "yolov8s", label: "YOLOv8s" }, { key: "yolov11s", label: "YOLO11s" },
  { key: "yolov26s", label: "YOLO26s" }, { key: "rt-detr", label: "RT-DETR" },
];
type Props = { initialType: AssetType; models: ModelArtifact[]; videos: VideoAsset[]; modelOnly?: boolean; onClose: () => void; onUpload: (type: AssetType) => void; onChanged: () => Promise<void>; onDeleted: (type: AssetType, id: number) => void };

export function AssetManagerDialog({ initialType, models, videos, modelOnly = false, onClose, onUpload, onChanged, onDeleted }: Props) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<AssetType>(initialType);
  const [quarantined, setQuarantined] = useState<ModelArtifact[]>([]);
  const [modelLibrary, setModelLibrary] = useState<ModelArtifact[]>(models);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [modelPage, setModelPage] = useState(1);
  const [videoPage, setVideoPage] = useState(1);
  const [modelKeyTab, setModelKeyTab] = useState<ModelKey>("yolov8s");

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (tab === "model") Promise.all([api<ModelArtifact[]>("/models/library"), api<ModelArtifact[]>("/models/quarantined")]).then(([library, restricted]) => { setModelLibrary(library); setQuarantined(restricted); }).catch(() => setQuarantined([])); }, [tab, models]);
  const modelItems = useMemo(() => [...modelLibrary.map((item) => ({ ...item, quarantined: false })), ...quarantined.map((item) => ({ ...item, quarantined: true }))], [modelLibrary, quarantined]);
  const managedModelCount = useMemo(() => modelItems.filter((item) => MODEL_TABS.some((modelTab) => modelTab.key === item.model_key)).length, [modelItems]);
  const filteredModelItems = useMemo(() => modelItems.filter((item) => item.model_key === modelKeyTab), [modelItems, modelKeyTab]);
  const modelPageCount = Math.max(1, Math.ceil(filteredModelItems.length / 5));
  const visibleModelItems = filteredModelItems.slice((modelPage - 1) * 5, modelPage * 5);
  const videoPageCount = Math.max(1, Math.ceil(videos.length / 5));
  const visibleVideoItems = videos.slice((videoPage - 1) * 5, videoPage * 5);

  useEffect(() => {
    setModelPage((page) => Math.min(page, modelPageCount));
  }, [modelPageCount]);
  useEffect(() => { setModelPage(1); }, [modelKeyTab]);
  useEffect(() => { setVideoPage((page) => Math.min(page, videoPageCount)); }, [videoPageCount]);

  async function remove(type: AssetType, id: number, name: string) {
    if (!window.confirm(`'${name}' 자산을 삭제하시겠습니까?`)) return;
    setDeleting(`${type}-${id}`); setMessage("");
    try {
      await api(`/${type === "model" ? "models" : "videos"}/${id}`, { method: "DELETE" });
      onDeleted(type, id);
      if (type === "model") setQuarantined((items) => items.filter((item) => item.id !== id));
      await onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "자산을 삭제하지 못했습니다."); }
    finally { setDeleting(null); }
  }

  async function selectRepresentative(item: ModelArtifact) {
    setSelecting(item.id); setMessage("");
    try {
      await api(`/models/${item.id}/representative`, { method: "PATCH" });
      setModelLibrary((items) => items.map((model) => ({ ...model, is_representative: model.model_key === item.model_key ? model.id === item.id : model.is_representative })));
      await onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "대표 모델을 지정하지 못했습니다."); }
    finally { setSelecting(null); }
  }

  if (!mounted) return null;
  const empty = tab === "model" ? modelItems.length === 0 : videos.length === 0;
  return createPortal(<div className="modal-backdrop asset-manager-backdrop" role="presentation" onMouseDown={onClose}>
    <section className={`asset-manager-modal ${modelOnly ? "asset-manager-model-only" : ""} ${tab === "model" ? "asset-manager-model-view" : ""}`} role="dialog" aria-modal="true" aria-labelledby="asset-manager-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="asset-manager-header"><div><p className="section-kicker">{modelOnly ? "AI MODEL LIBRARY" : "ANALYSIS ASSETS"}</p><h2 id="asset-manager-title">{modelOnly ? "AI 모델 관리" : "분석 자산 관리"}</h2><span>{modelOnly ? "실시간 탐색에 사용할 AI 모델을 확인하고 관리합니다." : "분석에 사용할 모델과 미디어를 한곳에서 확인합니다."}</span></div><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20}/></button></header>
      {!modelOnly && <nav className="asset-manager-tabs" aria-label="자산 종류">
        <button type="button" className={tab === "model" ? "active" : ""} onClick={() => { setTab("model"); setMessage(""); }}><Cpu size={17}/><span><strong>AI 모델</strong><small>{managedModelCount}개</small></span></button>
        <button type="button" className={tab === "video" ? "active" : ""} onClick={() => { setTab("video"); setMessage(""); }}><FileVideo size={17}/><span><strong>분석 미디어</strong><small>{videos.length}개</small></span></button>
        <button type="button" className="asset-manager-upload" onClick={() => onUpload(tab)}><Plus size={16}/>새 {tab === "model" ? "모델" : "미디어"}</button>
      </nav>}
      <div className="asset-manager-summary"><div><Box size={17}/><span><strong>{tab === "model" ? `${MODEL_TABS.find((item)=>item.key===modelKeyTab)?.label} 모델` : "업로드한 이미지·동영상"}</strong><small>{tab === "model" ? "등록된 PT 중 분석에 사용할 대표 모델을 선택합니다." : "파일 형식과 크기, 영상 정보를 확인할 수 있습니다."}</small></span></div>{modelOnly ? <button type="button" className="asset-manager-model-add" onClick={() => onUpload("model")}><Plus size={15}/>새 모델 등록</button> : <em>{tab === "model" ? `${filteredModelItems.length}개 등록` : "최신 등록순"}</em>}</div>
      {tab === "model" && <nav className="asset-manager-model-tabs" aria-label="모델 계열"><div>{MODEL_TABS.map((modelTab) => { const count=modelItems.filter((item)=>item.model_key===modelTab.key).length; const representative=modelItems.some((item)=>item.model_key===modelTab.key&&item.is_representative&&!item.quarantined); return <button type="button" key={modelTab.key} className={modelKeyTab===modelTab.key?"active":""} onClick={()=>setModelKeyTab(modelTab.key)}><span>{modelTab.label}</span><small>{count}개</small>{representative&&<Check size={13}/>}</button>;})}</div><span>계열별 대표 PT를 지정할 수 있습니다.</span></nav>}
      <div className={`asset-manager-list ${tab === "model" && !filteredModelItems.length ? "is-empty" : ""}`}>
        {tab === "model" ? visibleModelItems.map((item) => <article className={`asset-manager-row ${item.quarantined ? "is-quarantined" : ""}`} key={`model-${item.id}`}>
          <span className="asset-manager-icon"><Cpu size={19}/></span><div className="asset-manager-name"><strong>{item.name}</strong><small>{item.original_name}</small></div><AssetMeta label="모델 슬롯" value={item.model_key?.toUpperCase() ?? "미지정"}/><AssetMeta label="파일 크기" value={formatBytes(item.size_bytes)}/><AssetMeta label="등록일" value={formatDate(item.created_at)} extraClass="asset-manager-date"/><button type="button" className={`asset-manager-status ${item.is_representative ? "ready" : ""}`} disabled={Boolean(item.quarantined) || selecting === item.id} onClick={() => void selectRepresentative(item)}>{selecting === item.id ? <LoaderCircle className="spin" size={13}/> : item.is_representative ? <><Check size={13}/>대표 PT</> : "대표로 지정"}</button><DeleteButton busy={deleting === `model-${item.id}`} label={`${item.name} 삭제`} onClick={() => void remove("model", item.id, item.name)}/>{item.quarantined && <p className="asset-manager-reason"><AlertTriangle size={13}/>{item.quarantine_reason || "모델을 불러오는 과정에서 오류가 확인되었습니다. 삭제 후 다시 업로드해 주세요."}</p>}
        </article>) : visibleVideoItems.map((item) => <article className="asset-manager-row" key={`video-${item.id}`}>
          <span className="asset-manager-icon">{item.media_type === "image" ? <ImageIcon size={19}/> : <FileVideo size={19}/>}</span><div className="asset-manager-name"><strong>{item.name}</strong><small>{item.media_type === "image" ? "IMAGE" : "VIDEO"}</small></div><AssetMeta label="파일 크기" value={formatBytes(item.size_bytes)}/><AssetMeta label={item.media_type === "image" ? "미디어" : "재생 시간"} value={item.media_type === "image" ? "단일 이미지" : formatDuration(item.duration_seconds)}/><AssetMeta label="촬영 위치" value={formatLocation(item)} extraClass="asset-manager-date"/><span className={`asset-manager-status ${item.location_confirmed ? "ready" : "error"}`}>{item.location_confirmed ? "위치 확인" : "위치 미등록"}</span><DeleteButton busy={deleting === `video-${item.id}`} label={`${item.name} 삭제`} onClick={() => void remove("video", item.id, item.name)}/>
        </article>)}
        {tab === "model" && filteredModelItems.length > 5 && <nav className="asset-manager-pagination" aria-label="모델 목록 페이지"><button type="button" aria-label="이전 페이지" disabled={modelPage === 1} onClick={() => setModelPage((page) => page - 1)}><ChevronLeft size={14}/></button>{Array.from({ length: modelPageCount }, (_, index) => index + 1).map((page) => <button type="button" key={page} className={page === modelPage ? "active" : ""} aria-current={page === modelPage ? "page" : undefined} onClick={() => setModelPage(page)}>{page}</button>)}<button type="button" aria-label="다음 페이지" disabled={modelPage === modelPageCount} onClick={() => setModelPage((page) => page + 1)}><ChevronRight size={14}/></button></nav>}
        {tab === "video" && videos.length > 5 && <nav className="asset-manager-pagination" aria-label="분석 미디어 목록 페이지"><button type="button" aria-label="이전 페이지" disabled={videoPage === 1} onClick={() => setVideoPage((page) => page - 1)}><ChevronLeft size={14}/></button>{Array.from({ length: videoPageCount }, (_, index) => index + 1).map((page) => <button type="button" key={page} className={page === videoPage ? "active" : ""} aria-current={page === videoPage ? "page" : undefined} onClick={() => setVideoPage(page)}>{page}</button>)}<button type="button" aria-label="다음 페이지" disabled={videoPage === videoPageCount} onClick={() => setVideoPage((page) => page + 1)}><ChevronRight size={14}/></button></nav>}
        {tab === "model" && !filteredModelItems.length ? <div className="asset-manager-empty"><Box size={28}/><strong>{MODEL_TABS.find((item)=>item.key===modelKeyTab)?.label} 모델이 없습니다.</strong><p>이 모델 계열의 PT를 등록하면 목록에 표시됩니다.</p><button type="button" onClick={() => onUpload("model")}><Plus size={15}/>PT 등록</button></div> : tab === "video" && empty && <div className="asset-manager-empty"><Box size={28}/><strong>등록된 미디어가 없습니다.</strong><p>새 자산을 등록하면 분석 대상 선택 목록에 바로 반영됩니다.</p><button type="button" onClick={() => onUpload("video")}><Plus size={15}/>첫 자산 등록</button></div>}
      </div>
      {message && <p className="asset-manager-message"><AlertTriangle size={15}/>{message}</p>}
      <footer><span>분석 기록에서 사용 중인 자산은 기록 보존을 위해 삭제할 수 없습니다.</span><button type="button" onClick={onClose}>확인</button></footer>
    </section>
  </div>, document.body);
}

function AssetMeta({ label, value, extraClass = "" }: { label: string; value: string; extraClass?: string }) { return <div className={`asset-manager-meta ${extraClass}`}><small>{label}</small><strong>{value}</strong></div>; }
function DeleteButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) { return <button type="button" className="asset-manager-delete" aria-label={label} disabled={busy} onClick={onClick}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={16}/>}</button>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)); }
function formatDuration(seconds: number | null) { if (!seconds) return "—"; return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`; }
function formatLocation(item: VideoAsset) { if (!item.location_confirmed || item.latitude == null || item.longitude == null) return "미등록"; return item.location_name || `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`; }
