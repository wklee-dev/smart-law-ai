# Phase 1 — legal_document 통합 + 행정규칙 본문 OPEN API

> 작성: 2026-09-02  
> 범위: Supabase 논리 스키마 초안, `/law-admrul-api` 화면·API, 크롤 `doc_type` 정리, ingest·중복 제거 규칙  
> **기존 DB/화면은 유지** — 신규 계층을 **위에 얹는** 방식 (openlaw_* ↔ law_* 매핑 금지 원칙 유지)

---

## 1. 목표

| # | 목표 | 완료 기준 |
|---|------|-----------|
| 1 | 행정규칙 본문 OPEN API UI | `/law-admrul-api`에서 목록→본문→저장→(선택)임베딩 |
| 2 | 논리 통합 스키마 | `legal_document` / `legal_chunk` Supabase 테이블 + ingest API |
| 3 | 크롤 혼재 정리 | `admin-rules-table-catalog`에 `doc_type` 부여, UI 필터 |
| 4 | 벡터 단일 진입 | admrul API 저장 시 `admrul_chunks` + `legal_chunk` 동시 기록 (Phase 1) |

---

## 2. 현재 vs Phase 1

```
[현재]
  법령 OPEN API ──► smart_law_ai.db (openlaw_*, law_* 분리)
  행정규칙 크롤 ──► admin_rules.db / Supabase admin_rule*
  행정규칙 API  ──► admrul_snapshots/chunks (UI 없음, /law-admrul-api placeholder)
  RAG           ──► admin_rule_chunks + smartlaw_chunk (이중)

[Phase 1 후]
  행정규칙 API  ──► admrul_* (유지) + legal_document/legal_chunk (신규)
  크롤          ──► doc_type 메타 + (Phase 2) legal_document ingest
  조회/RAG      ──► legal_chunk RPC 하나로 확장 (Phase 2), Phase 1은 admrul만 연동
```

---

## 3. Supabase 스키마 초안

파일: `supabase/migrations/YYYYMMDD_legal_document_phase1.sql`

### 3.1 `legal_document` — 논리 문서 1건

```sql
create type public.legal_doc_type as enum (
  'law',           -- 법령 (eflaw 등)
  'admrul',        -- 행정규칙
  'law_decree',    -- 시행령 (크롤 catalog param d,e,h)
  'law_rule',      -- 시행규칙
  'portal_raw',    -- 관세법령정보포털 raw_rule
  'hs',            -- HS (Phase 3)
  'tariff',        -- 관세율표 (Phase 3)
  'origin'         -- 원산지 (Phase 3)
);

create type public.legal_ingest_source as enum (
  'openlaw_api',       -- openlaw batch / smart_law_ai.db
  'admrul_open_api',   -- lawService target=admrul
  'admrul_crawl',      -- law.go.kr crawl
  'clip_portal',       -- 관세법령정보포털
  'manual'
);

create table if not exists public.legal_document (
  id bigint generated always as identity primary key,
  doc_type public.legal_doc_type not null,
  ingest_source public.legal_ingest_source not null,

  -- 공통 식별 (출처별 nullable)
  external_id text not null,          -- adm_serial_id | law_id | crawl param
  external_sub_id text,               -- enforce_dt | promulgation_no | table_name
  canonical_key text not null,        -- dedup 키 (아래 §5)

  title_kr text not null,
  ministry_name text,
  enforcement_date text,
  promulgation_date text,
  source_url text,

  -- 원본 연결 (ETL/매핑 아님, 포인터만)
  source_table text,                  -- e.g. admrul_snapshots
  source_row_id bigint,

  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (canonical_key)
);

create index idx_legal_document_type on public.legal_document(doc_type);
create index idx_legal_document_external on public.legal_document(external_id);
```

### 3.2 `legal_chunk` — RAG 통합 청크

```sql
create table if not exists public.legal_chunk (
  id bigint generated always as identity primary key,
  legal_document_id bigint not null references public.legal_document(id) on delete cascade,

  source_type text not null,          -- article | addendum | annex | list_item ...
  source_key text not null,
  source_title text,
  chunk_text text not null,
  chunk_index int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768),

  -- 역추적 (기존 테이블과 공존)
  legacy_table text,                  -- admrul_chunks | admin_rule_chunks | ...
  legacy_row_id bigint,

  created_at timestamptz not null default now()
);

create index idx_legal_chunk_document on public.legal_chunk(legal_document_id);
create index idx_legal_chunk_legacy on public.legal_chunk(legacy_table, legacy_row_id);

create or replace function match_legal_chunks(
  query_embedding vector(768),
  match_count int default 8,
  filter_doc_types public.legal_doc_type[] default null,
  filter_domain text default null,   -- metadata->>'domain' : law|admrul|hs|...
  min_similarity float default 0.45
)
returns table (
  id bigint,
  legal_document_id bigint,
  chunk_text text,
  source_title text,
  metadata jsonb,
  similarity float
)
language sql stable as $$
  select
    c.id,
    c.legal_document_id,
    c.chunk_text,
    c.source_title,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from legal_chunk c
  join legal_document d on d.id = c.legal_document_id
  where c.embedding is not null
    and (filter_doc_types is null or d.doc_type = any(filter_doc_types))
    and (
      filter_domain is null
      or (c.metadata->>'domain') = filter_domain
    )
    and (
      coalesce(min_similarity, 0.45) < 0
      or (1 - (c.embedding <=> query_embedding))::float > coalesce(min_similarity, 0.45)
    )
  order by c.embedding <=> query_embedding
  limit least(coalesce(match_count, 8), 32);
$$;
```

