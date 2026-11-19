# 테이블 상세내역 V1.0

모든 테이블은 기존 사용자 테이블과 분리된 전용 이름입니다. 원문 데이터 네 테이블에 gubun 열과 인덱스를 둡니다. 삭제 또는 기존 스키마 변경 명령은 없습니다.

| 테이블 | 저장 내용 |
| --- | --- |
| llc_v1_meta | 프로그램 소유 표시·스키마 버전 |
| llc_v1_runs | 실행 이력 및 최종 결과 |
| llc_v1_list | 선별 목록과 단계 간 선택 대상 |
| llc_v1_raw_articles | 본문 조문(raw 역할) |
| llc_v1_raw_addendum | 부칙(raw_addendum 역할) |
| llc_v1_raw_annex | 별표·서식 목록(raw_annex 역할) |
| llc_v1_raw_attachment | 첨부파일 상태·경로(raw_attachment 역할) |

## llc_v1_meta
프로그램 소유 표시·스키마 버전.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| key | TEXT | PK1 NOT NULL | 목록 고유 key 또는 설정 식별자 |
| value | TEXT | NOT NULL | 메타 설정값 |

인덱스: PK 인덱스만 사용.

## llc_v1_runs
실행 이력 및 최종 결과.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| run_id | INTEGER | PK1 NULL 허용 | 실행 이력 식별자(자동 증가 정수) |
| stage | TEXT | NOT NULL | list / collect / all |
| options_json | TEXT | NOT NULL | 실행 옵션 JSON |
| status | TEXT | NOT NULL | 실행 completed/partial/no_results/failed 또는 파일 downloaded/existing/format_mismatch/failed |
| stats_json | TEXT | NOT NULL | 건수 집계 JSON |
| error | TEXT | NOT NULL | 실패·형식 경고 사유 |
| started_at | TEXT | NOT NULL | 실행 시작 시각(UTC ISO 8601) |
| ended_at | TEXT | NOT NULL | 실행 종료 시각(진행 중 빈 문자열) |

인덱스: PK 인덱스만 사용.

## llc_v1_list
선별 목록과 단계 간 선택 대상.

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| key | TEXT | PK1 NOT NULL | 목록 고유 key 또는 설정 식별자 |
| category | TEXT | NOT NULL | 공포법령 등 화면 분류 |
| source_id | TEXT | NOT NULL | 공식 법령 식별자 lsiSeq |
| effective_date | TEXT | NOT NULL | 시행일 또는 폐지일(YYYY-MM-DD/미정/빈값) |
| title | TEXT | NOT NULL | 법령·조문·부칙·별표 제목 |
| gubun | TEXT | NOT NULL | 엑셀 gubun 정수 목록의 JSON 배열 |
| source_url | TEXT | NOT NULL | 공식 법령 상세 URL |
| announce_date | TEXT | NOT NULL | 공포일자 |
| expire_date | TEXT | NOT NULL | 실효일자(YYYY-MM-DD/미정/빈값) |
| law_type | TEXT | NOT NULL | 법률·대통령령 등 법령종류 |
| announce_no | TEXT | NOT NULL | 공포번호 |
| revision_type | TEXT | NOT NULL | 제정·개정·폐지 등 원문 구분 |
| ministry | TEXT | NOT NULL | 소관부처 |
| article_label | TEXT | NOT NULL | 한시/위헌조문의 표시 제목 |
| page | INTEGER | NOT NULL | 수집 당시 검색결과 페이지 |
| match_status | TEXT | NOT NULL | or_match: K열 값 중 하나 이상 포함 |
| matched_keywords | TEXT | NOT NULL | 일치한 K열 셀 전체 값의 JSON 배열 |
| data_json | TEXT | NOT NULL | 목록 전체 필드 JSON(effective_raw·article_code 등 포함) |
| collected_at | TEXT | NOT NULL | 마지막 저장 시각(UTC ISO 8601) |

인덱스: llc_v1_list_category_idx (category); llc_v1_list_source_effective_idx (source_id, effective_date).

## llc_v1_raw_articles
본문 조문(raw 역할).

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| item_key | TEXT | PK1 NOT NULL | llc_v1_list.key에 연결되는 목록 key |
| part_id | TEXT | PK2 NOT NULL | 조문·부칙·별표 또는 파일의 고유 식별자 |
| title | TEXT | NOT NULL | 법령·조문·부칙·별표 제목 |
| text | TEXT | NOT NULL | 정리 텍스트(별표는 목록 제목) |
| html | TEXT | NOT NULL | 원문 HTML(별표는 목록 HTML) |
| gubun | TEXT | NOT NULL | 엑셀 gubun 정수 목록의 JSON 배열 |
| collected_at | TEXT | NOT NULL | 마지막 저장 시각(UTC ISO 8601) |

