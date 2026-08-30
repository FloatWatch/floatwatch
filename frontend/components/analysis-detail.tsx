"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Ban, BarChart3, CalendarDays, ChevronDown, Cpu, Download, FileText, FileVideo, Gauge, LoaderCircle, MapPinned, Plus, RefreshCw, RotateCcw, Search, ScanLine, ScanSearch, WifiOff, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_URL, api } from "@/lib/api";
import type { Analysis } from "@/lib/types";
import { ZoomableImage } from "./zoomable-image";
import { LocationMap } from "./location-map";
import { effectiveAnalysisStatus } from "@/lib/analysis-status";

export function AnalysisDetail({ id, relatedAnalyses = [], onUpdated, onOpenDetails, onAnalysisCreated, onPrepareNew, showReportSummary = true, adminMode = false }: { id: number; relatedAnalyses?: Analysis[]; onUpdated: () => void; onOpenDetails?: (id: number) => void; onAnalysisCreated?: (id: number) => void; onPrepareNew?: () => void; showReportSummary?: boolean; adminMode?: boolean }) {
  const [item, setItem] = useState<Analysis | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<"retry" | "cancel" | null>(null);
  const [actionError, setActionError] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [locationMapOpen, setLocationMapOpen] = useState(false);
  const [resultModelKey, setResultModelKey] = useState("yolov8s");
  const [batchDetails, setBatchDetails] = useState<Analysis[]>([]);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const relatedAnalysisIds = relatedAnalyses.map((analysis) => analysis.id).sort((a, b) => a - b).join(",");
  useEffect(() => {
    const preferred = relatedAnalyses.find((analysis) => analysis.model.model_key === "yolov8s") ?? relatedAnalyses[0];
    setResultModelKey(preferred?.model.model_key ?? "yolov8s");
  }, [id, relatedAnalysisIds]);
  useEffect(() => {
    let active = true;
    setBatchDetails([]);
    if (!relatedAnalyses.length) return () => { active = false; };
    void Promise.all(relatedAnalyses.map((analysis) => api<Analysis>(`/${adminMode ? "admin/" : ""}analyses/${analysis.id}`)))
      .then((details) => { if (active) setBatchDetails(details); })
      .catch(() => { if (active) setBatchDetails([]); });
    return () => { active = false; };
  }, [id, relatedAnalysisIds, adminMode]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let consecutiveFailures = 0;
    const reconnectDelays = [2000, 3000, 5000];
    setItem(null);
    setLoadError("");
    setReconnectAttempt(0);
    async function load() {
      controller = new AbortController();
      try {
        const value = await api<Analysis>(`/${adminMode ? "admin/" : ""}analyses/${id}`, { signal: controller.signal });
        if (!live) return;
        consecutiveFailures = 0;
        setReconnectAttempt(0);
        setLoadError("");
        setItem(value);
        if (value.status === "processing" || value.status === "queued") {
          timer = setTimeout(load, 2000);
        } else onUpdated();
      } catch (error) {
        if (!live || (error instanceof DOMException && error.name === "AbortError")) return;
        if (consecutiveFailures < reconnectDelays.length) {
          const delay = reconnectDelays[consecutiveFailures];
          consecutiveFailures += 1;
          setReconnectAttempt(consecutiveFailures);
          timer = setTimeout(load, delay);
          return;
        }
        setReconnectAttempt(0);
        setLoadError(error instanceof Error ? error.message : "분석 서버에 연결하지 못했습니다.");
      }
    }
    void load();
    return () => {
      live = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, reconnectNonce, adminMode]);

  async function retryAnalysis() {
    setActionBusy("retry"); setActionError("");
    try {
      const next = await api<Analysis>(`/analyses/${id}/retry`, { method: "POST" });
      onUpdated();
      if (onAnalysisCreated) onAnalysisCreated(next.id);
      else window.location.assign(`/auth?workspace=records&analysis=${next.id}`);
    } catch (error) { setActionError(error instanceof Error ? error.message : "분석을 다시 시작하지 못했습니다."); }
    finally { setActionBusy(null); }
  }

  async function cancelAnalysis() {
    setActionBusy("cancel"); setActionError("");
    try {
      const value = await api<Analysis>(`/analyses/${id}/cancel`, { method: "POST" });
      setCancelConfirmOpen(false); setItem(value); onUpdated();
    } catch (error) { setActionError(error instanceof Error ? error.message : "분석을 중단하지 못했습니다."); }
    finally { setActionBusy(null); }
  }

  if (loadError) return <section className="analysis-connection-error"><div className="analysis-connection-mark"><WifiOff size={28}/></div><p className="section-kicker">CONNECTION PAUSED</p><h3>분석 서버와 연결하지 못했습니다</h3><p>분석 작업은 백그라운드에서 계속될 수 있습니다.<br/>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><small>{loadError}</small><button type="button" onClick={() => setReconnectNonce((value) => value + 1)}><RefreshCw size={16}/>다시 연결</button></section>;
  if (!item) return <div className={`detail-loading ${reconnectAttempt ? "is-reconnecting" : ""}`}><LoaderCircle className="spin" /><strong>{reconnectAttempt ? "분석 서버에 다시 연결하고 있습니다" : "분석 정보를 불러오는 중"}</strong>{reconnectAttempt > 0 && <span>분석은 중단되지 않으며 자동으로 연결을 다시 확인합니다.</span>}</div>;
  const effectiveStatus = effectiveAnalysisStatus(item.status, item.error_code);
  if (effectiveStatus === "failed" || effectiveStatus === "cancelled") {
    const cancelled = effectiveStatus === "cancelled";
    const presentation = failurePresentation(cancelled ? "USER_CANCELLED" : item.error_code);
    return <section className={`analysis-failure-state ${cancelled ? "is-cancelled" : ""}`}>
      <div className="analysis-failure-mark">{cancelled ? <Ban size={30}/> : <AlertCircle size={30}/>}</div>
      <p className="section-kicker">{cancelled ? "ANALYSIS CANCELLED" : "ANALYSIS FAILED"}</p>
      <span className="analysis-failure-type">{presentation.label}</span>
      <h2>{cancelled ? "분석이 중단되었습니다" : "분석을 완료하지 못했습니다"}</h2>
      <p className="analysis-failure-copy">{presentation.message}</p>
      <div className="analysis-failure-context"><span><small>적용 모델</small><strong>{item.model.name}</strong></span><i/><span><small>분석 미디어</small><strong>{item.video.name}</strong></span><i/><span><small>분석 설정</small><strong>신뢰도 {Math.round(item.confidence * 100)}% · {item.frame_stride} frame</strong></span></div>
      <div className="analysis-failure-guide"><strong>{cancelled ? "동일한 조건으로 다시 시작할 수 있습니다." : "해결 방법"}</strong><p>{cancelled ? "기존 기록은 남겨두고 새로운 분석 작업으로 안전하게 다시 시작합니다." : presentation.guide}</p></div>
      {actionError && <p className="analysis-action-error"><AlertCircle size={14}/>{actionError}</p>}
      {!adminMode && <div className="analysis-failure-actions"><button className="analysis-retry-button" type="button" disabled={actionBusy !== null} onClick={() => void retryAnalysis()}>{actionBusy === "retry" ? <LoaderCircle className="spin" size={17}/> : <RotateCcw size={17}/>}동일 조건으로 다시 분석</button>{onPrepareNew && <button className="analysis-new-button" type="button" disabled={actionBusy !== null} onClick={onPrepareNew}><Plus size={17}/>새 탐색 준비</button>}</div>}
    </section>;
  }
  if (effectiveStatus !== "completed") {
    const queued = effectiveStatus === "queued";
    const visibleProgress = queued ? 0 : Math.min(99, Math.max(1, item.progress));
    const inputConfirmed = visibleProgress >= 20;
    const resultStage = visibleProgress >= 90;
    const unknownFrameCount = item.video.media_type === "video" && !item.video.frame_count;
    return <><section className="processing-state"><div className="processing-content"><div className="processing-icon"><ScanSearch size={30} /></div><p className="section-kicker">{queued ? "ANALYSIS QUEUE" : resultStage ? "RESULT RENDERING" : visibleProgress < 20 ? "ANALYSIS SETUP" : "CPU INFERENCE"}</p><h2>{queued ? "앞선 분석이 끝나기를 기다리고 있습니다" : resultStage ? "분석 결과를 생성하고 있습니다" : visibleProgress < 20 ? "AI 모델과 미디어를 준비하고 있습니다" : `${item.video.media_type === "image" ? "이미지를" : "동영상을"} 분석하고 있습니다`}</h2><p className="processing-source"><span>{item.model.name}</span><i /> <span>{item.video.name}</span></p><div className="processing-steps" aria-label="분석 진행 단계"><span className={queued || !inputConfirmed ? "active" : "complete"}><b>1</b>{queued ? "분석 대기" : "작업 준비"}</span><span className={queued || !inputConfirmed ? "" : resultStage ? "complete" : "active"}><b>2</b>모델 추론</span><span className={!queued && resultStage ? "complete active" : ""}><b>3</b>결과 생성</span></div><div className={`processing-progress ${unknownFrameCount ? "is-frame-count" : ""}`}><div className="progress-track"><span style={{ width: unknownFrameCount ? "100%" : `${visibleProgress}%` }} /></div><strong>{unknownFrameCount ? <>{item.processed_frames.toLocaleString()}<em>frame</em></> : <>{visibleProgress.toFixed(0)}<em>%</em></>}</strong></div><small>{queued ? "현재 실행 중인 분석이 완료되면 자동으로 시작됩니다." : unknownFrameCount ? "전체 길이를 확인할 수 없어 처리한 프레임 수를 표시합니다." : "분석은 백그라운드에서 계속됩니다. 창을 닫아도 기록에서 결과를 확인할 수 있습니다."}</small>{reconnectAttempt > 0 && <div className="analysis-reconnect-notice" role="status"><LoaderCircle className="spin" size={14}/><span><strong>서버 연결을 다시 확인하고 있습니다</strong><small>분석은 백그라운드에서 계속될 수 있습니다.</small></span></div>}{!adminMode && <button className="analysis-cancel-button" type="button" disabled={actionBusy !== null} onClick={() => setCancelConfirmOpen(true)}><Ban size={14}/>분석 중단</button>}{actionError && <p className="analysis-action-error"><AlertCircle size={14}/>{actionError}</p>}</div></section>{!adminMode && cancelConfirmOpen && <CancelAnalysisDialog item={item} busy={actionBusy === "cancel"} error={actionError} onClose={() => { if (!actionBusy) { setCancelConfirmOpen(false); setActionError(""); } }} onConfirm={() => void cancelAnalysis()}/>}</>;
  }

  const batchSource = batchDetails.length ? batchDetails : relatedAnalyses.length ? relatedAnalyses : [item];
  const batchResults = batchSource.map((analysis) => analysis.id === item.id ? item : analysis);
  const selectedBatchResult = batchResults.find((analysis) => analysis.model.model_key === resultModelKey) ?? null;
  const visibleResult = selectedBatchResult ?? item;
  const timeline = (visibleResult.frame_metrics ?? []).map((metric) => ({ ...metric, time: formatTime(metric.timestamp_seconds), confidence: Math.round(metric.avg_confidence * 100) }));
  const classStats = visibleResult.class_stats ?? [];
  const elapsedSeconds = item.completed_at ? Math.max(0, (new Date(item.completed_at).getTime() - new Date(item.created_at).getTime()) / 1000) : null;
  const modelResultTabs = <section className="records-model-result-tabs" aria-label="모델별 바운드 박스 결과"><header><div><p className="section-kicker">MODEL RESULTS</p><h3>모델별 바운드 박스 결과</h3></div><span className={`status ${selectedBatchResult?.status === "completed" ? "success" : ""}`}>{selectedBatchResult ? selectedBatchResult.status === "completed" ? "분석 완료" : "결과 준비 중" : "미등록"}</span></header><div>{(["yolov8s", "yolov11s", "yolov26s", "rt-detr"] as const).map((key) => { const result = batchResults.find((analysis) => analysis.model.model_key === key); const name = { yolov8s: "YOLOv8s", yolov11s: "YOLO11s", yolov26s: "YOLO26s", "rt-detr": "RT-DETR" }[key]; return <button type="button" key={key} className={`${resultModelKey === key ? "active" : ""} ${result ? "registered" : "unregistered"}`} onClick={() => setResultModelKey(key)}><Cpu size={16}/><span><strong>{name}</strong><small>{result ? result.status === "completed" ? "분석 완료" : result.status === "failed" ? "분석 실패" : `분석 ${Math.round(result.progress)}%` : "대표 PT 미등록"}</small></span></button>; })}</div></section>;
  const seekToTimelineMoment = (timestampSeconds: number) => {
    const video = resultVideoRef.current;
    if (!video) return;
    const seek = () => {
      const target = Number.isFinite(video.duration) ? Math.min(timestampSeconds, video.duration) : timestampSeconds;
      video.currentTime = Math.max(0, target);
      void video.play().catch(() => undefined);
    };
    video.scrollIntoView({ behavior: "smooth", block: "center" });
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
  };
  const downloadPdf = async () => {
    if (!reportRef.current || pdfBusy) return;
    setPdfBusy(true);
    setDownloadOpen(false);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(reportRef.current, {
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        backgroundColor: "#073b3f",
        logging: false,
        ignoreElements: (element) => element.hasAttribute("data-pdf-exclude"),
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      const image = canvas.toDataURL("image/jpeg", 0.9);
      for (let offset = 0, page = 0; offset < imageHeight; offset += pageHeight, page += 1) {
        if (page > 0) pdf.addPage();
        pdf.setFillColor(7, 59, 63);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");
        pdf.addImage(image, "JPEG", 0, -offset, pageWidth, imageHeight, undefined, "FAST");
      }
      const safeName = item.video.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-");
      pdf.save(`${safeName || `analysis-${item.id}`}-analysis-report.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };
  return <div ref={reportRef} className={`analysis-detail analysis-detail--${item.video.media_type}`}>
    <div className="detail-heading"><div><p className="section-kicker">ANALYSIS #{item.id}</p><h2>{item.video.name}</h2></div><div className="detail-heading-actions" data-pdf-exclude="true">{onOpenDetails && <button className="secondary-button" type="button" onClick={() => onOpenDetails(item.id)}><Search size={17} />자세히 보기</button>}<div className="result-download-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDownloadOpen(false); }}><button className="secondary-button" type="button" aria-haspopup="menu" aria-expanded={downloadOpen} onClick={() => setDownloadOpen((open) => !open)}><Download size={17} />결과 다운로드<ChevronDown size={14}/></button>{downloadOpen && <div role="menu"><a role="menuitem" href={`${API_URL}${item.output_url}?download=true`} onClick={() => setDownloadOpen(false)}><FileVideo size={16}/><span><strong>미디어 다운로드</strong><small>탐지 결과 원본 파일</small></span></a><button role="menuitem" type="button" disabled={pdfBusy} onClick={() => void downloadPdf()}><FileText size={16}/><span><strong>PDF 다운로드</strong><small>현재 분석 결과 리포트</small></span></button></div>}</div></div></div>
    {showReportSummary && <><section className="report-context" aria-label="분석 조건 정보">
      <div><span><CalendarDays size={16}/></span><small>분석 완료</small><strong>{formatDateTime(item.completed_at ?? item.created_at)}</strong></div>
      <div><span><Cpu size={16}/></span><small>적용 모델</small><strong>{item.model.name}</strong><em>{item.model.task ?? "Object Detection"}</em></div>
      <div><span><FileVideo size={16}/></span><small>원본 미디어</small><strong>{item.video.media_type === "image" ? "이미지" : "동영상"} · {formatBytes(item.video.size_bytes)}</strong><em>처리 {item.processed_frames.toLocaleString()} frame · {item.video.duration_seconds ? formatDuration(item.video.duration_seconds) : "단일 이미지"}</em></div>
      <div><span><Gauge size={16}/></span><small>분석 설정</small><strong>최소 신뢰도 {Math.round(item.confidence * 100)}% · {item.frame_stride} frame 간격</strong><em>{item.processing_fps?.toFixed(1) ?? "—"} FPS · 총 소요 {elapsedSeconds == null ? "—" : formatDuration(elapsedSeconds)}</em></div>
    </section>{item.video.location_confirmed && item.video.latitude != null && item.video.longitude != null && <section className="report-location"><MapPinned size={18}/><div><small>촬영 위치</small><strong>{item.video.location_name || "사용자가 확인한 관측 위치"}</strong>{item.video.location_description && <p>{item.video.location_description}</p>}<span>{item.video.latitude.toFixed(6)}, {item.video.longitude.toFixed(6)} · {item.video.location_source === "metadata" ? "메타데이터 자동 추출" : "지도에서 직접 선택"}</span></div><button type="button" onClick={() => setLocationMapOpen(true)}>지도에서 보기</button></section>}{locationMapOpen && item.video.latitude != null && item.video.longitude != null && <LocationPreviewDialog latitude={item.video.latitude} longitude={item.video.longitude} address={item.video.location_name} description={item.video.location_description} onClose={() => setLocationMapOpen(false)}/>}</>}
    <div className={`result-layout ${showReportSummary ? "report-result-layout" : ""}`}>
      <div className="records-result-left records-result-stack"><section className="panel video-panel records-model-result-panel">{modelResultTabs}<div className="analysis-result-media-frame">{selectedBatchResult?.output_url ? selectedBatchResult.video.media_type === "image" ? <ZoomableImage className="analysis-result-zoom" src={`${API_URL}${selectedBatchResult.output_url}`} alt={`${selectedBatchResult.model.name} 부유물 탐지 결과`} imageStyle={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", objectPosition: "center", display: "block" }} /> : <video ref={resultVideoRef} controls preload="metadata" src={`${API_URL}${selectedBatchResult.output_url}`} /> : <div className="records-model-result-empty"><ScanLine size={28}/><strong>{selectedBatchResult ? "결과를 준비하고 있습니다" : "대표 PT 미등록"}</strong><span>{selectedBatchResult ? `현재 진행률 ${Math.round(selectedBatchResult.progress)}%` : "이번 비교 분석에서 실행되지 않은 모델입니다."}</span></div>}</div></section><ModelClassComparison items={batchResults}/><ModelBatchComparison items={batchResults}/></div>
      {!showReportSummary && <section className="panel class-panel"><div className="panel-heading"><div><p className="section-kicker">CONFIDENCE BY CLASS</p><h3>클래스별 신뢰도</h3><small>모델이 각 탐지 결과를 얼마나 확신했는지 보여줍니다.</small></div><strong>{classStats.length}<em>종</em></strong></div><div className="class-list">{classStats.length ? classStats.map((stat, index) => { const confidence = Math.round(stat.avg_confidence * 100); return <div className="class-row" key={stat.class_id}><span className="class-rank">{String(index + 1).padStart(2, "0")}</span><div className="class-row-main"><div><strong>{stat.class_name}</strong><small>탐지 {stat.count.toLocaleString()}건</small></div><div className="class-row-values"><b>{confidence}</b><span>%</span></div><div className="class-share-track" aria-label={`평균 신뢰도 ${confidence}%`}><i style={{ width: `${confidence}%` }} /></div></div></div>; }) : <div className="class-empty">탐지된 클래스가 없습니다.</div>}</div></section>}
    </div>
    {item.video.media_type === "video" && timeline.length > 1 && <section className="panel chart-panel timeline-panel"><div className="panel-heading"><div><p className="section-kicker">TIMELINE</p><h3>영상 내 탐지 집중 구간</h3><small>그래프의 구간을 클릭하면 해당 시점으로 이동해 영상을 바로 재생합니다.</small></div></div><ResponsiveContainer width="100%" height={140}><AreaChart data={timeline} onClick={(chartState) => { const point = chartState?.activePayload?.[0]?.payload as (typeof timeline)[number] | undefined; if (point) seekToTimelineMoment(point.timestamp_seconds); }} style={{ cursor: "pointer" }}><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#69d0c6" stopOpacity={0.38}/><stop offset="1" stopColor="#69d0c6" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce4e4"/><XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={35}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }}/><Tooltip cursor={{ stroke: "rgba(105, 208, 198, .42)", strokeWidth: 1 }} content={<TimelineTooltip/>}/><Area type="monotone" dataKey="detection_count" name="탐지 건수" stroke="#69d0c6" fill="url(#areaFill)" strokeWidth={2} activeDot={{ r: 6, fill: "#e56b3f", stroke: "#fff", strokeWidth: 2 }}/></AreaChart></ResponsiveContainer></section>}
  </div>;
}

function ModelBatchComparison({ items }: { items: Analysis[] }) {
  const slots = ["yolov8s", "yolov11s", "yolov26s", "rt-detr"] as const;
  return <section className="records-model-comparison explorer-bottom-comparison inline-comparison-graph" aria-label="네 모델 분석 결과 비교"><div className="explorer-section-heading"><div><span>MODEL COMPARISON</span><h3>네 모델 결과 비교</h3></div><BarChart3 size={18}/></div>{(["total", "confidence", "fps"] as const).map((metric) => { const label = { total: "총 탐지 수", confidence: "평균 신뢰도", fps: "처리 속도" }[metric], values = items.map((result) => metric === "total" ? result.total_detections : metric === "confidence" ? (result.avg_confidence ?? 0) * 100 : result.processing_fps ?? 0), max = metric === "confidence" ? 100 : Math.max(1, ...values); return <div className="inline-metric" key={metric}><strong>{label}</strong>{slots.map((key) => { const result = items.find((analysis) => analysis.model.model_key === key), value = result ? metric === "total" ? result.total_detections : metric === "confidence" ? (result.avg_confidence ?? 0) * 100 : result.processing_fps ?? 0 : 0; return <div className={`metric-model-${key}`} key={key}><span>{key}</span><i><b style={{ width: `${value / max * 100}%` }}/></i><em>{result ? `${value.toFixed(metric === "total" ? 0 : 1)}${metric === "total" ? "건" : metric === "confidence" ? "%" : " FPS"}` : "—"}</em></div>; })}</div>; })}</section>;
}

function ModelClassComparison({ items }: { items: Analysis[] }) {
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const slots = [{ key: "yolov8s", name: "YOLOv8s" }, { key: "yolov11s", name: "YOLO11s" }, { key: "yolov26s", name: "YOLO26s" }, { key: "rt-detr", name: "RT-DETR" }] as const;
  const classNames = [...new Set(items.flatMap((analysis) => (analysis.class_stats ?? []).map((stat) => stat.class_name)))];
  const rows = classNames.map((className) => ({ className, total: items.reduce((sum, analysis) => sum + ((analysis.class_stats ?? []).find((stat) => stat.class_name === className)?.count ?? 0), 0) })).sort((a, b) => b.total - a.total);
  const visibleRows = expanded ? rows : rows.slice(0, 2);
  const maxCount = Math.max(1, ...items.flatMap((analysis) => (analysis.class_stats ?? []).map((stat) => stat.count)));
  const toggleExpanded = () => {
    if (!expanded) { setExpanded(true); return; }
    setExpanded(false);
    window.requestAnimationFrame(() => toggleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  return <section className="panel model-class-comparison" aria-label="모델별 클래스 탐지 비교"><div className="panel-heading"><div><p className="section-kicker">CLASS COMPARISON</p><h3>모델별 클래스 탐지 비교</h3><small>같은 탐지 클래스에 대한 네 모델의 탐지 건수와 평균 신뢰도를 비교합니다.</small></div><strong className="model-class-total">총 {rows.length}개 클래스</strong></div>{rows.length ? <><div className="model-class-list">{visibleRows.map((row, index) => <article key={row.className}><header><em>{String(index + 1).padStart(2, "0")}</em><strong>{row.className}</strong></header><div>{slots.map((slot) => { const analysis = items.find((candidate) => candidate.model.model_key === slot.key), stat = (analysis?.class_stats ?? []).find((candidate) => candidate.class_name === row.className); return <div className={`model-class-model-row metric-model-${slot.key}`} key={slot.key}><span>{slot.name}</span><i><b style={{ width: `${stat ? stat.count / maxCount * 100 : 0}%` }}/></i><em>{stat ? `${stat.count.toLocaleString()}건 · ${Math.round(stat.avg_confidence * 100)}%` : "—"}</em></div>; })}</div></article>)}</div>{rows.length > 2 && <button ref={toggleRef} className={`model-class-toggle ${expanded ? "expanded" : ""}`} type="button" onClick={toggleExpanded}><ChevronDown size={15}/>{expanded ? "접기" : "펼치기"}</button>}</> : <div className="ai-result-empty"><ScanLine size={23}/><span>비교할 클래스 탐지 결과가 없습니다.</span></div>}<footer><AlertCircle size={14}/><span>신뢰도는 모델의 예측 확신 수준이며 실제 정확도와는 다릅니다. 미등록 모델은 비교에서 제외됩니다.</span></footer></section>;
}

function LocationPreviewDialog({ latitude, longitude, address, description, onClose }: { latitude: number; longitude: number; address: string | null; description: string | null; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [onClose]);
  return createPortal(<div className="location-preview-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="location-preview-modal" role="dialog" aria-modal="true" aria-labelledby="location-preview-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="section-kicker">OBSERVATION LOCATION</p><h2 id="location-preview-title">촬영 위치</h2></div><button type="button" aria-label="지도 닫기" onClick={onClose}><X size={20}/></button></header>
      <div className="location-preview-info"><MapPinned size={18}/><div><strong>{address || "사용자가 확인한 관측 위치"}</strong>{description && <p>{description}</p>}<span>{latitude.toFixed(6)}, {longitude.toFixed(6)}</span></div></div>
      <LocationMap latitude={latitude} longitude={longitude} readOnly/>
      <footer><button type="button" onClick={onClose}>닫기</button></footer>
    </section>
  </div>, document.body);
}

function TimelineTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { time?: string; detection_count?: number } }> }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="timeline-tooltip" role="status">
    <div className="timeline-tooltip-time"><span />영상 시점<strong>{point.time ?? "--:--"}</strong></div>
    <div className="timeline-tooltip-value"><small>탐지 건수</small><strong>{(point.detection_count ?? 0).toLocaleString()}<em>건</em></strong></div>
    <p>클릭하면 이 구간을 재생합니다.</p>
  </div>;
}

function formatTime(seconds: number) { const mins = Math.floor(seconds / 60); return `${String(mins).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
function formatDuration(seconds: number) { if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}초`; const mins = Math.floor(seconds / 60); const secs = Math.round(seconds % 60); return `${mins}분 ${secs}초`; }
function formatBytes(bytes: number) { if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function failurePresentation(code: Analysis["error_code"]) {
  const fallback = { label: "분석 오류", message: "분석 과정에서 문제가 발생했습니다.", guide: "모델과 미디어 상태를 확인한 뒤 다시 분석해 주세요. 같은 문제가 반복되면 버그 게시판에 오류 내용을 남겨주세요." };
  const presentations: Partial<Record<NonNullable<Analysis["error_code"]>, typeof fallback>> = {
    MODEL_LOAD_FAILED: { label: "모델 오류", message: "등록한 AI 모델을 불러오는 과정에서 문제가 확인되었습니다.", guide: "AI 모델 관리에서 사용 제한 사유를 확인하고 정상 모델을 새로 등록해 주세요." },
    MEDIA_READ_FAILED: { label: "미디어 오류", message: "등록한 미디어 파일의 내용을 읽지 못했습니다.", guide: "원본 파일이 정상적으로 열리는지 확인한 뒤 다시 등록해 주세요." },
    VIDEO_CODEC_UNSUPPORTED: { label: "코덱 오류", message: "현재 환경에서 영상의 형식이나 코덱을 처리하지 못했습니다.", guide: "영상을 MP4(H.264) 형식으로 변환해 다시 등록해 주세요." },
    OUTPUT_CREATE_FAILED: { label: "결과 생성 오류", message: "분석은 진행됐지만 결과 파일을 완성하지 못했습니다.", guide: "저장 공간을 확인한 뒤 동일 조건으로 다시 분석해 주세요." },
    INSUFFICIENT_STORAGE: { label: "저장 공간 부족", message: "분석 결과를 저장할 공간이 부족해 작업을 시작하지 못했습니다.", guide: "불필요한 자산이나 분석 결과를 정리한 뒤 다시 시도해 주세요." },
    SERVER_RESTARTED: { label: "서버 재시작", message: "서버가 다시 시작되면서 진행 중이던 분석이 안전하게 종료되었습니다.", guide: "모델과 미디어가 보존되어 있으므로 동일 조건으로 다시 분석할 수 있습니다." },
    RECOVERY_INPUT_MISSING: { label: "복구 입력 누락", message: "서버 재시작 후 모델 또는 미디어 파일을 확인할 수 없어 작업을 복구하지 못했습니다.", guide: "AI 모델과 미디어를 다시 등록한 뒤 새 탐색을 준비해 주세요." },
    USER_CANCELLED: { label: "사용자 중단", message: "사용자의 요청으로 진행 중이던 분석을 중단했습니다.", guide: "동일 조건으로 다시 분석하거나 새 탐색을 준비할 수 있습니다." },
    INFERENCE_FAILED: { label: "추론 오류", message: "AI 모델이 미디어를 분석하는 중 문제가 발생했습니다.", guide: "모델과 미디어 상태를 확인한 뒤 다시 분석해 주세요." },
  };
  return (code ? presentations[code] : undefined) ?? fallback;
}

function CancelAnalysisDialog({ item, busy, error, onClose, onConfirm }: { item: Analysis; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  return createPortal(<div className="analysis-confirm-backdrop" role="presentation" onMouseDown={onClose}><section className="analysis-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="cancel-analysis-title" aria-describedby="cancel-analysis-description" onMouseDown={(event) => event.stopPropagation()}><span className="analysis-confirm-icon"><Ban size={25}/></span><p className="section-kicker">STOP ANALYSIS</p><h2 id="cancel-analysis-title">분석을 중단하시겠습니까?</h2><p id="cancel-analysis-description">현재까지 생성된 임시 결과는 저장되지 않습니다.<br/>모델과 원본 미디어는 그대로 유지됩니다.</p><div className="analysis-confirm-target"><span><small>분석 미디어</small><strong>{item.video.name}</strong></span><span><small>현재 진행률</small><strong>{Math.max(1, Math.min(99, Math.round(item.progress)))}%</strong></span></div>{error && <p className="analysis-confirm-error"><AlertCircle size={14}/>{error}</p>}<div className="analysis-confirm-actions"><button type="button" disabled={busy} onClick={onClose}>계속 분석</button><button type="button" className="danger" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" size={16}/> : <Ban size={16}/>}분석 중단</button></div></section></div>, document.body);
}
