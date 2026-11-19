# OPEN API 법령 조회 화면 — 구현 계획 (2026-07-15)

> 결정일: 2026-07-14  
> 목표일: **2026-07-15**  
> 상태: **1차 구현 완료 (2026-07-15)** — `/openlaw-inquiry`

## 확정된 방향

- **별도 조회 화면**을 만든다.
- 기존 **일반법령조회**(`laws` / `law_versions` / `law_articles`)와 **매핑·ETL·어댑터 변환하지 않는다**.
- `OPEN API 법령수집`(`law_crawler.py`)이 쌓은 **`openlaw_*` 12개 테이블을 직접 조회**한다.
- 기존 `/general-law-inquiry` · `/api/law-detail-sqlite` 는 **그대로 유지**.

## 데이터 원천

| 항목 | 값 |
|------|-----|
| DB | `D:/SQLiteDB/smart_law_ai.db` (`.env.local` `LAW_DB_PATH`) |
| 스키마 | `scripts/openlawapi/db_init.py` |
| 수집기 | `scripts/openlawapi/law_crawler.py` (12 API) |
| 검증 법령 | 관세사법 `law_id=000591` (이미 수집됨) |

### 테이블 ↔ UI 탭

| 탭 | 목록 | 본문/상세 |
|----|------|-----------|
| 시행일 | `openlaw_efyd_list` | `openlaw_efyd_info` + `openlaw_efyd_jo` |
| 공포일 | `openlaw_nw_list` | `openlaw_nw_info` + `openlaw_nw_jo` |
| 연혁 | `openlaw_hst_list` | `openlaw_hst_info` |
| 행정규칙 | `openlaw_admrul_list` | `openlaw_admrul_info` |
| 신구법 | `openlaw_admrul_oldnew_list` | `openlaw_admrul_oldnew_info` |

식별키는 스키마 PK 그대로:

- 법령 시행일: `(law_id, enforce_dt)`
- 법령 공포일: `(law_id, promul_dt)`
- 조문: `(law_id, enforce_dt|promul_dt, jo_no)`
- 행정규칙: `admrul_seq`
- 신구법: `(admrul_seq, enforce_dt, jo_no)`

법령 ID는 SQLite에 INTEGER(`591`)로 저장되므로, 조회 시 `CAST`로 `000591` / `591` 둘 다 매칭.

## 라우트·메뉴

| 항목 | 값 |
|------|-----|
| 경로 | `/openlaw-inquiry` |
| 메뉴 | **조회 → OPEN API 법령 조회** (`admin-shell.tsx`) |
| 라벨 | `ROUTE_LABELS["/openlaw-inquiry"]` |

기존 「일반법령 조회」와 나란히 둔다.

## 파일 구조 (신규만)

```
app/
  openlaw-inquiry/page.tsx
  components/openlaw-inquiry-view.tsx
  lib/openlaw-sqlite-server.ts          # openlaw_* SELECT 전용 (변환 금지)
  api/openlaw-inquiry/
    laws/route.ts                       # 수집된 법령 목록 (+ 탭별 건수)
    efyd/list/route.ts
    efyd/info/route.ts
    efyd/jo/route.ts
    nw/list|info|jo/route.ts            # 동일 패턴
    hst/list|info/route.ts
    admrul/list|info/route.ts
    oldnew/list|info/route.ts
sql/
  openlaw_조회.sql                      # DBeaver용 (선택)
```

## UI 골격

```
[법령 선택]  gwanselaw_list ∩ openlaw_efyd_info (본문 있는 법령만 추천)
[탭] 시행일 | 공포일 | 연혁 | 행정규칙 | 신구법
┌────────────┬──────────────────────────────────┐
│ 좌: 목록   │ 우: 본문 meta + 조문 목록          │
└────────────┴──────────────────────────────────┘
```

- 조문: 장·절 TOC 없이 `jo_no` 정렬 목록이면 충분.
- 신구법: `old_jo_content` / `new_jo_content` 나란히.

## 법령 목록 소스 (추천)

`gwanselaw_list` LEFT JOIN `openlaw_efyd_info`  
→ API 호출 화면에서 관리·수집한 법령만 표시.

## 구현 순서 (7/15)

1. `openlaw-sqlite-server.ts` — list / info / jo (시행일만)
2. `/api/openlaw-inquiry/laws` + `efyd/*`
3. `openlaw-inquiry-view.tsx` — 시행일 탭, 관세사법으로 검증
4. `admin-shell` 메뉴·라우트 라벨
5. 공포일·연혁·행정규칙·신구법 탭 확장
6. (선택) `sql/openlaw_조회.sql`

## 하지 말 것

- `openlaw_*` → `laws` / `law_articles` ETL
- `GeneralLawInquiryView` / `law-detail-sqlite` 재사용·확장으로 openlaw 붙이기
- `selection_key: law:` / `admrul:` 기존 포맷 강제 재사용 (openlaw 전용 키 사용)

## 관련 맥락 (참고)

- OPEN API 법령수집 성공 판정: `openlaw_efyd_info` 존재
- 진행 표시: NDJSON `/api/openlawapi/fetch` + `OPENLAW_PROGRESS`
- API호출 화면 본문 Y: INTEGER `law_id` 조인 수정 완료
