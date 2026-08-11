# FloatWatch

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

## 지표 해석

현재 영상에 정답 라벨이 없으므로 정확도 지표인 mAP, Precision, Recall은 계산하지 않습니다. 대신 모델별 처리 FPS, 프레임별 탐지 건수, 평균 신뢰도, 클래스 분포를 제공합니다. 탐지 건수는 프레임별 검출 합계이며 고유 객체 수가 아닙니다.

`.pt`는 Python 객체를 포함할 수 있으므로 신뢰할 수 있는 모델만 업로드해야 합니다.
