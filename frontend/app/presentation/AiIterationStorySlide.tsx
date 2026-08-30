'use client';

import { useState } from 'react';
import styles from './presentation.module.css';

type ResultView = 'details' | 'charts' | 'photos' | 'matrix';

export type ResultAsset = {
  model: string;
  chart?: string;
  photo?: string;
  matrix?: string;
};

export type ExperimentRound = {
  no: string;
  label: string;
  title: string;
  summary: string;
  dataset: string;
  classFocus: string;
  basisTitle: string;
  basis: string;
  actionTitle: string;
  action: string;
  params: string;
  augment: string;
  metrics: {
    precision: string;
    recall: string;
    map50: string;
    map95: string;
  };
  assets?: ResultAsset[];
  active?: boolean;
  partial?: boolean;
  next?: boolean;
};

const defaultRounds: ExperimentRound[] = [
  {
    no: '01',
    label: '첫 번째 실험',
    title: '기준 성능 확인',
    summary: '불균형한 기본 데이터로 두 모델의 기준선 확보',
    dataset: '11개 클래스 · 총 18,710개\n클래스당 196~7,064개',
    classFocus: '클래스 간 객체 수 편차 확인',
    basisTitle: '클래스 선정 기준',
    basis: '• 연안에서 반복 관측되는 대표 부유물 중심\n• 생태계와 선박 안전에 미치는 영향 고려',
    actionTitle: '클래스 세분화 목적',
    action: '• 유리·금속·플라스틱·스티로폼 등 재질 구분\n• 병·부표·로프·어망·박스·파편 등 형태 구분\n• 수거 우선순위와 종류별 통계 활용',
    params: '800px · Batch 2 · AdamW\nlr 0.001 · 최대 150 Epoch',
    augment: 'HSV · 회전 10° · Scale 0.5\nFlip 0.5 · Mosaic 1.0 · MixUp 0.1',
    metrics: { precision: '88.7% / 87.2%', recall: '84.7% / 84.1%', map50: '90.3% / 90.4%', map95: '67.8% / 74.6%' },
    assets: [
      { model: 'YOLOv8s', chart: '/presentation/ai-report/yolov8m-results.png', photo: '/presentation/ai-report/yolov8m-example-03-inference.jpg' },
      { model: 'YOLO11s', chart: '/presentation/ai-report/yolov11s-results.png', photo: '/presentation/ai-report/yolov11s-example-01-inference.jpg' },
    ],
  },
  {
    no: '02',
    label: '두 번째 실험',
    title: '동일 조건 비교',
    summary: '입력·Batch·Optimizer를 통제해 모델 차이 확인',
    dataset: '동일 11개 클래스 · 총 18,710개\n동일 학습·검증 분할 유지',
    classFocus: '동일 클래스와 동일 데이터 분할 유지',
    basisTitle: '1차 학습에서 확인한 한계',
    basis: '• 클래스별 객체 수가 196~7,064개로 불균형\n• 모델별 학습 종료 시점 차이로 비교 기준 불명확',
    actionTitle: '2차 학습 반영 내용',
    action: '• 동일 11개 클래스와 학습·검증 분할 유지\n• 입력 크기·Optimizer·학습 조건 통일\n• 모델 구조에 따른 성능 차이만 비교',
    params: '800px · Batch 4 · AdamW\nlr 0.001 · 최대 150 · Patience 30',
    augment: '기본 증강 조건 유지\n두 모델의 학습 조건 동일화',
    metrics: { precision: '85.09% / 84.88%', recall: '79.45% / 80.46%', map50: '84.16% / 83.78%', map95: '66.18% / 69.29%' },
    assets: [
      { model: 'YOLOv8s', chart: '/presentation/ai-report-round2/yolov8s-results.png', photo: '/presentation/ai-report-round2/yolov8s-pred.jpg', matrix: '/presentation/ai-report-round2/yolov8s-confusion-normalized.png' },
      { model: 'YOLO11s', chart: '/presentation/ai-report-round2/yolov11s-results.png', photo: '/presentation/ai-report-round2/yolov11s-pred.jpg', matrix: '/presentation/ai-report-round2/yolov11s-confusion-normalized.png' },
    ],
  },
  {
    no: '03',
    label: '세 번째 실험',
    title: '증강 조건 재설계',
    summary: '객체 수를 균형화하고 Batch·증강 강도 조정',
    dataset: '11개 클래스 · 총 23,125개\n클래스당 1,306~2,725개로 균형화',
    classFocus: '클래스별 객체 수를 균형 있게 재구성',
    basisTitle: '2차 학습에서 확인한 한계',
    basis: '• 두 모델 Recall이 약 80% 수준에 머묾\n• 데이터가 적은 취약 클래스의 미탐지 지속',
    actionTitle: '3차 학습 반영 내용',
    action: '• 총 객체를 23,125개로 확대하고 클래스 균형화\n• Batch 8·cls 1.0으로 학습 집중도 조정\n• Scale을 0.2로 낮춰 과도한 변형 완화',
    params: '800px · Batch 8 · 100 Epoch\nAdamW · lr 0.001 · cls 1.0',
    augment: '회전 10° · Scale 0.2 · 상하/좌우 반전\nMosaic 1.0 · MixUp 0.1',
    metrics: { precision: '92.08% / 92.74%', recall: '89.64% / 88.46%', map50: '94.36% / 93.83%', map95: '81.52% / 82.06%' },
    assets: [
      { model: 'YOLOv8s', chart: '/presentation/ai-iteration-round3/yolov8s_target90-7/results.png', photo: '/presentation/ai-iteration-round3/yolov8s_target90-7/val_batch0_pred.jpg', matrix: '/presentation/ai-iteration-round3/yolov8s_target90-7/confusion_matrix_normalized.png' },
      { model: 'YOLO11s', chart: '/presentation/ai-iteration-round3/yolo11s_target90-2/results.png', photo: '/presentation/ai-iteration-round3/yolo11s_target90-2/val_batch0_pred.jpg', matrix: '/presentation/ai-iteration-round3/yolo11s_target90-2/confusion_matrix_normalized.png' },
    ],
    active: true,
  },
  {
    no: '04',
    label: '네 번째 실험',
    title: 'Recall 90% 완성',
    summary: '취약 클래스 미탐지를 줄이고 반복 재현성 검증',
    dataset: '3차 혼동행렬 기준 취약 클래스 선정\n미탐지 표본 추가 · 라벨 재점검',
    classFocus: '취약 클래스의 미탐지 표본 집중 보강',
    basisTitle: '3차 학습에서 확인한 한계',
    basis: '• Recall이 90% 목표에 근접했으나 미달\n• 혼동 행렬에서 일부 취약 클래스의 미탐지 잔존',
    actionTitle: '4차 학습 반영 계획',
    action: '• 취약 클래스 미탐지 표본 추가 및 라벨 재점검\n• 과도한 증강을 줄여 일반화 성능 확인\n• 다중 Seed 반복 학습으로 재현성 검증',
    params: '3차 최적 조건을 기준으로 고정\n동일 조건 다중 Seed 반복 학습',
    augment: '취약 클래스 중심 선택 증강\n과도한 변형은 축소해 일반화 검증',
    metrics: { precision: '검증 예정', recall: '목표 90% 이상', map50: '검증 예정', map95: '검증 예정' },
    next: true,
  },
];

