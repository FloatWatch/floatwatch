'use client';

import { useState } from 'react';
import styles from './presentation.module.css';

const models = [
  {
    id: 'yolov8s', name: 'YOLOv8s', epochs: '87', map50: '90.3%', map95: '67.8%', precision: '88.7%', recall: '84.7%',
    charts: [
      { title: 'Precision–Recall Curve', src: '/presentation/ai-report/yolov8m-pr.png' },
      { title: 'F1–Confidence Curve', src: '/presentation/ai-report/yolov8m-f1.png' },
    ],
  },
  {
    id: 'yolov11s', name: 'YOLO11s', epochs: '108', map50: '90.4%', map95: '74.6%', precision: '87.2%', recall: '84.1%',
    charts: [
      { title: 'Precision–Recall Curve', src: '/presentation/ai-report/yolov11s-pr.png' },
      { title: 'F1–Confidence Curve', src: '/presentation/ai-report/yolov11s-f1.png' },
    ],
  },
];

const analysisComparisonsByModel = {
  yolov11s: [
    {
      example: '예시 01',
      label: { title: '라벨링 사진', src: '/presentation/ai-report/yolov11s-example-01-label.jpg' },
      inference: { title: '추론 사진', src: '/presentation/ai-report/yolov11s-example-01-inference.jpg' },
    },
    {
      example: '예시 02',
      label: { title: '라벨링 사진', src: '/presentation/ai-report/yolov11s-example-02-label.jpg' },
      inference: { title: '추론 사진', src: '/presentation/ai-report/yolov11s-example-02-inference.jpg' },
    },
  ],
  yolov8s: [
    {
      example: '예시 01',
      label: { title: '라벨링 사진', src: '/presentation/ai-report/yolov8m-example-03-label.jpg' },
      inference: { title: '추론 사진', src: '/presentation/ai-report/yolov8m-example-03-inference.jpg' },
    },
    {
      example: '예시 02',
      label: { title: '라벨링 사진', src: '/presentation/ai-report/yolov8m-example-04-label.jpg' },
      inference: { title: '추론 사진', src: '/presentation/ai-report/yolov8m-example-04-inference.jpg' },
    },
  ],
};

type ReportView = 'charts' | 'images';

