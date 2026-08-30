# FloatWatch

Operational backup and restore commands are documented in [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).

YOLOv8/YOLO11 `.pt` 모델로 부유물 동영상을 분석하고 결과 영상과 통계를 기록하는 로컬 MVP입니다.

## 구성

- Frontend: Next.js, TypeScript, Recharts
- Backend: FastAPI, SQLAlchemy, SQLite, Ultralytics, OpenCV
- Auth: 서버 세션 + HttpOnly 쿠키
- Inference: CPU 기반 detection/segmentation 자동 지원

## 사용자 영역

- 공개 메인: 서비스 안내, 공지사항, 자유게시판, FAQ
- 일반 사용자: 영상 분석, 본인 분석 기록, 자유게시판 작성, 비공개 1:1 문의
- 관리자: 회원 권한/상태, 전체 분석 기록, 게시글, 공지, FAQ, 1:1 문의 답변 관리

기존 관리자 계정이 없으면 가장 먼저 가입한 계정이 관리자로 지정됩니다. 기존 DB에 일반 사용자만 있는 경우에는 가장 먼저 가입한 사용자가 시작 시 관리자로 승격됩니다.

## 실행

### Backend

Python 3.11 또는 3.12 설치 후:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`에 접속합니다.

## 테스트

백엔드 API 테스트는 운영 데이터와 분리된 임시 SQLite 데이터베이스와 임시 저장소를 사용합니다.

```powershell
cd backend
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m pytest
```

## 지표 해석

현재 영상에 정답 라벨이 없으므로 정확도 지표인 mAP, Precision, Recall은 계산하지 않습니다. 대신 모델별 처리 FPS, 프레임별 탐지 건수, 평균 신뢰도, 클래스 분포를 제공합니다. 탐지 건수는 프레임별 검출 합계이며 고유 객체 수가 아닙니다.

`.pt`는 Python 객체를 포함할 수 있으므로 신뢰할 수 있는 모델만 업로드해야 합니다.
확장자와 기본 파일 크기는 등록 단계에서 검사하지만, 임의의 `.pt` 파일을 안전한 모델로 판별하지는 못합니다. 외부 사용자에게 서비스를 공개할 때는 추론 전용 계정 또는 격리된 실행 환경을 구성해야 합니다.

CPU 분석은 서버 내부 단일 대기열에서 한 건씩 처리됩니다. 서버가 재시작되면 처리 중이던 작업은 실패로 정리되고, 아직 시작되지 않은 대기 작업은 다시 대기열에 등록됩니다. 로컬 시연 서버는 여러 Uvicorn worker를 사용하지 않고 단일 프로세스로 실행해야 합니다.

기본 사용자 저장공간은 모델과 분석 미디어를 합쳐 5GB이며 `.env`의 `USER_STORAGE_LIMIT_BYTES`로 조정할 수 있습니다. 기본 미디어 제한은 최대 4K 픽셀 수와 60분이며 `MAX_MEDIA_PIXELS`, `MAX_VIDEO_DURATION_SECONDS`로 변경할 수 있습니다.

업로드와 분석 결과 저장 시 최소 디스크 여유 공간을 확인합니다. 기본 예약 공간은 512MB이며 `MIN_FREE_DISK_BYTES`로 변경할 수 있습니다. 동영상 분석은 중간 파일과 최종 파일이 함께 생성될 수 있어 원본 크기의 3배를 예상 공간으로 계산하며 `ANALYSIS_DISK_MULTIPLIER`로 조정할 수 있습니다.
