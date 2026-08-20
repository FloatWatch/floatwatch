"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, Gauge, ScanLine } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_URL, api } from "@/lib/api";
import type { Analysis } from "@/lib/types";

export function AnalysisComparison({ analyses, onStartAnalysis }: { analyses: Analysis[]; onStartAnalysis?: () => void }) {
  const completed = useMemo(() => analyses.filter((item) => item.status === "completed"), [analyses]);
  const [leftId, setLeftId] = useState<number | null>(null);
  const [rightId, setRightId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Analysis>>({});
  const left = completed.find((item) => item.id === leftId);
  const comparableResults = left
    ? completed.filter((item) => item.video.id === left.video.id && item.id !== left.id)
    : [];
  const right = comparableResults.find((item) => item.id === rightId);
  useEffect(() => {
    const ids = [left?.id, right?.id].filter((id): id is number => Boolean(id) && !details[id!]);
    if (!ids.length) return;
    let live = true;
    Promise.all(ids.map((id) => api<Analysis>(`/analyses/${id}`))).then((items) => {
      if (!live) return;
      setDetails((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.id, item])) }));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [left?.id, right?.id, details]);

  const leftDetail = left ? details[left.id] ?? left : undefined;
  const rightDetail = right ? details[right.id] ?? right : undefined;

  if (!completed.length) return <div className="compare-empty"><BarChart3 size={34}/><p className="section-kicker">PERFORMANCE COMPARISON</p><h2>비교할 분석 결과가 없습니다.</h2><p>두 개 이상의 결과를 쌓으면 탐지 수, 평균 신뢰도와 처리 속도를 같은 기준으로 확인할 수 있습니다.</p>{onStartAnalysis && <button className="secondary-button" onClick={onStartAnalysis}>분석 결과 만들기</button>}</div>;

  const leftConfidence = Number(((left?.avg_confidence ?? 0) * 100).toFixed(1));
  const rightConfidence = Number(((right?.avg_confidence ?? 0) * 100).toFixed(1));
  const leftDensity = Number((left?.processed_frames ? left.total_detections / left.processed_frames : 0).toFixed(2));
  const rightDensity = Number((right?.processed_frames ? right.total_detections / right.processed_frames : 0).toFixed(2));
  const classNames = Array.from(new Set([...(leftDetail?.class_stats ?? []), ...(rightDetail?.class_stats ?? [])].map((stat) => stat.class_name)));
  const classChartData = classNames.map((className) => ({
    className,
    baseline: Number((((leftDetail?.class_stats ?? []).find((stat) => stat.class_name === className)?.count ?? 0) / Math.max(leftDetail?.processed_frames ?? 0, 1)).toFixed(2)),
    comparison: Number((((rightDetail?.class_stats ?? []).find((stat) => stat.class_name === className)?.count ?? 0) / Math.max(rightDetail?.processed_frames ?? 0, 1)).toFixed(2)),
  }));
  const classStatsLoading = Boolean(left && right && (!details[left.id] || !details[right.id]));

  return <div className="comparison-page">
    <section className="comparison-controls">
      <div><p className="section-kicker">SELECT RUNS</p><h2>동일한 미디어의 탐색 결과를 비교하세요.</h2>{left && <p className="comparison-media-lock">비교 미디어 · <strong>{left.video.name}</strong></p>}</div>
      <ResultSelect label="기준 결과" placeholder="기준 결과를 선택하세요" options={completed} value={left?.id ?? null} onChange={(id) => { setLeftId(id); setRightId(null); }}/>
      <ResultSelect label="비교 결과" placeholder={!left ? "기준 결과를 먼저 선택하세요" : comparableResults.length ? "비교 결과를 선택하세요" : "동일 미디어 결과 없음"} options={comparableResults} value={right?.id ?? null} disabled={!left || !comparableResults.length} onChange={setRightId}/>
    </section>
    {!left ? <section className="compare-empty"><BarChart3 size={34}/><p className="section-kicker">COMPARISON STANDBY</p><h2>비교할 결과를 선택해 주세요.</h2><p>기준 결과를 선택하면 동일한 미디어로 분석한 결과만 비교 대상으로 표시됩니다.</p></section> : <><section className={`comparison-summary ${right ? "compared" : ""}`}>
      {[left, right].map((item, index) => item && <article key={`${index}-${item.id}`}>
        <header><span><ScanLine size={18}/></span><div><small>{index === 0 ? "기준 모델" : "비교 모델"}</small><h3>{item.model.name}</h3><p>{item.video.name}</p></div></header>
        <div className="comparison-result-preview"><span>RESULT PREVIEW</span>{item.output_url ? item.video.media_type === "image" ? <img src={`${API_URL}${item.output_url}`} alt={`${item.model.name} 분석 결과 미리보기`}/> : <video src={`${API_URL}${item.output_url}`} controls preload="metadata" aria-label={`${item.model.name} 분석 결과 미리보기`}/> : <p>미리보기를 불러올 수 없습니다.</p>}</div>
        <dl><div><dt>총 탐지 수</dt><dd>{item.total_detections.toLocaleString()}건</dd></div><div><dt>평균 신뢰도</dt><dd>{((item.avg_confidence ?? 0) * 100).toFixed(1)}%</dd></div><div><dt>프레임당 탐지</dt><dd>{item.processed_frames ? (item.total_detections / item.processed_frames).toFixed(2) : "0.00"}건</dd></div><div><dt>분석 조건</dt><dd>{Math.round(item.confidence * 100)}% · {item.frame_stride}프레임</dd></div></dl>
      </article>)}
    </section>
    {right ? <section className="comparison-chart">
      <div className="comparison-heading"><div><p className="section-kicker">MODEL VS MODEL</p><h2>AI 탐지 경향 비교</h2></div><Gauge size={25}/></div>
      <div className="comparison-chart-grid">
        <MetricComparisonCard kicker="CONFIDENCE" title="평균 신뢰도" description="모델이 탐지 결과를 확신한 평균 수준" leftName={left.model.name} rightName={right.model.name} leftValue={leftConfidence} rightValue={rightConfidence} unit="%" scaleMax={100}/>
        <MetricComparisonCard kicker="DETECTION DENSITY" title="프레임당 탐지 수" description="처리 프레임 수로 보정한 탐지 밀도" leftName={left.model.name} rightName={right.model.name} leftValue={leftDensity} rightValue={rightDensity} unit="건"/>
        <article className="comparison-class-chart"><div className="comparison-class-head"><div><small>CLASS DISTRIBUTION</small><h3>클래스별 탐지 밀도</h3><p>한 프레임에서 각 클래스를 얼마나 자주 탐지했는지 비교합니다.</p></div><div className="comparison-model-key"><span className="baseline"><i/>기준 · {left.model.name}</span><span className="comparison"><i/>비교 · {right.model.name}</span></div></div>{classStatsLoading ? <div className="comparison-chart-empty">클래스 통계를 불러오는 중입니다.</div> : classChartData.length ? <ResponsiveContainer width="100%" height={Math.max(270, classChartData.length * 58)}><BarChart data={classChartData} layout="vertical" barCategoryGap="28%" margin={{ top: 12, right: 30, bottom: 8, left: 12 }}><CartesianGrid stroke="rgba(185,224,220,.12)" strokeDasharray="3 6" horizontal={false}/><XAxis type="number" allowDecimals tick={{ fill: "#abc5c2", fontSize: 10 }} axisLine={{ stroke: "rgba(185,224,220,.22)" }} tickLine={false}/><YAxis type="category" dataKey="className" width={130} tick={{ fill: "#e4f1ef", fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false}/><Tooltip cursor={{ fill: "rgba(103,205,195,.06)" }} contentStyle={{ border: "1px solid rgba(121,218,208,.3)", borderRadius: 8, background: "rgba(5,50,52,.96)", color: "#effffc", fontSize: 11 }} labelStyle={{ color: "#fff", fontWeight: 800, marginBottom: 6 }} formatter={(value, name) => [`${Number(value).toFixed(2)}건`, name === "baseline" ? `기준 · ${left.model.name}` : `비교 · ${right.model.name}`]}/><Legend content={() => null}/><Bar name={`기준 · ${left.model.name}`} dataKey="baseline" fill="#55c9bf" radius={[0,4,4,0]} maxBarSize={12}/><Bar name={`비교 · ${right.model.name}`} dataKey="comparison" fill="#ee744d" radius={[0,4,4,0]} maxBarSize={12}/></BarChart></ResponsiveContainer> : <div className="comparison-chart-empty">클래스별 통계가 없습니다.</div>}</article>
      </div>
      <p className="comparison-note">동일 미디어의 탐지 경향 비교입니다. 평균 신뢰도와 탐지량은 실제 정확도를 뜻하지 않으며, Precision·Recall·mAP 비교에는 정답 라벨 데이터셋이 필요합니다.</p>
    </section> : <section className="compare-empty"><BarChart3 size={30}/><h2>{comparableResults.length ? "비교 결과를 선택해 주세요." : "같은 미디어의 비교 결과가 없습니다."}</h2><p>{comparableResults.length ? "동일한 미디어로 분석한 결과 중 하나를 선택하면 비교 차트가 표시됩니다." : <><strong>{left.video.name}</strong>을 다른 모델로 한 번 더 분석하면 성능을 비교할 수 있습니다.</>}</p>{!comparableResults.length && onStartAnalysis && <button className="secondary-button" onClick={onStartAnalysis}>동일 미디어 다시 분석하기</button>}</section>}</>}
  </div>;
}

function MetricComparisonCard({ kicker, title, description, leftName, rightName, leftValue, rightValue, unit, scaleMax }: { kicker: string; title: string; description: string; leftName: string; rightName: string; leftValue: number; rightValue: number; unit: string; scaleMax?: number }) {
  const max = scaleMax ?? Math.max(leftValue, rightValue, 1) * 1.12;
  const difference = Math.abs(leftValue - rightValue);
  const isEqual = difference < .005;
  const leader = leftValue > rightValue ? "기준 모델" : "비교 모델";
  const valueLabel = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`;
  return <article className="comparison-metric-card">
    <header><div><small>{kicker}</small><h3>{title}</h3><p>{description}</p></div><span className={isEqual ? "even" : "difference"}>{isEqual ? "동일 수준" : `${leader} +${difference.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`}</span></header>
    <div className="comparison-meter-list">
      <div className="baseline"><div><span>기준</span><strong>{leftName}</strong><b>{valueLabel(leftValue)}</b></div><i><em style={{ width: `${Math.max(3, leftValue / max * 100)}%` }}/></i></div>
      <div className="comparison"><div><span>비교</span><strong>{rightName}</strong><b>{valueLabel(rightValue)}</b></div><i><em style={{ width: `${Math.max(3, rightValue / max * 100)}%` }}/></i></div>
    </div>
  </article>;
}

function ResultSelect({ label, placeholder, options, value, disabled = false, onChange }: { label: string; placeholder: string; options: Analysis[]; value: number | null; disabled?: boolean; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.id === value);
  return <div className="comparison-result-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span>{label}</span>
    <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {selected ? <ResultOptionContent item={selected}/> : <em>{placeholder}</em>}
      <ChevronDown size={15}/>
    </button>
    {open && !disabled && <div role="listbox">
      {options.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === value} onClick={() => { onChange(item.id); setOpen(false); }}><ResultOptionContent item={item}/></button>)}
    </div>}
  </div>;
}

function ResultOptionContent({ item }: { item: Analysis }) {
  return <span className="comparison-result-option"><span><strong>{item.video.name}</strong><small>{item.model.name}</small></span><time>{formatAnalysisTime(item.completed_at ?? item.created_at)}</time></span>;
}

function formatAnalysisTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
