'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './presentation.module.css';

export type ExperimentModel = {
  id: string;
  name: string;
  round: string;
  epochs: string;
  precision: string;
  recall: string;
  map50: string;
  map95: string;
  prefix: string;
};

type DetailView = 'curves' | 'detection' | 'confusion';

const detailLabel: Record<DetailView, string> = {
  curves: '평가 그래프',
  detection: '라벨 ↔ 예측 비교',
  confusion: '혼동 행렬',
};

function DetailIcon({ type }: { type: DetailView }) {
  if (type === 'curves') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m7 16 4-5 3 3 5-7"/></svg>;
  if (type === 'detection') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3-3a2 2 0 0 0-3 0l-9 9"/></svg>;
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4zM4 10h16M10 4v16"/><path d="m12 14 2 2 4-5"/></svg>;
}

function LightThemeMatrixImage({ src, alt }: { src: string; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      const baseR = data[0];
      const baseG = data[1];
      const baseB = data[2];
      const heatLeft = canvas.width * .225;
      const heatRight = canvas.width * .765;
      const heatTop = canvas.height * .055;
      const heatBottom = canvas.height * .775;
      const barLeft = canvas.width * .79;
      const barRight = canvas.width * .835;

      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const isPlotBackground = Math.abs(r - baseR) < 9 && Math.abs(g - baseG) < 9 && Math.abs(b - baseB) < 9;
          if (isPlotBackground) {
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
            continue;
          }
          const insideHeatmap = x >= heatLeft && x <= heatRight && y >= heatTop && y <= heatBottom;
          const insideColorBar = x >= barLeft && x <= barRight && y >= heatTop && y <= heatBottom;
          const nearNeutralLight = r > 125 && g > 125 && b > 125 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
          if (!insideHeatmap && !insideColorBar && nearNeutralLight) {
            const tone = Math.max(26, 225 - r);
            data[offset] = tone;
            data[offset + 1] = tone;
            data[offset + 2] = tone;
          }
        }
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = src;
  }, [src]);

  return <canvas ref={canvasRef} role="img" aria-label={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}/>
}

