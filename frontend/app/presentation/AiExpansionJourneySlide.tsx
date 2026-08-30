import { AiTrainingJourneySlide, type ExperimentRound } from './AiIterationStorySlide';

const rounds: ExperimentRound[] = [
  {
    no: '01',
    label: '첫 번째 학습',
    title: '확장 모델 기준 성능',
    summary: '동일 조건에서 YOLO 계열과 Transformer 계열의 기준 성능 비교',
    dataset: '11개 클래스 · 6배 증강 데이터셋\n동일 학습·검증 분할 적용',
    classFocus: '동일 탐지 클래스로 모델 구조 차이 비교',
    basisTitle: '모델 확장 이유',
    basis: '• YOLO 최신 계열과 Transformer 기반 탐지 모델 비교\n• 동일 데이터에서 모델 구조별 장단점 확인',
    actionTitle: '1차 학습 구성',
    action: '• 동일 데이터 분할과 입력 크기 적용\n• 두 모델을 독립적으로 학습해 기준 성능 확보\n• 네 가지 공통 지표와 혼동 행렬로 비교',
    params: '800px · Batch 4 · 최대 150 Epoch\nAdamW · lr 0.001',
    augment: '6배 증강 데이터셋 적용\nMosaic 1.0 · MixUp 0.1',
    metrics: { precision: '86.10% / 88.88%', recall: '79.82% / 81.37%', map50: '84.30% / 85.45%', map95: '69.50% / 64.67%' },
    assets: [
      { model: 'YOLO26s', chart: '/presentation/ai-report-round2/yolov26s-results.png', photo: '/presentation/ai-report-round2/yolov26s-pred.jpg', matrix: '/presentation/ai-report-round2/yolov26s-confusion-normalized.png' },
      { model: 'RT-DETR-L', chart: '/presentation/ai-report-round2/rtdetr-results.png', photo: '/presentation/ai-report-round2/rtdetr-pred.jpg', matrix: '/presentation/ai-report-round2/rtdetr-confusion-normalized.png' },
    ],
  },
  {
    no: '02',
    label: '두 번째 학습',
    title: 'Recall·정밀도 개선',
    summary: '클래스 균형화와 증강 강도 조정으로 두 모델의 2차 성능 개선 검증',
    dataset: '11개 클래스 · 총 23,125개\n클래스당 1,306~2,725개로 균형화',
    classFocus: '취약 클래스의 객체 수 편차 축소',
    basisTitle: '1차 학습에서 확인한 한계',
    basis: '• 1차 Recall이 YOLO26s 79.82%, RT-DETR-L 81.37% 수준\n• 취약 클래스의 미탐지와 데이터 편차 보완 필요',
    actionTitle: '2차 학습 반영 내용',
    action: '• 클래스별 객체 수를 균형 있게 재구성\n• 두 모델 모두 800px·Batch 4·100 Epoch 적용\n• AdamW와 동일 증강 조건으로 구조별 차이 비교',
    params: '800px · Batch 4 · 100 Epoch\nAdamW · lr 0.001 · cls 1.0',
    augment: '회전 10° · Scale 0.2 · Flip 0.2/0.5\nMosaic 1.0 · MixUp 0.1',
    metrics: { precision: '92.79% / 91.50%', recall: '87.88% / 88.63%', map50: '93.67% / 92.95%', map95: '81.35% / 75.28%' },
    assets: [
      { model: 'YOLO26s', chart: '/presentation/ai-iteration-expansion-round2/yolo26s_target90-3/results.png', photo: '/presentation/ai-iteration-expansion-round2/yolo26s_target90-3/val_batch0_pred.jpg', matrix: '/presentation/ai-iteration-expansion-round2/yolo26s_target90-3/confusion_matrix_normalized.png' },
      { model: 'RT-DETR-L', chart: '/presentation/ai-iteration-expansion-round2/rtdetr-l_edge-2/results.png', photo: '/presentation/ai-iteration-expansion-round2/rtdetr-l_edge-2/val_batch0_pred.jpg', matrix: '/presentation/ai-iteration-expansion-round2/rtdetr-l_edge-2/confusion_matrix_normalized.png' },
    ],
  },
  {
    no: '03',
    label: '세 번째 학습',
    title: '취약 클래스 집중 보강',
    summary: '혼동행렬 기반 미탐지 보완과 반복 학습으로 Recall 90% 이상 검증',
    dataset: '2차 혼동행렬 기준 취약 표본 보강\nRope·Styrofoam Piece·배경 오탐 집중 점검',
    classFocus: 'Rope 87% · Styrofoam Piece 82% 취약 구간 개선',
    basisTitle: '2차 학습에서 확인한 한계',
    basis: '• RT-DETR-L Recall은 88.63%로 목표 90%에 근접\n• Rope와 Styrofoam Piece의 미탐지·혼동 잔존',
    actionTitle: '3차 학습 반영 계획',
    action: '• 취약 클래스 표본 추가 및 라벨 재점검\n• 배경으로 누락된 객체와 유사 배경의 오탐 사례 보강\n• 동일 조건 다중 Seed 학습으로 성능 재현성 검증',
    params: '2차 최적 조건 기준 · 800px · Batch 4\n다중 Seed 반복 학습 · 조기 종료 비교',
    augment: '취약 클래스 중심 선택 증강\n과도한 변형 축소 · 유사 배경 표본 추가',
    metrics: { precision: '검증 예정', recall: '목표 90% 이상', map50: '검증 예정', map95: '2차 이상 유지' },
    next: true,
  },
];

export default function AiExpansionJourneySlide() {
  return <AiTrainingJourneySlide
    rounds={rounds}
    chapter="AI Report B · Experiment Journey"
    title="YOLO26s·RT-DETR-L 학습 개선 과정"
    subtitle="클래스 균형과 증강 조건을 조정해 두 모델의 2차 성능을 개선했으며, 다음 학습에서는 취약 클래스 미탐지 보완과 Recall 90% 이상을 검증합니다."
    pageNumber={10}
    modelNames={['YOLO26s', 'RT-DETR-L']}
    defaultIndex={1}
  />;
}
