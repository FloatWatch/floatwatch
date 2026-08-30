"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileUp, LoaderCircle, MapPin, Navigation, Search, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import type { VideoAsset } from "@/lib/types";
import { LocationMap } from "./location-map";

type Props = { type: "model" | "video"; onClose: () => void; onUploaded: (uploaded?: VideoAsset) => void | Promise<void> };

const MODEL_EXTENSIONS = [".pt"];
const MEDIA_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".mp4", ".avi", ".mov", ".mkv", ".webm"];
const MEDIA_ACCEPT = MEDIA_EXTENSIONS.join(",");

export function UploadDialog({ type, onClose, onUploaded }: Props) {
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState("");
  const [modelKey, setModelKey] = useState("yolov8s");
  const [modelNameEdited, setModelNameEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploaded, setUploaded] = useState<VideoAsset | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationName, setLocationName] = useState("");
  const [locationDescription, setLocationDescription] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<Array<{ name: string; latitude: number; longitude: number }>>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationResolving, setLocationResolving] = useState(false);
  const [coastalCheck, setCoastalCheck] = useState<{ eligible: boolean; distance_m: number; reason: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const isModel = type === "model";

  function selectFile(nextFile: File | null) {
    setError("");
    if (nextFile) {
      const allowedExtensions = isModel ? MODEL_EXTENSIONS : MEDIA_EXTENSIONS;
      if (!allowedExtensions.includes(fileExtension(nextFile.name))) {
        setFile(null);
        if (input.current) input.current.value = "";
        setError(isModel
          ? "PT 형식의 YOLO 모델 파일만 등록할 수 있습니다."
          : "지원하지 않는 파일 형식입니다. JPG, JPEG, PNG, WEBP, BMP, MP4, AVI, MOV, MKV, WEBM 파일을 선택해 주세요.");
        return;
      }
    }
    setFile(nextFile);
    if (!isModel || !nextFile) return;
    if (!modelNameEdited || !modelName.trim()) setModelName(modelNameFromFile(nextFile.name));
  }

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
      const suffix = isModel ? `?name=${encodeURIComponent(modelName.trim())}&model_key=${encodeURIComponent(modelKey)}` : "";
      const result = await api<VideoAsset>(`/${isModel ? "models" : "videos"}${suffix}`, { method: "POST", body: data });
      if (isModel) { await onUploaded(); onClose(); }
      else {
        setUploaded(result);
        setLatitude(result.latitude);
        setLongitude(result.longitude);
        setLocationName(result.location_name ?? "");
        setLocationDescription(result.location_description ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation() {
    if (!uploaded) return;
    setBusy(true); setError("");
    try {
      await api(`/videos/${uploaded.id}/location`, { method: "PATCH", body: JSON.stringify({
        latitude,
        longitude,
        location_name: locationName,
        location_description: locationDescription,
        captured_at: uploaded.captured_at,
        location_source: uploaded.location_source === "metadata" && latitude === uploaded.latitude && longitude === uploaded.longitude ? "metadata" : "manual",
        location_confirmed: true,
      }) });
      await onUploaded(uploaded); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "촬영 위치를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function cancelDialog() {
    if (!uploaded) { onClose(); return; }
    setBusy(true); setError("");
    try { await api(`/videos/${uploaded.id}`, { method: "DELETE" }); await onUploaded(); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "미완료 미디어를 정리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locationQuery.trim().length < 2) return;
    setLocationSearching(true); setError("");
    try { setLocationResults(await api<Array<{ name: string; latitude: number; longitude: number }>>(`/locations/search?q=${encodeURIComponent(locationQuery.trim())}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "장소를 검색하지 못했습니다."); }
    finally { setLocationSearching(false); }
  }

  async function selectMapLocation(lat: number, lon: number) {
    setLatitude(lat);
    setLongitude(lon);
    setLocationResolving(true);
    setLocationResults([]);
    setError("");
    try {
      const [address, coastal] = await Promise.all([
        api<{ name: string; latitude: number; longitude: number }>(`/locations/reverse?latitude=${lat}&longitude=${lon}`),
        api<{ eligible: boolean; distance_m: number; reason: string }>(`/locations/coastal-check?latitude=${lat}&longitude=${lon}`),
      ]);
      setLocationName(address.name);
      setLocationQuery(address.name);
      setCoastalCheck(coastal);
    } catch (err) {
      setLocationName("");
      setError(err instanceof Error ? err.message : "선택한 위치의 주소를 확인하지 못했습니다.");
    } finally {
      setLocationResolving(false);
    }
  }

  async function selectSearchResult(result: { name: string; latitude: number; longitude: number }) {
    setLatitude(result.latitude); setLongitude(result.longitude); setLocationName(result.name); setLocationQuery(result.name); setLocationResults([]);
    try {
      setCoastalCheck(await api<{ eligible: boolean; distance_m: number; reason: string }>(`/locations/coastal-check?latitude=${result.latitude}&longitude=${result.longitude}`));
    } catch { setCoastalCheck(null); }
  }

  if (!mounted) return null;

  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={() => void cancelDialog()}>
    <div className={`modal ${uploaded ? "media-location-modal" : ""}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="section-kicker">{uploaded ? "OBSERVATION LOCATION" : "새 자산 등록"}</p><h2>{uploaded ? "촬영 위치 확인" : isModel ? "YOLO 모델 업로드" : "이미지·동영상 업로드"}</h2></div><button className="icon-button" title="닫기" disabled={busy} onClick={() => void cancelDialog()}><X size={20} /></button></header>
      {!uploaded ? <form onSubmit={submit} className="form-stack">
        {isModel && <label>모델 슬롯<select value={modelKey} onChange={(event) => setModelKey(event.target.value)}><option value="yolov8s">YOLOv8s</option><option value="yolov11s">YOLO11s</option><option value="yolov26s">YOLO26s</option><option value="rt-detr">RT-DETR</option></select></label>}
        <button type="button" className={`drop-zone ${file ? "selected" : ""}`} onClick={() => input.current?.click()}>
          {file ? <><FileUp size={28} /><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></> : <><Upload size={28} /><strong>파일을 선택하세요</strong><span>{isModel ? ".pt · 최대 500MB" : "JPG, PNG, WEBP 또는 MP4, AVI, MOV · 최대 2GB"}</span></>}
        </button>
        <input ref={input} hidden type="file" accept={isModel ? ".pt" : MEDIA_ACCEPT} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        {isModel && <p className="notice">신뢰할 수 있는 PT 모델만 업로드하세요. 파일에 실행 코드가 포함될 수 있습니다.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>취소</button><button className="primary-button" disabled={!file || busy}>{busy && <LoaderCircle className="spin" size={17} />}업로드</button></div>
      </form> : <>
      <div className="media-location-step">
        <div className={`metadata-location-status ${uploaded.latitude != null ? "detected" : "missing"}`}>{uploaded.latitude != null ? <CheckCircle2 size={18}/> : <MapPin size={18}/>}<div><strong>{uploaded.latitude != null ? "위치 메타데이터를 찾았습니다" : "위치 메타데이터가 없습니다"}</strong><span>{uploaded.latitude != null ? "지도에서 위치를 확인하거나 핀을 옮겨 수정하세요." : "지도를 클릭해 촬영 위치를 직접 선택하세요."}</span></div></div>
        <div className="media-location-search-wrap"><form className="media-location-search" onSubmit={searchLocation}><Search size={15}/><input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="장소명이나 주소를 입력하세요"/><button type="submit" disabled={locationSearching || locationQuery.trim().length < 2}>{locationSearching ? <LoaderCircle className="spin" size={14}/> : "검색"}</button></form>{locationResults.length > 0 && <div className="media-location-results">{locationResults.map((result, index) => <button type="button" key={`${result.latitude}-${result.longitude}-${index}`} onClick={() => void selectSearchResult(result)}><MapPin size={14}/><span><strong>{result.name.split(",")[0]}</strong><small>{result.name}</small></span></button>)}</div>}</div>
        <LocationMap latitude={latitude} longitude={longitude} onChange={(lat, lon) => void selectMapLocation(lat, lon)}/>
        <div className="media-location-fields"><label><span>선택한 주소 <small>{locationResolving ? "주소 확인 중..." : "우선 표시"}</small></span><input value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="지도를 선택하면 주소가 자동으로 표시됩니다"/></label><div><span><small>위도</small><strong>{latitude?.toFixed(6) ?? "선택 안 됨"}</strong></span><span><small>경도</small><strong>{longitude?.toFixed(6) ?? "선택 안 됨"}</strong></span></div></div>
        <label className="media-location-description"><span>위치 추가 설명 <small>선택 사항</small></span><input maxLength={300} value={locationDescription} onChange={(event) => setLocationDescription(event.target.value)} placeholder="예: 불당천 산책로 입구, 교량 아래에서 촬영"/></label>
        {coastalCheck && <div className={`coastal-check ${coastalCheck.eligible ? "eligible" : "excluded"}`}><MapPin size={17}/><div><strong>{coastalCheck.eligible ? "해안 관측 통계에 포함됩니다" : "해안 관측 통계에서 제외됩니다"}</strong><span>{coastalCheck.reason === "outside_korea" ? "대한민국 영역 밖의 위치입니다." : coastalCheck.eligible ? `해안선에서 약 ${Math.round(coastalCheck.distance_m).toLocaleString()}m 이내입니다.` : `해안선에서 약 ${Math.round(coastalCheck.distance_m / 100) / 10}km 떨어진 위치입니다. (포함 기준 3km)`}</span></div></div>}
        {error && <p className="form-error">{error}</p>}
        <div className="media-location-required"><MapPin size={15}/><span>촬영 위치를 선택해야 미디어 등록이 완료됩니다.</span></div>
      </div>
      <div className="media-location-actions"><button type="button" disabled={busy} onClick={() => void cancelDialog()}>등록 취소</button><button type="button" className="primary-button" disabled={latitude == null || longitude == null || locationResolving || busy} onClick={() => void saveLocation()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Navigation size={17}/>}이 위치로 등록</button></div>
      </>}
    </div>
  </div>, document.body);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function modelNameFromFile(filename: string) {
  const withoutExtension = filename.replace(/\.pt$/i, "");
  return withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "YOLO 모델";
}

function fileExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}
