"use client";

import { useMemo, useState } from "react";
import { BarChart3, Gauge, ScanLine } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis } from "@/lib/types";

export function AnalysisComparison({ analyses, onStartAnalysis }: { analyses: Analysis[]; onStartAnalysis?: () => void }) {
  const completed = useMemo(() => analyses.filter((item) => item.status === "completed"), [analyses]);
  const [leftId, setLeftId] = useState<number | null>(null);
  const [rightId, setRightId] = useState<number | null>(null);
  const left = completed.find((item) => item.id === (leftId ?? completed[0]?.id));
  const right = completed.find((item) => item.id === (rightId ?? completed[1]?.id ?? completed[0]?.id));

  if (!completed.length) return <div className="compare-empty"><BarChart3 size={34}/><p className="section-kicker">PERFORMANCE COMPARISON</p><h2>비교할 분석 결과가 없습니다.</h2><p>두 개 이상의 결과를 쌓으면 탐지 수, 평균 신뢰도와 처리 속도를 같은 기준으로 확인할 수 있습니다.</p>{onStartAnalysis && <button className="secondary-button" onClick={onStartAnalysis}>분석 결과 만들기</button>}</div>;

  const chartData = [left, right].filter(Boolean).map((item) => ({
    name: item!.model.name,
    "평균 신뢰도(%)": Number(((item!.avg_confidence ?? 0) * 100).toFixed(1)),
    "처리 속도(FPS)": Number((item!.processing_fps ?? 0).toFixed(1)),
  }));

  return <div className="comparison-page">
    <section className="comparison-controls">
      <div><p className="section-kicker">SELECT RUNS</p><h2>완료된 탐색 두 건을 선택하세요.</h2></div>
      <label>기준 결과<select value={left?.id ?? ""} onChange={(event) => setLeftId(Number(event.target.value))}>{completed.map((item) => <option key={item.id} value={item.id}>{item.model.name} · {item.video.name}</option>)}</select></label>
      <label>비교 결과<select value={right?.id ?? ""} onChange={(event) => setRightId(Number(event.target.value))}>{completed.map((item) => <option key={item.id} value={item.id}>{item.model.name} · {item.video.name}</option>)}</select></label>
    </section>
    <section className="comparison-summary">
      {[left, right].map((item, index) => item && <article key={`${index}-${item.id}`}>
        <header><span><ScanLine size={18}/></span><div><small>{index === 0 ? "기준 모델" : "비교 모델"}</small><h3>{item.model.name}</h3><p>{item.video.name}</p></div></header>
        <dl><div><dt>총 탐지 수</dt><dd>{item.total_detections.toLocaleString()}건</dd></div><div><dt>평균 신뢰도</dt><dd>{((item.avg_confidence ?? 0) * 100).toFixed(1)}%</dd></div><div><dt>처리 속도</dt><dd>{(item.processing_fps ?? 0).toFixed(1)} FPS</dd></div><div><dt>분석 조건</dt><dd>{Math.round(item.confidence * 100)}% · {item.frame_stride}프레임</dd></div></dl>
      </article>)}
    </section>
    <section className="comparison-chart">
      <div className="comparison-heading"><div><p className="section-kicker">PERFORMANCE</p><h2>추론 성능 비교</h2></div><Gauge size={25}/></div>
      <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} barGap={10}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Legend/><Bar dataKey="평균 신뢰도(%)" fill="#087f86" radius={[3,3,0,0]}/><Bar dataKey="처리 속도(FPS)" fill="#e96b45" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>
      <p className="comparison-note">현재 지표는 라벨이 없는 현장 영상의 추론 결과입니다. 정밀도, 재현율, mAP 비교에는 별도의 정답 라벨 데이터셋이 필요합니다.</p>
    </section>
  </div>;
}