export default function Slide7() {
  const [selectedModel, setSelectedModel] = useState<(typeof models)[number] | null>(null);
  const [reportView, setReportView] = useState<ReportView>('charts');
  const [comparisonIndex, setComparisonIndex] = useState(0);

  const openReport = (model: (typeof models)[number], view: ReportView) => {
    setSelectedModel(model);
    setReportView(view);
    setComparisonIndex(0);
  };

  const selectedComparisons = selectedModel?.id === 'yolov8s'
    ? analysisComparisonsByModel.yolov8s
    : analysisComparisonsByModel.yolov11s;

  return (
    <div className={styles.slide}>
      <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>

      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 94, paddingBottom: 36 }}>
        <div className={styles.chapterBadge}>AI Report · 1차 학습</div>
        <h1 className={styles.slideTitle} style={{ marginBottom: 0 }}>AI 모델 리포트</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, width: '100%', marginTop: 22 }}>
          {models.map((model) => (
            <section key={model.id} style={{ position: 'relative', padding: '21px 23px', border: '1px solid #c8d5d9', borderRadius: 15, background: 'linear-gradient(145deg, #fff, #edf2f4)', boxShadow: '0 10px 24px rgba(29,52,62,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#496b82', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>OBJECT DETECTION · {model.epochs} EPOCHS</div>
                  <h2 style={{ margin: '5px 0 0', color: '#142f3d', fontSize: 31 }}>{model.name}</h2>
                  <span style={{ display: 'block', marginTop: 3, color: '#60777b', fontSize: 14, fontWeight: 800 }}>Independent Model Training</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '48px 48px', gap: 7 }}>
                  <button data-nav="true" type="button" onClick={(event) => { event.stopPropagation(); openReport(model, 'charts'); }} aria-label={`${model.name} 평가 그래프 열기`} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid #aebfc6', borderRadius: 12, background: '#fff', color: '#315d76', cursor: 'pointer', boxShadow: '0 7px 16px rgba(39,66,80,0.1)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 16 4-5 3 3 5-7"/></svg>
                  </button>
                  <button data-nav="true" type="button" onClick={(event) => { event.stopPropagation(); openReport(model, 'images'); }} aria-label={`${model.name} 라벨링 및 추론 사진 비교 열기`} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid #315d76', borderRadius: 12, background: '#315d76', color: '#fff', cursor: 'pointer', boxShadow: '0 7px 16px rgba(39,66,80,0.14)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1fr', gap: 9, marginTop: 20 }}>
                {[
                  ['mAP50', model.map50], ['mAP50–95', model.map95], ['Precision', model.precision], ['Recall', model.recall],
                ].map(([label, value], index) => (
                  <div key={label} style={{ padding: '12px 10px', borderRadius: 9, background: index === 0 ? '#263f50' : '#fff', border: index === 0 ? 'none' : '1px solid #d3dee1' }}>
                    <small style={{ display: 'block', color: index === 0 ? '#d0e1e8' : '#506a70', fontSize: 13, fontWeight: 850 }}>{label}</small>
                    <strong style={{ display: 'block', marginTop: 3, color: index === 0 ? '#fff' : '#183742', fontSize: 24 }}>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.18fr 0.82fr', gap: 20, width: '100%', marginTop: 18 }}>
          <section style={{ display: 'grid', gridTemplateColumns: '116px 1fr', gap: 18, padding: '18px 21px', border: '1px solid #cbd7da', borderRadius: 13, background: '#fff' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid #d7e0e2' }}>
              <strong style={{ color: '#496b82', fontSize: 56, lineHeight: 0.9 }}>11</strong>
              <span style={{ marginTop: 8, color: '#4f696e', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>CLASSES</span>
            </div>
            <div>
              <div style={{ color: '#b9502e', fontSize: 15, fontWeight: 900, letterSpacing: 1.05 }}>탐지 대상 클래스</div>
              <div style={{ display: 'grid', gap: 7, marginTop: 9, color: '#183741', fontSize: 14, fontWeight: 850, lineHeight: 1.4 }}>
                <div><b style={{ color: '#b9502e' }}>0–3</b>&nbsp;&nbsp; Glass · Metal · Net · PET_Bottle</div>
                <div><b style={{ color: '#b9502e' }}>4–7</b>&nbsp;&nbsp; Plastic Buoy · Plastic Buoy(China) · Plastic ETC · Rope</div>
                <div><b style={{ color: '#b9502e' }}>8–10</b>&nbsp; Styrofoam Box · Styrofoam Buoy · Styrofoam Piece</div>
              </div>
              <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid #d7e0e2' }}>
                <div style={{ color: '#b9502e', fontSize: 15, fontWeight: 900 }}>클래스 선정 이유</div>
                <div style={{ display: 'grid', gap: 6, marginTop: 6, color: '#29454c', fontSize: 14, fontWeight: 800, lineHeight: 1.42 }}>
                  <div>• 연안에서 반복 관측되며 생태계와 선박 안전에 영향을 주는 대표 부유물 선정</div>
                  <div>• 재질·형태별 탐지 차이를 반영하고 수거 우선순위와 종류별 통계에 활용하도록 세분화</div>
                </div>
              </div>
            </div>
          </section>

          <section style={{ padding: '18px 21px', borderRadius: 13, background: '#263f50', color: '#fff' }}>
            <div style={{ color: '#ff9a74', fontSize: 14, fontWeight: 900, letterSpacing: 1.15 }}>ITERATION · 주차별 학습 계획</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 13 }}>
              {['1차 · Baseline 성능 기록', '2차 · 취약 클래스 데이터 보강', '3차 · 증강·하이퍼파라미터 조정', '4차~ · 최적 결과까지 반복 검증'].map((text, index) => <div key={text} style={{ display: 'grid', gridTemplateColumns: '35px 1fr', alignItems: 'center', gap: 11 }}><span style={{ width: 33, height: 33, display: 'grid', placeItems: 'center', borderRadius: 8, background: 'rgba(255,255,255,0.14)', color: '#ff9a74', fontSize: 12, fontWeight: 900 }}>0{index + 1}</span><span style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>{text}</span></div>)}
            </div>
          </section>
        </div>

        <div style={{ marginTop: 10, color: '#3d585d', fontSize: 14, fontWeight: 800 }}>평가 근거 · 학습 로그 · P/R · mAP · PR/F1 곡선 · Validation</div>
      </div>

      {selectedModel && (
        <div data-nav="true" onClick={(event) => { event.stopPropagation(); setSelectedModel(null); }} style={{ position: 'absolute', zIndex: 50, inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(13,28,35,0.78)', backdropFilter: 'blur(7px)', cursor: 'default' }}>
          <section data-nav="true" onClick={(event) => event.stopPropagation()} style={{ width: reportView === 'charts' ? 1240 : 1320, height: reportView === 'charts' ? 680 : 740, padding: reportView === 'charts' ? '24px 26px 26px' : 0, overflow: 'hidden', boxSizing: 'border-box', borderRadius: 20, background: '#f5f7f6', boxShadow: '0 28px 70px rgba(0,0,0,0.34)' }}>
            <header style={{ minHeight: reportView === 'charts' ? 'auto' : 104, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: reportView === 'charts' ? 18 : 0, padding: reportView === 'charts' ? 0 : '0 28px', borderBottom: reportView === 'charts' ? 0 : '1px solid #d4dee1', background: reportView === 'charts' ? 'transparent' : '#fff' }}>
              <div><div style={{ color: '#496b82', fontSize: 13, fontWeight: 900, letterSpacing: 1.3 }}>ROUND 01 · {reportView === 'charts' ? 'EVALUATION CURVES' : 'LABEL ↔ INFERENCE'}</div><h2 style={{ margin: '5px 0 0', color: '#142f3d', fontSize: 30 }}>{selectedModel.name} {reportView === 'charts' ? '평가 그래프' : '탐지 결과 비교'}</h2></div>
              {reportView === 'images' && <nav aria-label="비교 예시 선택" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', padding: 5, borderRadius: 13, background: '#e9eef0' }}>{selectedComparisons.map((comparison, index) => <button key={comparison.example} data-nav="true" type="button" onClick={(event) => { event.stopPropagation(); setComparisonIndex(index); }} aria-pressed={comparisonIndex === index} style={{ minWidth: 92, height: 42, border: comparisonIndex === index ? '1px solid #263f50' : '1px solid transparent', borderRadius: 10, background: comparisonIndex === index ? '#263f50' : 'transparent', color: comparisonIndex === index ? '#fff' : '#526970', fontSize: 14, fontWeight: 900, cursor: 'pointer', boxShadow: comparisonIndex === index ? '0 5px 12px rgba(27,53,65,0.2)' : 'none' }}>{comparison.example}</button>)}</nav>}
              <button data-nav="true" type="button" onClick={(event) => { event.stopPropagation(); setSelectedModel(null); }} aria-label="리포트 닫기" style={{ width: 46, height: 46, border: 0, borderRadius: '50%', background: '#263f50', color: '#fff', fontSize: 26, cursor: 'pointer' }}>×</button>
            </header>
            {reportView === 'charts' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: 555 }}>
                {selectedModel.charts.map((item) => <figure key={item.title} style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minWidth: 0, minHeight: 0, margin: 0, padding: 15, border: '1px solid #ccd8dc', borderRadius: 13, background: '#fff' }}><figcaption style={{ marginBottom: 10, color: '#243f4b', fontSize: 18, fontWeight: 850 }}>{item.title}</figcaption><div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}><img src={item.src} alt={`${selectedModel.name} ${item.title}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} /></div></figure>)}
              </div>
            ) : (
              <div style={{ height: 636, padding: '22px 28px 24px', boxSizing: 'border-box', background: 'linear-gradient(180deg, #eef3f4 0%, #f7f9f8 100%)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 54px 1fr', alignItems: 'stretch', height: 548 }}>
                  {[selectedComparisons[comparisonIndex].label, selectedComparisons[comparisonIndex].inference].map((item, index) => <figure key={item.title} style={{ gridColumn: index === 0 ? 1 : 3, display: 'grid', gridTemplateRows: '68px 1fr', minWidth: 0, minHeight: 0, margin: 0, overflow: 'hidden', border: index === 0 ? '1px solid #bdccd2' : '2px solid #315d76', borderRadius: 16, background: '#fff', boxShadow: index === 0 ? '0 10px 25px rgba(29,52,62,0.08)' : '0 14px 30px rgba(32,73,94,0.16)' }}><figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 20px', borderBottom: '1px solid #d7e1e3' }}><div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, background: index === 0 ? '#e7eef1' : '#315d76', color: index === 0 ? '#315d76' : '#fff', fontSize: 14, fontWeight: 950 }}>0{index + 1}</span><div><strong style={{ display: 'block', color: '#183741', fontSize: 19 }}>{item.title}</strong><small style={{ display: 'block', marginTop: 2, color: '#718388', fontSize: 11, fontWeight: 800, letterSpacing: .7 }}>{index === 0 ? 'GROUND TRUTH' : 'MODEL PREDICTION'}</small></div></div><span style={{ padding: '6px 10px', borderRadius: 999, background: index === 0 ? '#edf2f4' : '#fff0ea', color: index === 0 ? '#526d76' : '#b9502e', fontSize: 12, fontWeight: 900 }}>{selectedComparisons[comparisonIndex].example}</span></figcaption><div style={{ position: 'relative', minWidth: 0, minHeight: 0, padding: 12, background: '#13272e' }}><img src={item.src} alt={`${selectedModel.name} ${selectedComparisons[comparisonIndex].example} ${item.title}`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} /></div></figure>)}
                  <div aria-hidden="true" style={{ gridColumn: 2, gridRow: 1, alignSelf: 'center', justifySelf: 'center', zIndex: 2, width: 42, height: 42, display: 'grid', placeItems: 'center', border: '5px solid #eef3f4', borderRadius: '50%', background: '#b9502e', color: '#fff', fontSize: 24, fontWeight: 900, boxShadow: '0 6px 15px rgba(117,55,35,0.24)' }}>→</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 42, color: '#4d656d', fontSize: 13, fontWeight: 800 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#b9502e' }} />동일한 원본 프레임의 라벨링 결과와 {selectedModel.name} 추론 결과를 1:1로 비교합니다.</div>
              </div>
            )}
          </section>
        </div>
      )}

      <div className={styles.pageNumber}>10</div>
    </div>
  );
}