### 3.3 Phase 1 ingest 범위

- **연동 대상:** `admrul_open_api` 만 (`/api/law-admrul/save` 확장)
- **미연동 (Phase 2):** openlaw_*, admin_rule crawl, raw_rule

---

## 4. 크롤 카탈로그 `doc_type` (즉시 적용 가능)

파일: `app/lib/admin-rules-table-catalog.ts`

| param | description | URL 패턴 | `doc_type` | `storage_family` |
|-------|-------------|----------|------------|------------------|
| a,b,c,f,g,i,j,k,l,m | 행정규칙·고시 | `/행정규칙/` | `admrul` | `admin_rule` |
| d,e | FTA 시행규칙/시행령 | `/법령/` | `law_decree` / `law_rule` | `raw_rule` |
| h | 관세법 시행규칙 | `/법령/` | `law_rule` | `raw_rule` |

타입 추가:

```typescript
export type AdminRulesDocType =
  | "admrul"
  | "law_decree"
  | "law_rule";

export type AdminRulesTableCatalogEntry = {
  param: string;
  table_name: string;
  description: string;
  law_go_kr_url: string;
  doc_type: AdminRulesDocType;
};
```

UI (`/admin-rules-crawl`): 필터 `[전체 | 행정규칙 | 법령(시행령·규칙)]`

---

## 5. 중복 제거 키 (`canonical_key`)

| ingest_source | canonical_key 형식 | 예 |
|---------------|-------------------|-----|
| admrul_open_api | `admrul:api:{adm_serial_id}:{enforcement_date}` | `admrul:api:12345:20260101` |
| admrul_crawl | `admrul:crawl:{table_name}:{enforcement_date}` | `admrul:crawl:notice_post_management:20260101` |
| openlaw_api | `law:openlaw:{law_id}:{enforce_dt}` | `law:openlaw:591:20240101` |
| clip_portal | `portal:{raw_id}` | Phase 2 |

**규칙:** 동일 `canonical_key` 재저장 시 `legal_document` UPSERT + 새 snapshot/chunk는 append (이력) 또는 `replace` 옵션 (Phase 1은 **append 이력**, 최신 조회는 `updated_at desc`).

---

## 6. `/law-admrul-api` 화면·API 설계

### 6.1 참조 패턴

| 참고 화면 | 재사용 요소 |
|-----------|-------------|
| `/law-admrul-search` | API 관리 목록, lawSearch 파라미터, 저장 플로우 |
| `/api-call` (ApiCallView) | 프록시 호출, JSON 미리보기, 진행률 |
| `/openlaw-inquiry` admrul 탭 | SQLite openlaw 조회 (읽기 전용, 매핑 없음) |

### 6.2 OPEN API 엔드포인트

**목록 (이미 구현):** `/law-admrul-search`

```
GET law.go.kr/DRF/lawSearch.do
  ?OC={LAW_API_OC}
  &target=admrul
  &type=JSON
  &query={행정규칙명}
  &display=...
```

**본문 (Phase 1 구현):**

```
GET law.go.kr/DRF/lawService.do
  ?OC={LAW_API_OC}
  &target=admrul
  &type=JSON
  &ID={행정규칙일련번호}    ← gwanselaw law_id 아님
```

또는 XML:

```
GET .../lawService.do?target=admrul&MST={일련번호}&type=XML
```

응답 루트: `AdmRulService` → `extractAdmrulBasicFields()` (`app/lib/admrul-chunks.ts`)

### 6.3 UI 와이어프레임

