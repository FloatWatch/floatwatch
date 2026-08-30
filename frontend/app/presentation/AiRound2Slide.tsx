import AiExperimentReportSlide, { type ExperimentModel } from './AiExperimentReportSlide';

const models: ExperimentModel[] = [
  { id:'yolov8s', name:'YOLOv8s', round:'2차 학습', epochs:'88', precision:'85.09%', recall:'79.45%', map50:'84.16%', map95:'66.18%', prefix:'yolov8s' },
  { id:'yolov11s', name:'YOLO11s', round:'2차 학습', epochs:'141', precision:'84.88%', recall:'80.46%', map50:'83.78%', map95:'69.29%', prefix:'yolov11s' },
];

export default function AiRound2Slide(){return <AiExperimentReportSlide chapter="AI Report A · 2차 학습" title="YOLOv8s · YOLO11s 2차 학습" subtitle="동일 데이터셋과 학습 조건에서 두 경량 모델의 탐지 성능과 오분류 패턴을 비교했습니다." models={models}
 setup={['동일 데이터셋·학습/검증 분할','입력 800px · Batch 4','AdamW · lr 0.001','최대 150 Epoch · Patience 30']}
 result={['YOLOv8s · P 85.09% · mAP50 84.16%','YOLO11s · R 80.46% · mAP50–95 69.29%','두 모델 모두 2차 학습 성능 확보']}
 feedback={['YOLOv8s는 정밀도·mAP50 소폭 우세','YOLO11s는 재현율·mAP50–95 우세','혼동 행렬로 취약 클래스 재확인 필요']}
 nextPlan={['취약·소수 클래스 데이터 보강','클래스 균형 기반 증강 조건 조정','동일 미디어로 정확도·속도 재검증']}
 pageNumber={11}/>}
