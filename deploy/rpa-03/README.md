# RPA-03 웹 배포

**개발 PC에서 패키지를 만들고 → RPA-03에서는 실행만** 합니다.  
패키지에 **주간 크롤러(`scripts/crawlers`) + 토요일 자동 실행** 이 포함됩니다.

## 개발 PC (패키징)

```powershell
cd D:\CursorProject\smart-law-ai
powershell -ExecutionPolicy Bypass -File deploy\rpa-03\pack.ps1
```

결과:
- 폴더: `deploy\rpa-03\dist\smart-law-ai-web\`
- ZIP: `deploy\rpa-03\dist\smart-law-ai-web-날짜.zip`

## RPA-03 (실행만)

사전:
- **Node.js LTS**
- **Python 3** (`python -V`) + 각 크롤러 `requirements.txt` 필요 시 설치
- Postgres, `C:\SQLiteDB` (첨부 + 크롤러용 `smart_law_ai.db`)

```powershell
cd C:\smart-law-ai-web
copy env.example .env.local
notepad .env.local
# SMART_LAW_PG_PASSWORD 만 실제 비밀번호로

start.bat
```

접속: `http://127.0.0.1:3000`  
실행: `start.bat` · 중지: `stop.bat` · 상태: `status.bat` (더블클릭)

### 로그인 · 관리자 (Smart-Law-Hanjoo 통합)

- 모든 화면은 CAS 계정 로그인 필요. 일반 사용자는 Smart-Law-Hanjoo 포털(`/`)만 이용.
- 관리자는 로그인 후 화면 선택(`/portal`) → Hanjoo 포털 또는 smart-law-ai 관리자(`/ai`).
- `.env.local` 필수: `AUTH_SECRET`(임의의 긴 문자열), CAS DB(`CAS_TARGET`, `DB_HOST_LIVE` 등).
- 관리자 지정: 관리자 화면 [관리 > 관리자 등록] (admin 권한만 보임, `wklee` 는 항상 admin).
  CAS 한주(CUST_CD=0000, 사용중) 사용자 중 선택 → 권한 admin/사용자 → 저장.
  저장 파일: `C:\SQLiteDB\smart_law_admin_users.json` (ZIP 덮어써도 유지). 변경은 즉시 반영.
- 주간 크롤 예약작업은 `AUTH_SECRET` 을 토큰으로 보내 로그인 없이 실행됩니다.

### 매주 토요일 자동 크롤 (최초 1회 등록)

```powershell
cd C:\smart-law-ai-web
powershell -ExecutionPolicy Bypass -File .\register-weekly-task.ps1
```

- 작업 이름: `SmartLawAI_WeeklyCrawl_Saturday`
- 기본 일정: **토요일 04:00**
- 동작: 웹 기동 확인 후 `POST /api/crawler-management/weekly` (로그인 불필요 크롤러 순차 실행)

수동 실행:
```powershell
powershell -ExecutionPolicy Bypass -File .\run-weekly-crawl.ps1
```

등록 해제:
```powershell
powershell -ExecutionPolicy Bypass -File .\unregister-weekly-task.ps1
```

> 크롤러는 **SQLite**(`C:\SQLiteDB\smart_law_ai.db`)에 기록하고, 전체 크롤이 끝나면
> 자동으로 **Postgres 반영**(신규·수정 행 upsert)을 실행합니다. 실행 이력: `weekly:pg-sync`,
> 로그: `C:\SQLiteDB\crawler_logs\weekly-pg-sync-*.log`, 상태 테이블: `_sqlite_pg_sync_state`.
>
> 반영만 따로 실행 (웹 기동 중):
> ```powershell
> Invoke-RestMethod -Method Post http://127.0.0.1:3000/api/crawler-management/pg-sync `
>   -Headers @{ "x-smart-law-task-token" = $env:AUTH_SECRET }
> ```