복합 PK: (item_key, part_id). FK: item_key → llc_v1_list.key, ON DELETE RESTRICT.

인덱스: llc_v1_raw_articles_gubun_idx (gubun).

## llc_v1_raw_addendum
부칙(raw_addendum 역할).

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| item_key | TEXT | PK1 NOT NULL | llc_v1_list.key에 연결되는 목록 key |
| part_id | TEXT | PK2 NOT NULL | 조문·부칙·별표 또는 파일의 고유 식별자 |
| title | TEXT | NOT NULL | 법령·조문·부칙·별표 제목 |
| text | TEXT | NOT NULL | 정리 텍스트(별표는 목록 제목) |
| html | TEXT | NOT NULL | 원문 HTML(별표는 목록 HTML) |
| gubun | TEXT | NOT NULL | 엑셀 gubun 정수 목록의 JSON 배열 |
| collected_at | TEXT | NOT NULL | 마지막 저장 시각(UTC ISO 8601) |

복합 PK: (item_key, part_id). FK: item_key → llc_v1_list.key, ON DELETE RESTRICT.

인덱스: llc_v1_raw_addendum_gubun_idx (gubun).

## llc_v1_raw_annex
별표·서식 목록(raw_annex 역할).

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| item_key | TEXT | PK1 NOT NULL | llc_v1_list.key에 연결되는 목록 key |
| part_id | TEXT | PK2 NOT NULL | 조문·부칙·별표 또는 파일의 고유 식별자 |
| title | TEXT | NOT NULL | 법령·조문·부칙·별표 제목 |
| text | TEXT | NOT NULL | 정리 텍스트(별표는 목록 제목) |
| html | TEXT | NOT NULL | 원문 HTML(별표는 목록 HTML) |
| gubun | TEXT | NOT NULL | 엑셀 gubun 정수 목록의 JSON 배열 |
| collected_at | TEXT | NOT NULL | 마지막 저장 시각(UTC ISO 8601) |

복합 PK: (item_key, part_id). FK: item_key → llc_v1_list.key, ON DELETE RESTRICT.

인덱스: llc_v1_raw_annex_gubun_idx (gubun).

## llc_v1_raw_attachment
첨부파일 상태·경로(raw_attachment 역할).

| 컬럼 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| item_key | TEXT | PK1 NOT NULL | llc_v1_list.key에 연결되는 목록 key |
| part_id | TEXT | PK2 NOT NULL | 조문·부칙·별표 또는 파일의 고유 식별자 |
| annex_id | TEXT | NOT NULL | 연결 별표 식별자 |
| url | TEXT | NOT NULL | 다운로드 원본 URL |
| display_name | TEXT | NOT NULL | 원래 표시 파일명 |
| local_path | TEXT | NOT NULL | 실제 저장 파일경로(실패 시 빈값) |
| size | INTEGER | NULL 허용 | 실제 파일 바이트 수 |
| sha256 | TEXT | NOT NULL | 파일 SHA-256 해시 |
| status | TEXT | NOT NULL | 실행 completed/partial/no_results/failed 또는 파일 downloaded/existing/format_mismatch/failed |
| error | TEXT | NOT NULL | 실패·형식 경고 사유 |
| gubun | TEXT | NOT NULL | 엑셀 gubun 정수 목록의 JSON 배열 |
| collected_at | TEXT | NOT NULL | 마지막 저장 시각(UTC ISO 8601) |

복합 PK: (item_key, part_id). FK: item_key → llc_v1_list.key, ON DELETE RESTRICT.

인덱스: llc_v1_raw_attachment_gubun_idx (gubun).

## gubun 조회 예시

gubun은 단일 숫자가 아니라 정수 JSON 배열입니다. 복수 엑셀 행이 같은 법령에 연결될 수 있습니다. gubun 열 인덱스는 배열 전체 문자열의 직접 비교에 적용되며, 개별 숫자 검색에는 SQLite JSON1의 json_each를 사용합니다.

```sql
SELECT l.key, l.title, l.gubun
FROM llc_v1_list AS l
WHERE EXISTS (SELECT 1 FROM json_each(l.gubun) WHERE value = 1);
```

JSON1이 제공되지 않는 구형 SQLite에서는 Python에서 JSON을 읽어 필터링합니다. 원문 상세 조회는 각 raw 테이블의 item_key로 목록과 조인합니다.