const metricValues = (value: string) => {
  const values = value.split(' / ');
  return values.length === 2 ? values : [value, value];
};

export function AiTrainingJourneySlide({ rounds, chapter, title, subtitle, pageNumber, modelNames, defaultIndex = 0 }: {
  rounds: ExperimentRound[];
  chapter: string;
  title: string;
  subtitle: string;
  pageNumber: number;
  modelNames: [string, string];
  defaultIndex?: number;
}) {
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const [resultView, setResultView] = useState<ResultView>('details');
  const [expandedImage, setExpandedImage] = useState<{ src: string; model: string; label: string } | null>(null);
  const selectedRound = rounds[selectedIndex];
  const hasCharts = selectedRound.assets?.some((asset) => asset.chart) ?? false;
  const hasPhotos = selectedRound.assets?.some((asset) => asset.photo) ?? false;
  const hasMatrices = selectedRound.assets?.some((asset) => asset.matrix) ?? false;
  const completedRatio = Math.round((rounds.filter((round) => !round.next && !round.partial).length / rounds.length) * 100);
  const selectRound = (index: number) => {
    setSelectedIndex(index);
    setResultView('details');
    setExpandedImage(null);
  };

  return (
    <div className={styles.slide}>
      <div className={styles.logo}><span className={styles.logoMark}>Float</span><span className={styles.logoAccent}>W</span><span className={styles.logoText}>atch</span></div>
      <div className={styles.content} style={{ justifyContent: 'flex-start', paddingTop: 86, paddingBottom: 28 }}>
        <div className={styles.chapterBadge}>{chapter}</div>
        <h1 className={styles.slideTitle} style={{ marginBottom: 0 }}>{title}</h1>
        <p className={styles.slideSubtitle} style={{ margin: '7px 0 14px', maxWidth: 1240, color: '#344e4c', fontSize: 17, fontWeight: 700 }}>
          {subtitle}
        </p>

        <div style={{ position: 'relative', width: '100%', marginTop: 4 }}>
          <div style={{ position: 'absolute', left: 54, right: 54, top: 27, height: 3, borderRadius: 3, background: `linear-gradient(90deg,#e56b3f 0%,#e56b3f ${completedRatio}%,#7ca4a1 ${completedRatio}%,#7ca4a1 100%)` }} />
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${rounds.length},1fr)`, gap: 14 }}>
            {rounds.map((round, index) => {
              const selected = selectedIndex === index;
              return <button key={round.no} data-nav="true" type="button" onClick={(event) => { event.stopPropagation(); selectRound(index); }} style={{ position: 'relative', height: 118, padding: '52px 18px 14px', textAlign: 'left', border: selected ? `2px solid ${round.next ? '#5f918d' : '#e56b3f'}` : '1px solid #cad8d9', borderRadius: 14, background: selected ? (round.next ? '#edf5f4' : '#fff5f0') : 'rgba(255,255,255,.78)', boxShadow: selected ? '0 10px 25px rgba(83,73,61,.12)' : 'none', cursor: 'pointer' }}>
                <span style={{ position: 'absolute', zIndex: 2, top: 10, left: 17, width: 34, height: 34, display: 'grid', placeItems: 'center', border: `4px solid ${round.next ? '#6d9996' : '#e56b3f'}`, borderRadius: '50%', background: selected ? (round.next ? '#edf5f4' : '#fff5f0') : '#f2f6f5', color: round.next ? '#376f6b' : '#cf542e', fontSize: 11, fontWeight: 950, boxShadow: '0 0 0 5px #f2f6f5' }}>{round.no}</span>
                <span style={{ display: 'block', color: round.next || round.partial ? '#397773' : '#8a9a9d', fontSize: 10.5, fontWeight: 900, letterSpacing: .5 }}>{round.next ? 'NEXT · 예정' : round.partial ? 'IN PROGRESS · 진행 중' : 'TRAINING · 완료'}</span>
                <strong style={{ display: 'block', marginTop: 5, color: '#142f31', fontSize: 20, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{index + 1}차 학습</strong>
                <span style={{ position: 'absolute', right: 15, bottom: 15, color: selected ? (round.next ? '#397773' : '#e56b3f') : '#9aabad', fontSize: 17, fontWeight: 900 }}>{selected ? '●' : '○'}</span>
              </button>;
            })}
          </div>
        </div>

        <section data-nav="true" onClick={(event) => event.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: '370px 1fr', width: '100%', height: 395, marginTop: 16, overflow: 'hidden', border: '1px solid #c8d7d8', borderRadius: 18, background: 'rgba(255,255,255,.92)', boxShadow: '0 16px 34px rgba(30,59,60,.09)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '22px 29px 12px', boxSizing: 'border-box', background: selectedRound.next ? '#eaf3f2' : '#263f50', color: '#fff' }}>
            <small style={{ color: selectedRound.next ? '#397773' : '#ff9a74', fontSize: 12, fontWeight: 950, letterSpacing: 1.1 }}>{selectedRound.label} · {selectedRound.next ? 'NEXT EXPERIMENT' : 'SELECTED EXPERIMENT'}</small>
            <div style={{ height: 1, margin: '13px 0 5px', background: selectedRound.next ? '#bfd4d1' : 'rgba(255,255,255,.18)' }} />
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(3,1fr)', flex: 1, marginTop: 5, overflow: 'hidden', borderTop: `1px solid ${selectedRound.next ? '#bfd4d1' : 'rgba(255,255,255,.14)'}` }}>
              {[
                ['01', 'CLASS', '클래스 구성', selectedRound.dataset, '#91bbc3'],
                ['02', 'PARAMETERS', '하이퍼파라미터', selectedRound.params, '#65c4c5'],
                ['03', 'AUGMENTATION', '데이터 증강', selectedRound.augment, '#ff9a74'],
              ].map(([no,en,title,text,accent], index) => <div key={no} style={{ display: 'grid', gridTemplateColumns: '105px 1fr', gap: 15, alignItems: 'center', minHeight: 88, padding: '10px 0', boxSizing: 'border-box', borderBottom: index === 2 ? 'none' : `1px solid ${selectedRound.next ? '#bfd4d1' : 'rgba(255,255,255,.14)'}` }}>
                <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 11, borderLeft: `3px solid ${accent}` }}><small style={{ color: selectedRound.next && index !== 2 ? '#397773' : accent, fontSize: 9, fontWeight: 950, letterSpacing: .9 }}>{no} · {en}</small><strong style={{ display: 'block', marginTop: 5, color: selectedRound.next ? '#173b3a' : '#fff', fontSize: 14.5, lineHeight: 1.2 }}>{title}</strong></div>
                <span style={{ display: 'block', whiteSpace: 'pre-line', color: selectedRound.next ? '#355856' : '#edf4f5', fontSize: 13, fontWeight: 780, lineHeight: 1.45 }}>{text}</span>
              </div>)}
            </div>
          </div>

          <div style={{ minWidth: 0, padding: '20px 22px 22px' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 42, marginBottom: 14 }}>
              <div><small style={{ color: '#71878a', fontSize: 10.5, fontWeight: 900, letterSpacing: 1 }}>EXPERIMENT INFORMATION</small><strong style={{ display: 'block', marginTop: 2, color: '#17363b', fontSize: 19 }}>{resultView === 'details' ? '실험 조건과 결과' : resultView === 'charts' ? '학습 그래프 비교' : resultView === 'photos' ? '검증 예측 비교' : '혼동 행렬 비교'}</strong></div>
              <nav style={{ display: 'flex', gap: 5, padding: 4, borderRadius: 10, background: '#e9eff0' }}>
                {([['details','설정'],...(hasCharts ? [['charts','그래프'] as const] : []),...(hasPhotos ? [['photos','예측 사진'] as const] : []),...(hasMatrices ? [['matrix','혼동 행렬'] as const] : [])] as [ResultView,string][]).map(([view,label]) => <button key={view} data-nav="true" type="button" onClick={() => setResultView(view)} style={{ minWidth: view === 'details' ? 66 : 84, height: 32, padding: '0 12px', border: 0, borderRadius: 7, background: resultView === view ? '#315d76' : 'transparent', color: resultView === view ? '#fff' : '#526970', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>{label}</button>)}
              </nav>
            </header>
            {resultView === 'details' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.08fr', gap: 14, height: 295 }}>
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 11 }}>
                {[
                  ['01 · BASIS', selectedRound.basisTitle, selectedRound.basis, '#087f8c'],
                  ['02 · IMPROVEMENT', selectedRound.actionTitle, selectedRound.action, '#b9502e'],
                ].map(([en,title,text,accent]) => <div key={en} style={{ padding: '17px 19px', borderLeft: `4px solid ${accent}`, borderRadius: 9, background: '#f2f5f5' }}><small style={{ color: accent, fontSize: 9.5, fontWeight: 950, letterSpacing: .8 }}>{en}</small><strong style={{ display: 'block', margin: '5px 0 7px', color: '#17363b', fontSize: 16 }}>{title}</strong><span style={{ whiteSpace: 'pre-line', color: '#355156', fontSize: 13.5, fontWeight: 750, lineHeight: 1.5 }}>{text}</span></div>)}
              </div>
              <div style={{ padding: '18px 19px', borderLeft: '4px solid #263f50', borderRadius: 9, background: '#eef2f3' }}>
                <small style={{ color: '#263f50', fontSize: 9.5, fontWeight: 950, letterSpacing: .8 }}>03 · PERFORMANCE</small>
                <strong style={{ display: 'block', margin: '5px 0 12px', color: '#17363b', fontSize: 18 }}>모델별 성능 비교</strong>
                <div style={{ overflow: 'hidden', border: '1px solid #d2dddf', borderRadius: 9, background: '#fff' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr 1fr', minHeight: 38, alignItems: 'center', background: '#263f50', color: '#fff' }}><span style={{ paddingLeft: 12, color: '#bcd0d5', fontSize: 9.5, fontWeight: 900, letterSpacing: .6 }}>METRIC</span><strong style={{ color: '#a9d6dc', fontSize: 12.5, textAlign: 'center' }}>{modelNames[0]}</strong><strong style={{ color: '#ffad8e', fontSize: 12.5, textAlign: 'center' }}>{modelNames[1]}</strong></div>
                  {[['Precision', selectedRound.metrics.precision], ['Recall', selectedRound.metrics.recall], ['mAP50', selectedRound.metrics.map50], ['mAP50–95', selectedRound.metrics.map95]].map(([label,value], index) => {
                    const [v8, v11] = metricValues(value);
                    return <div key={label} style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr 1fr', minHeight: 43, alignItems: 'center', borderTop: index === 0 ? 'none' : '1px solid #e0e7e8', background: index % 2 ? '#f7f9f9' : '#fff' }}><strong style={{ paddingLeft: 12, color: '#4f696f', fontSize: 11.5 }}>{label}</strong><b style={{ color: '#176f7a', fontSize: 12.5, textAlign: 'center' }}>{v8}</b><b style={{ color: '#a84e30', fontSize: 12.5, textAlign: 'center' }}>{v11}</b></div>;
                  })}
                </div>
              </div>
            </div> : selectedRound.assets && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${selectedRound.assets.length},1fr)`, gap: 14, height: 295 }}>
              {selectedRound.assets.map((asset) => {
                const imageSrc = resultView === 'charts' ? asset.chart : resultView === 'photos' ? asset.photo : asset.matrix;
                const imageLabel = resultView === 'charts' ? '그래프' : resultView === 'photos' ? '예측 사진' : '혼동 행렬';
                return <figure key={asset.model} onClick={() => imageSrc && setExpandedImage({ src: imageSrc, model: asset.model, label: imageLabel })} style={{ display: 'grid', gridTemplateRows: '38px 1fr', minWidth: 0, minHeight: 0, margin: 0, overflow: 'hidden', border: '1px solid #cbd8dc', borderRadius: 10, background: '#fff', cursor: imageSrc ? 'zoom-in' : 'default' }}>
                  <figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #d8e1e3' }}><strong style={{ color: '#183741', fontSize: 15 }}>{asset.model}</strong><span style={{ color: '#718388', fontSize: 9, fontWeight: 900 }}>{resultView === 'charts' ? 'TRAINING RESULT' : resultView === 'photos' ? 'MODEL PREDICTION' : 'NORMALIZED MATRIX'}</span></figcaption>
                  <div style={{ position: 'relative', minWidth: 0, minHeight: 0, display: 'grid', placeItems: 'center', padding: 8, background: resultView === 'photos' ? '#13272e' : '#fff' }}>{imageSrc ? <><img src={imageSrc} alt={`${selectedRound.label} ${asset.model} ${imageLabel}`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}/><span style={{ position: 'absolute', right: 12, bottom: 12, padding: '5px 8px', borderRadius: 7, background: 'rgba(20,43,52,.82)', color: '#fff', fontSize: 10, fontWeight: 900 }}>클릭하여 확대</span></> : <div style={{ textAlign: 'center', color: resultView === 'photos' ? '#cad8db' : '#6f8589' }}><strong style={{ display: 'block', fontSize: 16 }}>결과 추가 예정</strong><span style={{ display: 'block', marginTop: 7, fontSize: 11.5, fontWeight: 750 }}>{asset.model} 2차 학습 자료 대기 중</span></div>}</div>
                </figure>;
              })}
            </div>}
          </div>
        </section>
      </div>
      {expandedImage && <div data-nav="true" onClick={(event) => { event.stopPropagation(); setExpandedImage(null); }} style={{ position: 'absolute', zIndex: 80, inset: 0, display: 'grid', placeItems: 'center', padding: 34, boxSizing: 'border-box', background: 'rgba(9,22,28,.88)', backdropFilter: 'blur(7px)', cursor: 'zoom-out' }}>
        <figure data-nav="true" onClick={(event) => event.stopPropagation()} style={{ display: 'grid', gridTemplateRows: '58px 1fr', width: 'min(1320px,94vw)', height: 'min(730px,90vh)', margin: 0, overflow: 'hidden', border: '1px solid rgba(255,255,255,.25)', borderRadius: 18, background: '#f7f9f8', boxShadow: '0 28px 80px rgba(0,0,0,.45)', cursor: 'default' }}>
          <figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px 0 22px', borderBottom: '1px solid #d5dfe1' }}><div><strong style={{ color: '#173943', fontSize: 19 }}>{expandedImage.model}</strong><span style={{ marginLeft: 10, color: '#687f84', fontSize: 12, fontWeight: 850 }}>{selectedRound.label} · {expandedImage.label}</span></div><button data-nav="true" type="button" onClick={() => setExpandedImage(null)} aria-label="확대 이미지 닫기" style={{ width: 38, height: 38, border: 0, borderRadius: '50%', background: '#263f50', color: '#fff', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>×</button></figcaption>
          <div style={{ minWidth: 0, minHeight: 0, padding: 16, background: expandedImage.label === '예측 사진' ? '#13272e' : '#fff' }}><img src={expandedImage.src} alt={`${expandedImage.model} ${expandedImage.label} 확대 이미지`} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}/></div>
        </figure>
      </div>}
      <div className={styles.pageNumber}>{pageNumber}</div>
    </div>
  );
}

export default function AiIterationStorySlide() {
  return <AiTrainingJourneySlide
    rounds={defaultRounds}
    chapter="AI Report · Experiment Journey"
    title="YOLOv8s·YOLO11s 학습 개선 과정"
    subtitle="각 실험은 가중치를 이어받지 않고 독립적으로 학습했으며, 이전 결과에서 확인한 한계를 다음 데이터·학습 조건에 반영했습니다."
    pageNumber={9}
    modelNames={['YOLOv8s', 'YOLO11s']}
    defaultIndex={2}
  />;
}