export default function AiExperimentReportSlide({ chapter, title, subtitle, models, setup, result, feedback, nextPlan, pageNumber }: {
  chapter: string;
  title: string;
  subtitle: string;
  models: ExperimentModel[];
  setup: string[];
  result: string[];
  feedback: string[];
  nextPlan: string[];
  pageNumber: number;
}) {
  const [selected, setSelected] = useState<ExperimentModel | null>(null);
  const [detail, setDetail] = useState<DetailView>('curves');
  const open = (model: ExperimentModel, view: DetailView) => { setSelected(model); setDetail(view); };
  const root = '/presentation/ai-report-round2';

  return <div className={styles.slide}>
    <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>
    <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 94, paddingBottom: 34 }}>
      <div className={styles.chapterBadge}>{chapter}</div>
      <h1 className={styles.slideTitle} style={{ marginBottom: 0 }}>{title}</h1>
      <p className={styles.slideSubtitle} style={{ margin: '8px 0 18px', maxWidth: 1160, color: '#344e4c', fontSize: 18, fontWeight: 700 }}>{subtitle}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: '100%' }}>
        {models.map((model) => <section key={model.id} style={{ padding: '20px 22px', border: '1px solid #c8d5d9', borderRadius: 15, background: 'linear-gradient(145deg, #fff, #edf2f4)', boxShadow: '0 10px 24px rgba(29,52,62,.07)' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}>
            <div><div style={{ color: '#b9502e', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>{model.round} · {model.epochs} EPOCHS</div><h2 style={{ margin: '6px 0 2px', color: '#142f3d', fontSize: 30 }}>{model.name}</h2><span style={{ color: '#60777b', fontSize: 14, fontWeight: 800 }}>Independent Model Training</span></div>
            <div style={{ display: 'flex', gap: 7 }}>{(['curves','detection','confusion'] as DetailView[]).map((view) => <button key={view} data-nav="true" type="button" onClick={(event) => { event.stopPropagation(); open(model, view); }} title={detailLabel[view]} aria-label={`${model.name} ${detailLabel[view]} 열기`} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', padding: 0, border: view === 'confusion' ? '1px solid #d8663f' : '1px solid #aebfc6', borderRadius: 11, background: view === 'confusion' ? '#d8663f' : view === 'detection' ? '#315d76' : '#fff', color: view === 'curves' ? '#315d76' : '#fff', cursor: 'pointer' }}><DetailIcon type={view}/></button>)}</div>
          </header>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 18 }}>{[['Precision',model.precision],['Recall',model.recall],['mAP50',model.map50],['mAP50–95',model.map95]].map(([label,value],index) => <div key={label} style={{ padding: '11px 9px', border: '1px solid #d3dee1', borderRadius: 9, background: index === 3 ? '#263f50' : '#fff' }}><small style={{ color: index === 3 ? '#cfe0e7' : '#506a70', fontSize: 12, fontWeight: 850 }}>{label}</small><strong style={{ display: 'block', marginTop: 4, color: index === 3 ? '#fff' : '#183742', fontSize: 22 }}>{value}</strong></div>)}</div>
          <div style={{ display: 'flex', gap: 15, marginTop: 13, paddingTop: 11, borderTop: '1px solid #d7e0e2', color: '#49666d', fontSize: 12, fontWeight: 800 }}><span>그래프</span><span>라벨·예측</span><span>혼동 행렬</span></div>
        </section>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, width: '100%', marginTop: 18 }}>
        {[
          { no:'01', en:'TRAINING SETUP', ko:'학습 조건', items:setup, bg:'rgba(255,255,255,.88)', border:'#cbd7da', accent:'#496b82', text:'#29454c' },
          { no:'02', en:'TRAINING RESULT', ko:'학습 결과', items:result, bg:'#edf4f6', border:'#bfd0d6', accent:'#2f7182', text:'#24434c' },
          { no:'03', en:'RESULT FEEDBACK', ko:'결과 피드백', items:feedback, bg:'#263f50', border:'#263f50', accent:'#ff9a74', text:'#fff' },
          { no:'04', en:'NEXT TRAINING', ko:'다음 학습 계획', items:nextPlan, bg:'#fff3ed', border:'#e7c4b5', accent:'#b9502e', text:'#3f403f' },
        ].map(panel => <section key={panel.no} style={{ minHeight: 166, padding: '15px 16px 14px', boxSizing: 'border-box', border: `1px solid ${panel.border}`, borderRadius: 13, background: panel.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div style={{ color: panel.accent, fontSize: 11.5, fontWeight: 950, letterSpacing: .9 }}>{panel.en}</div><span style={{ width: 27, height: 27, display: 'grid', placeItems: 'center', borderRadius: 8, background: panel.no === '03' ? 'rgba(255,255,255,.12)' : '#fff', color: panel.accent, fontSize: 11, fontWeight: 950 }}>{panel.no}</span></div>
          <h3 style={{ margin: '4px 0 9px', color: panel.text, fontSize: 18, fontWeight: 900 }}>{panel.ko}</h3>
          <div style={{ display: 'grid', gap: 7 }}>{panel.items.map(text => <div key={text} style={{ display: 'grid', gridTemplateColumns: '6px 1fr', gap: 7, color: panel.text, fontSize: 12.5, fontWeight: 800, lineHeight: 1.35 }}><i style={{ width: 6, height: 6, marginTop: 5, borderRadius: '50%', background: panel.accent }}/><span>{text}</span></div>)}</div>
        </section>)}
      </div>
      <div style={{ marginTop: 10, color: '#50666a', fontSize: 12, fontWeight: 800 }}>※ 표기 값은 학습 로그의 지표별 최고치입니다. 동일 실험군 안에서 비교하며, 서로 다른 검증 데이터 간 단순 순위 비교는 제한합니다.</div>
    </div>
    <div className={styles.pageNumber}>{pageNumber}</div>

    {selected && <div data-nav="true" onClick={(event) => { event.stopPropagation(); setSelected(null); }} style={{ position: 'absolute', zIndex: 50, inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(13,28,35,.8)', backdropFilter: 'blur(7px)', cursor: 'default' }}><section data-nav="true" onClick={(event) => event.stopPropagation()} style={{ width: detail === 'detection' ? 1320 : 1240, height: detail === 'detection' ? 740 : 680, padding: detail === 'detection' ? 0 : '24px 26px 26px', overflow: 'hidden', boxSizing: 'border-box', borderRadius: 20, background: '#f5f7f6', boxShadow: '0 28px 70px rgba(0,0,0,.34)' }}>
      <header style={{ minHeight: detail === 'detection' ? 104 : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: detail === 'detection' ? 0 : 18, padding: detail === 'detection' ? '0 28px' : 0, borderBottom: detail === 'detection' ? '1px solid #d4dee1' : 0, background: detail === 'detection' ? '#fff' : 'transparent' }}><div><div style={{ color: '#b9502e', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>{selected.round} · {detailLabel[detail]}</div><h2 style={{ margin: '5px 0 0', color: '#142f3d', fontSize: 30 }}>{selected.name} {detailLabel[detail]}</h2></div><button data-nav="true" type="button" onClick={() => setSelected(null)} aria-label="리포트 닫기" style={{ width: 46, height: 46, border: 0, borderRadius: '50%', background: '#263f50', color: '#fff', fontSize: 26, cursor: 'pointer' }}>×</button></header>
      {detail === 'detection' ? <div style={{ height: 636, padding: '22px 28px 24px', boxSizing: 'border-box', background: 'linear-gradient(180deg,#eef3f4 0%,#f7f9f8 100%)' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 54px 1fr', alignItems: 'stretch', height: 548 }}>
        {[[`${root}/${selected.prefix}-labels.jpg`,'라벨링 결과','GROUND TRUTH'],[`${root}/${selected.prefix}-pred.jpg`,'모델 추론 결과','MODEL PREDICTION']].map(([src,label,en],index) => <figure key={src} style={{ gridColumn: index === 0 ? 1 : 3, display: 'grid', gridTemplateRows: '68px 1fr', minWidth: 0, minHeight: 0, margin: 0, overflow: 'hidden', border: index === 0 ? '1px solid #bdccd2' : '2px solid #315d76', borderRadius: 16, background: '#fff', boxShadow: index === 0 ? '0 10px 25px rgba(29,52,62,.08)' : '0 14px 30px rgba(32,73,94,.16)' }}><figcaption style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 20px', borderBottom: '1px solid #d7e1e3' }}><span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, background: index === 0 ? '#e7eef1' : '#315d76', color: index === 0 ? '#315d76' : '#fff', fontSize: 14, fontWeight: 950 }}>0{index + 1}</span><div><strong style={{ display: 'block', color: '#183741', fontSize: 19 }}>{label}</strong><small style={{ display: 'block', marginTop: 2, color: '#718388', fontSize: 11, fontWeight: 800, letterSpacing: .7 }}>{en}</small></div></figcaption><div style={{ minWidth: 0, minHeight: 0, padding: 12, background: '#13272e' }}><img src={src} alt={`${selected.name} ${label}`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}/></div></figure>)}
        <div aria-hidden="true" style={{ gridColumn: 2, gridRow: 1, alignSelf: 'center', justifySelf: 'center', zIndex: 2, width: 42, height: 42, display: 'grid', placeItems: 'center', border: '5px solid #eef3f4', borderRadius: '50%', background: '#b9502e', color: '#fff', fontSize: 24, fontWeight: 900, boxShadow: '0 6px 15px rgba(117,55,35,.24)' }}>→</div>
      </div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 42, color: '#4d656d', fontSize: 13, fontWeight: 800 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#b9502e' }}/>동일 검증 데이터의 라벨링 결과와 {selected.name} 추론 결과를 1:1로 비교합니다.</div></div> : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: 555 }}>{(detail === 'curves' ? [[`${root}/${selected.prefix}-pr.png`,'Precision–Recall Curve'],[`${root}/${selected.prefix}-f1.png`,'F1–Confidence Curve']] : [[`${root}/${selected.prefix}-confusion.png`,'Confusion Matrix'],[`${root}/${selected.prefix}-confusion-normalized.png`,'Normalized Confusion Matrix']]).map(([src,label]) => <figure key={src} style={{ position: 'relative', display: 'grid', gridTemplateRows: 'auto 1fr', minWidth: 0, minHeight: 0, margin: 0, padding: 15, border: '1px solid #ccd8dc', borderRadius: 13, background: '#fff' }}><figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, color: '#243f4b', fontSize: 18, fontWeight: 850 }}><span>{label}</span>{detail === 'confusion' && <span style={{ padding: '6px 10px', border: '1px solid #d6e0e3', borderRadius: 999, background: '#f2f6f7', color: '#49636b', fontSize: 11.5, fontWeight: 900, whiteSpace: 'nowrap' }}><b style={{ color: '#b9502e' }}>가로축(X)</b> 실제 정답 클래스&nbsp;&nbsp;·&nbsp;&nbsp;<b style={{ color: '#315d76' }}>세로축(Y)</b> 모델이 예측한 클래스</span>}</figcaption><div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>{detail === 'confusion' && (selected.prefix === 'yolov26s' || selected.prefix === 'rtdetr') ? <LightThemeMatrixImage src={src} alt={`${selected.name} ${label}`}/> : <img src={src} alt={`${selected.name} ${label}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}/>}</div></figure>)}</div>}
    </section></div>}
  </div>;
}