```
┌─────────────────────────────────────────────────────────────┐
│ 행정규칙 본문 (OPEN API)                                      │
├─────────────────────────────────────────────────────────────┤
│ [1] 목록에서 선택  │  [2] 직접 입력                          │
│     (admrul_list_items 연동)  │  일련번호 [____]  [목록 API↗] │
├─────────────────────────────────────────────────────────────┤
│ API: [ AdmRulService ▼ ]  OC: ****  [본문 조회]              │
├──────────────────────────┬──────────────────────────────────┤
│ 기본정보                  │ JSON / 조문 미리보기              │
│ · 행정규칙명              │                                  │
│ · 일련번호 / ID           │                                  │
│ · 시행일 / 발령일         │                                  │
├──────────────────────────┴──────────────────────────────────┤
│ [Supabase 저장]  [☑ 저장 후 임베딩]  [legal_document 동기화]   │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 신규·확장 API

| Method | Path | 역할 |
|--------|------|------|
| GET | `/api/law-admrul/config` | OC, service URL (기존 law config 재사용) |
| POST | `/api/law-admrul/fetch` | 서버 프록시 — target=admrul 본문 (CORS·OC 보호) |
| POST | `/api/law-admrul/save` | **기존** — admrul_snapshots + admrul_chunks |
| POST | `/api/law-admrul/save` | **확장** body `{ syncLegalDocument: true }` → §6.5 |
| GET | `/api/law-admrul/list-items` | admrul_list_items 최근 N건 (일련번호 피커) |
| GET | `/api/legal-document/search` | Phase 2 — canonical_key / title 검색 |

### 6.5 `save` 확장 — legal_document 동기화

`app/lib/legal-document-ingest.ts` (신규):

```typescript
export async function ingestAdmrulFromSnapshot(
  supabase: SupabaseClient,
  snapshotId: number,
): Promise<{ legalDocumentId: number; chunkCount: number }> {
  // 1. admrul_snapshots + admrul_chunks 읽기
  // 2. canonical_key = `admrul:api:{serial}:{enforcement_date}`
  // 3. legal_document UPSERT
  // 4. 각 admrul_chunk → legal_chunk INSERT (legacy_table/id 설정)
  // 5. embedding은 admrul_chunks에 있으면 legal_chunk.embedding COPY
}
```

`/api/law-admrul/save` 응답 추가 필드:

```json
{
  "ok": true,
  "snapshotId": 42,
  "chunkCount": 128,
  "embeddedCount": 128,
  "legalDocumentId": 7,
  "canonicalKey": "admrul:api:12345:20260101"
}
```

### 6.6 API 관리 목록 분리

현재 `gwanselaw_list`는 **법령 law_id** 중심 → 행정규칙 본문에 부적합.

Phase 1:

- `app/shared/api-management-list.ts`에 `fileType: "admrul_body"` 추가
- `/law-admrul-api` 전용 API 항목 (AdmRulService JSON/XML)
- **gwanselaw_list 연동 제거** — `admrul_list_items.adm_serial_id` 피커 사용

---

## 7. 구현 파일 목록 (체크리스트)

### 7.1 DB

- [ ] `supabase/migrations/..._legal_document_phase1.sql`
- [ ] `sql/legal_document.sql` (Supabase Editor용 복사본)

### 7.2 서버

- [ ] `app/lib/legal-document-ingest.ts`
- [ ] `app/lib/legal-document-keys.ts` — canonical_key 생성
- [ ] `app/api/law-admrul/fetch/route.ts`
- [ ] `app/api/law-admrul/list-items/route.ts`
- [ ] `app/api/law-admrul/save/route.ts` — syncLegalDocument 옵션
- [ ] `app/lib/admin-rules-table-catalog.ts` — doc_type 필드

### 7.3 UI

- [ ] `app/law-admrul-api/page.tsx` — placeholder 제거
- [ ] `app/components/law-admrul-api-view.tsx` (신규, law-admrul-search 패턴)
- [ ] `app/admin-rules-crawl/page.tsx` — doc_type 필터 (선택)

### 7.4 테스트

- [ ] 일련번호 1건 fetch → save → legal_document 1건 + chunk N건
- [ ] 동일 일련번호 재저장 → snapshot 이력 + legal_document updated_at 갱신
- [ ] match_legal_chunks RPC filter doc_types = `{admrul}`

---

## 8. Phase 2·3 예고 (본 문서 범위外)

| Phase | 내용 |
|-------|------|
| 2 | admin_rule crawl → legal_document ingest; openlaw admrul → ingest; RAG를 match_legal_chunks 단일화 |
| 3 | hs_chunks / tariff_chunks → domain 메타만 통합; smartlaw_chunk와 역할 정리 |

---

## 9. HS · 원산지 · 관세법령정보포털 (변경 없음)

| 영역 | Phase 1 | Phase 3 |
|------|---------|---------|
| HS·관세율·품목분류 | 기존 SQLite + hs_chunks/tariff_chunks 유지 | `legal_chunk.metadata.domain = hs|tariff` |
| 원산지 | fta_psr / ftapass 테이블 유지 | chunk ingest 시 `doc_type=origin` |
| 관세법령정보포털 | raw_rule.db + clip_* 유지 | `doc_type=portal_raw`, dedup 후 admrul과 수동 매핑 |

---

## 10. 의사결정 요약

1. **SQLite 파일 통합 ❌** — 출처별 물리 DB 유지  
2. **Supabase legal_document ✅** — 벡터·검색의 논리 허브  
3. **openlaw_* ↔ law_* 매핑 ❌** — OPENLAW_INQUIRY_PLAN 원칙 유지  
4. **Phase 1 최우선 ✅** — `/law-admrul-api` + admrul → legal_document ingest  
5. **크롤 doc_type ✅** — catalog 메타만 먼저, ingest는 Phase 2  
