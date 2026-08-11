"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, Gauge, LoaderCircle, ScanSearch, Timer, Waves } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_URL, api } from "@/lib/api";
import type { Analysis } from "@/lib/types";

export function AnalysisDetail({ id, onUpdated }: { id: number; onUpdated: () => void }) {
  const [item, setItem] = useState<Analysis | null>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const value = await api<Analysis>(`/analyses/${id}`);
      if (live) setItem(value);
      if (value.status === "processing" || value.status === "queued") setTimeout(load, 2000);
      else onUpdated();
    }
    load().catch(() => {});
    return () => { live = false; };
  }, [id]);

  if (!item) return <div className="detail-loading"><LoaderCircle className="spin" /><span>분석 정보를 불러오는 중</span></div>;
  if (item.status === "failed") return <section className="empty-state error-state"><AlertCircle size={32} /><h3>분석을 완료하지 못했습니다</h3><p>{item.error_message}</p></section>;
  if (item.status !== "completed") return <section className="processing-state"><div className="processing-icon"><ScanSearch size={30} /></div><p className="section-kicker">CPU INFERENCE</p><h2>{item.video.media_type === "image" ? "이미지를" : "동영상을"} 분석하고 있습니다</h2><p>{item.model.name} · {item.video.name}</p><div className="progress-track"><span style={{ width: `${Math.max(item.progress, 2)}%` }} /></div><strong>{item.progress.toFixed(0)}%</strong><small>창을 닫아도 분석은 계속됩니다.</small></section>;

  const timeline = (item.frame_metrics ?? []).map((metric) => ({ ...metric, time: formatTime(metric.timestamp_seconds), confidence: Math.round(metric.avg_confidence * 100) }));
  return <div className="analysis-detail">
    <div className="detail-heading"><div><p className="section-kicker">ANALYSIS #{item.id}</p><h2>{item.video.name}</h2><p>{item.model.name} · 신뢰도 {Math.round(item.confidence * 100)}% · {item.frame_stride}프레임 간격</p></div><a className="secondary-button" href={`${API_URL}${item.output_url}?download=true`}><Download size={17} />결과 다운로드</a></div>
    <div className="metric-grid">
      <Metric icon={<Waves />} label="총 탐지 건수" value={item.total_detections.toLocaleString()} unit="건" />
      <Metric icon={<Gauge />} label="평균 신뢰도" value={`${Math.round((item.avg_confidence ?? 0) * 100)}`} unit="%" />
      <Metric icon={<Timer />} label="처리 속도" value={(item.processing_fps ?? 0).toFixed(1)} unit="FPS" />
      <Metric icon={<ScanSearch />} label="분석 프레임" value={item.processed_frames.toLocaleString()} unit="장" />
    </div>
    <div className="result-layout">
      <section className="panel video-panel"><div className="panel-heading"><div><p className="section-kicker">ANNOTATED RESULT</p><h3>탐지 결과 {item.video.media_type === "image" ? "이미지" : "동영상"}</h3></div><span className="status success">분석 완료</span></div>{item.video.media_type === "image" ? <img className="analysis-result-image" src={`${API_URL}${item.output_url}`} alt="부유물 탐지 결과" /> : <video controls preload="metadata" src={`${API_URL}${item.output_url}`} />}</section>
      <section className="panel class-panel"><div className="panel-heading"><div><p className="section-kicker">CLASS SUMMARY</p><h3>클래스별 탐지</h3></div></div><div className="class-list">{(item.class_stats ?? []).map((stat, index) => <div className="class-row" key={stat.class_id}><span className="class-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{stat.class_name}</strong><small>평균 신뢰도 {Math.round(stat.avg_confidence * 100)}%</small></div><b>{stat.count.toLocaleString()}</b></div>)}</div></section>
    </div>
    <div className="chart-grid">
      <section className="panel chart-panel"><div className="panel-heading"><div><p className="section-kicker">TIMELINE</p><h3>시간대별 탐지 추이</h3></div></div><ResponsiveContainer width="100%" height={250}><AreaChart data={timeline}><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#087f8c" stopOpacity={0.32}/><stop offset="1" stopColor="#087f8c" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce4e4"/><XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={35}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }}/><Tooltip/><Area type="monotone" dataKey="detection_count" name="탐지 건수" stroke="#087f8c" fill="url(#areaFill)" strokeWidth={2}/></AreaChart></ResponsiveContainer></section>
      <section className="panel chart-panel"><div className="panel-heading"><div><p className="section-kicker">DISTRIBUTION</p><h3>클래스 분포</h3></div></div><ResponsiveContainer width="100%" height={250}><BarChart data={(item.class_stats ?? []).slice(0, 8)} layout="vertical" margin={{ left: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dce4e4"/><XAxis type="number" tick={{ fontSize: 11 }}/><YAxis type="category" dataKey="class_name" width={75} tick={{ fontSize: 11 }}/><Tooltip/><Bar dataKey="count" name="탐지 건수" fill="#e56b3f" radius={[0, 3, 3, 0]}/></BarChart></ResponsiveContainer></section>
    </div>
    <p className="metric-note"><AlertCircle size={15} />탐지 건수는 프레임별 검출 합계이며 고유 객체 수가 아닙니다. 라벨 없는 영상이므로 mAP, Precision, Recall은 제공되지 않습니다.</p>
  </div>;
}

function Metric({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) { return <div className="metric"><span>{icon}</span><div><small>{label}</small><strong>{value}<em>{unit}</em></strong></div></div>; }
function formatTime(seconds: number) { const mins = Math.floor(seconds / 60); return `${String(mins).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
