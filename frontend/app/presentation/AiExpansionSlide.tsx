import AiExperimentReportSlide, { type ExperimentModel } from './AiExperimentReportSlide';

const models: ExperimentModel[] = [
  { id:'yolov26s', name:'YOLO26s', round:'증강 데이터 실험', epochs:'106', precision:'86.10%', recall:'79.82%', map50:'84.30%', map95:'69.50%', prefix:'yolov26s' },
  { id:'rtdetr', name:'RT-DETR-L', round:'증강 데이터 실험', epochs:'150', precision:'88.88%', recall:'81.37%', map50:'85.45%', map95:'64.67%', prefix:'rtdetr' },
];

export default function AiExpansionSlide(){return <AiExperimentReportSlide chapter="AI Report B · 확장 모델" title="YOLO26s · RT-DETR-L 실험" subtitle="6배 증강 데이터셋을 적용해 최신 YOLO 계열과 Transformer 기반 탐지 모델의 특성을 확인했습니다." models={models}
 setup={['6배 증강 데이터셋·동일 분할','입력 800px · Batch 4','AdamW · lr 0.001','Mosaic 1.0 · MixUp 0.1']}
 result={['RT-DETR-L · P 88.88% · R 81.37%','RT-DETR-L · mAP50 85.45%','YOLO26s · mAP50–95 69.50%']}
 feedback={['RT-DETR-L은 분류·탐지 지표 전반 우세','YOLO26s는 경계 정밀도 지표 우세','모델 크기·처리 속도 검증이 추가로 필요']}
 nextPlan={['동일 미디어로 4개 모델 교차 검증','FPS·메모리·추론 지연 함께 측정','취약 클래스 보강 후 조건별 재학습']}
 pageNumber={11}/>}
