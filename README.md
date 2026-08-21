# OpsTriage

장애 증상과 로그를 입력하면 AI가 가능한 원인, 우선 확인 항목, 완화 방안과 팀 공유용 장애 공지 초안을 구조화하여 제공하는 DevOps 지원 웹 서비스입니다.

> 반응형 프론트엔드와 Python 백엔드 API가 구현되었으며 Vercel 배포를 진행할 예정입니다.

## 주요 기능

- 장애 증상, 로그와 최근 변경 사항 입력
- AI 기반 장애 상황 요약과 심각도 제안
- 가능한 원인과 판단 근거 제시
- 우선 확인 항목과 완화 또는 롤백 방안 제공
- 팀 공유용 장애 공지 초안 생성
- 분석 결과 복사
- 시스템 설정 연동 및 사용자 선택 저장을 지원하는 다크 모드
- 모바일, 태블릿과 데스크톱 반응형 화면

## 기술 스택

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Python, Vercel Serverless Functions
- AI: OpenAI Responses API, Structured Outputs
- Deployment: Vercel
- Version Control: GitHub

## 프로젝트 구조

```text
opstriage/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── api/
│   ├── _core.py
│   └── analyze.py
├── images/
├── evidence/
├── README.md
├── SERVICE_PLAN.md
├── .python-version
├── pyproject.toml
├── requirements.txt
├── tests/
│   ├── test_analyze.py
│   ├── test_handler.py
│   └── test_openai_sdk_contract.py
├── vercel.json
└── .gitignore
```

## 로컬 실행

1. 저장소를 복제합니다.
2. Python 가상 환경을 만들고 활성화합니다.

   ```bash
   python3.12 -m venv .venv
   source .venv/bin/activate
   python --version  # Python 3.12.x 확인
   ```

3. 필요한 패키지를 설치합니다.

   ```bash
   python -m pip install -r requirements.txt
   ```

4. `.env.example`을 참고해 로컬 환경 변수 파일을 만듭니다.

   ```bash
   cp .env.example .env
   ```

5. Vercel CLI 개발 서버에서 프론트엔드와 Python API를 함께 실행합니다.

   ```bash
   vercel dev --listen 3001
   ```

API 엔드포인트는 `POST /api/analyze`입니다.

요청 예시:

```bash
curl -X POST http://localhost:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "service_name": "Payment API",
    "environment": "Production",
    "symptom": "배포 직후 결제 요청에서 502 오류가 증가했습니다.",
    "logs": "upstream timed out while reading response header from upstream",
    "recent_changes": "30분 전에 새 버전을 배포했습니다."
  }'
```

## 테스트

```bash
python3 -m unittest discover -s tests -v
node --check js/app.js
```

## 환경 변수

```text
OPENAI_API_KEY=발급받은_API_키
OPENAI_MODEL=gpt-5.4-mini
```

API 키는 로컬 환경 파일과 Vercel 환경 변수에만 저장해야 합니다. 코드, GitHub 저장소, README와 스크린샷에는 실제 키를 기록하지 않습니다.

## 화면 테마

- 최초 방문 시 운영체제의 라이트·다크 모드 설정을 따릅니다.
- 상단 테마 버튼으로 언제든 직접 전환할 수 있습니다.
- 직접 선택한 테마는 현재 브라우저에 저장되어 다음 방문에도 유지됩니다.
- 테마 설정 외의 사용자 정보는 브라우저 저장소에 기록하지 않습니다.

## 배포

- Vercel URL: 배포 완료 후 입력
- GitHub 저장소: 저장소 공개 또는 제출 준비 후 입력

## 문서

상세한 서비스 목적, 사용자, 기능, API 계약, 실패 처리와 테스트 계획은 `SERVICE_PLAN.md`에서 확인할 수 있습니다.

## 주의사항

OpsTriage의 분석 결과는 운영자의 판단을 돕는 참고 정보입니다. 서비스가 실제 시스템을 직접 변경하거나 명령어를 자동 실행하지 않으며, 모든 운영 변경은 담당자가 실제 상태를 확인한 뒤 수행해야 합니다.
