-- =============================================================================
-- 관세사법 전체 조회 SQL
-- DB  : D:/SQLiteDB/smart_law_ai.db  (LAW_DB_PATH / SMART_LAW_SQLITE_DB_PATH)
--
-- 식별자
--   관세사법            law_id = '000591'   (법률)
--   관세사법 시행령     law_id = '002521'   (대통령령)  — 본문 미수집 시 laws 없음
--   관세사법 시행규칙   law_id = '006489'   (총리령 등) — 본문 미수집 시 laws 없음
--
-- 사용 팁
--   1) 아래에서 쿼리씩 실행하세요 (클라이언트가 다중 문장을 한 번에 돌리면 마지막만 보일 수 있음)
--   2) law_versions.raw_json / admrul_snapshots.raw_response 루트는
--      「법령」「AdmRulService」래퍼 없이 본문 객체인 경우가 있습니다
-- =============================================================================


-- ############################################################################
-- A. 대상 확인 (목록 / 마스터 / API관리)
-- ############################################################################

-- A-1. laws 마스터 + 현행 버전
SELECT
  l.id                         AS laws_pk,
  l.law_id,
  l.law_name_kr,
  l.law_name_short,
  l.law_type_name,
  l.law_type_code,
  l.ministry_name,
  l.ministry_code,
  l.law_key,
  COALESCE(v.id, v.rowid)      AS law_version_id,
  v.version_key,
  v.promulgation_no,
  v.promulgation_date,
  v.enforcement_date,
  v.revision_type,
  v.is_current,
  v.contact_department_name,
  v.contact_phone
FROM laws l
LEFT JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
WHERE l.law_id IN ('000591', '002521', '006489')
   OR l.law_name_kr LIKE '관세사법%'
ORDER BY
  CASE l.law_id WHEN '000591' THEN 1 WHEN '002521' THEN 2 WHEN '006489' THEN 3 ELSE 9 END;

-- A-2. law_list (본문 미수집 법령 포함)
SELECT DISTINCT
  law_id,
  law_name_kr,
  law_type_name,
  ministry_name,
  prom_date,
  prom_no,
  enf_date,
  amend_type_name,
  law_detail_link
FROM law_list
WHERE law_id IN ('000591', '002521', '006489')
   OR law_name_kr LIKE '관세사법%'
ORDER BY law_id, enf_date DESC;

-- A-3. API 관리(gwanselaw_list) 등록·수신 상태
SELECT
  id,
  division,
  category,
  api_name,
  law_short_name,
  law_id,
  file_type,
  portal_category,
  updated_at,
  last_received_eflaw_josub,
  last_received_admrul_body
FROM gwanselaw_list
WHERE TRIM(law_id) IN ('000591', '591', '002521', '006489')
   OR law_short_name LIKE '%관세사%'
   OR api_name LIKE '%관세사%'
ORDER BY upload_order, id;


-- ############################################################################
-- B. 관세사법(000591) 법령 본문
-- ############################################################################

-- B-1. 본문 메타 + 원본 JSON
SELECT
  l.law_id,
  l.law_name_kr,
  l.law_type_name,
  l.ministry_name,
  COALESCE(v.id, v.rowid) AS law_version_id,
  v.version_key,
  v.promulgation_no,
  v.promulgation_date,
  v.enforcement_date,
  v.revision_type,
  v.article_effective_text,
  v.promulgated_law_yn,
  v.contact_department_name,
  v.contact_phone,
  json_extract(v.raw_json, '$.기본정보.법령명_한글') AS json_law_name,
  json_extract(v.raw_json, '$.기본정보.법령ID')       AS json_law_id,
  json_extract(v.raw_json, '$.기본정보.시행일자')     AS json_enf_date,
  json_extract(v.raw_json, '$.기본정보.공포일자')     AS json_prom_date,
  json_extract(v.raw_json, '$.기본정보.공포번호')     AS json_prom_no,
  json_extract(v.raw_json, '$.기본정보.제개정구분')   AS json_revision,
  v.raw_json,
  l.raw_json AS laws_raw_json
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
WHERE l.law_id = '000591';

-- B-2. 버전 이력(현행 포함 전체)
SELECT
  COALESCE(v.id, v.rowid) AS law_version_id,
  v.version_key,
  v.is_current,
  v.promulgation_no,
  v.promulgation_date,
  v.enforcement_date,
  v.revision_type,
  v.created_at,
  v.updated_at
FROM laws l
JOIN law_versions v ON v.law_id = l.id
WHERE l.law_id = '000591'
ORDER BY v.is_current DESC, v.enforcement_date DESC, COALESCE(v.id, v.rowid) DESC;


-- ############################################################################
-- C. 편·장·절 구조 / 전문
-- ############################################################################

-- C-1. law_structure_nodes
SELECT
  COALESCE(n.id, n.rowid) AS node_id,
  n.parent_id,
  n.node_type,
  n.node_no,
  n.node_title,
  n.full_title,
  n.display_order,
  n.depth,
  n.article_no,
  n.article_key
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_structure_nodes n
  ON n.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '000591'
ORDER BY n.display_order, COALESCE(n.id, n.rowid);

-- C-2. 전문 행 (편·장·절이 law_articles 에 저장된 경우)
SELECT
  COALESCE(a.id, a.rowid) AS article_id,
  a.article_no,
  a.article_title,
  a.article_content,
  a.article_type,
  a.display_order
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '000591'
  AND a.article_type = '전문'
ORDER BY a.display_order;


-- ############################################################################
-- D. 조문 / 항·호·목
-- ############################################################################

-- D-1. 조문 목록
SELECT
  l.law_id,
  l.law_name_kr,
  COALESCE(a.id, a.rowid) AS article_id,
  a.structure_node_id,
  a.article_key,
  a.article_no,
  a.article_title,
  a.article_content,
  a.article_type,
  a.article_revision_type,
  a.article_effective_date,
  a.article_changed_yn,
  a.display_order,
  a.raw_json
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '000591'
  AND a.article_type = '조문'
ORDER BY a.display_order, COALESCE(a.id, a.rowid);

-- D-2. 조문 + 항·호·목
SELECT
  a.article_no,
  a.article_title,
  COALESCE(a.id, a.rowid) AS article_id,
  COALESCE(i.id, i.rowid) AS item_id,
  i.item_level,
  i.parent_item_id,
  i.item_no,
  i.item_content,
  i.display_order AS item_order,
  i.depth,
  i.raw_json AS item_raw_json
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
LEFT JOIN law_article_items i
  ON i.law_article_id = COALESCE(a.id, a.rowid)
WHERE l.law_id = '000591'
  AND a.article_type = '조문'
ORDER BY a.display_order, i.display_order, COALESCE(i.id, i.rowid);

-- D-3. 조문/전문 건수 요약
SELECT
  a.article_type,
  COUNT(*) AS cnt
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '000591'
GROUP BY a.article_type;


-- ############################################################################
-- E. 부칙 (raw_json)
-- ############################################################################

-- E-1. 부칙 단위 전체
SELECT
  l.law_id,
  l.law_name_kr,
  je.key AS addendum_index,
  json_extract(je.value, '$.부칙키')       AS addendum_key,
  json_extract(je.value, '$.부칙공포번호') AS promulgation_no,
  json_extract(je.value, '$.부칙공포일자') AS promulgation_date,
  json_extract(je.value, '$.부칙내용')     AS addendum_content_json,
  je.value AS addendum_raw
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN json_each(json_extract(v.raw_json, '$.부칙.부칙단위')) AS je
WHERE l.law_id = '000591'
ORDER BY CAST(je.key AS INTEGER);

-- E-2. 부칙 텍스트(내용 배열을 줄바꿈으로 결합)
SELECT
  json_extract(je.value, '$.부칙공포번호') AS promulgation_no,
  json_extract(je.value, '$.부칙공포일자') AS promulgation_date,
  (
    SELECT group_concat(txt.value, char(10))
    FROM json_each(
      CASE
        WHEN json_type(json_extract(je.value, '$.부칙내용')) = 'array'
          THEN json_extract(je.value, '$.부칙내용')
        WHEN json_extract(je.value, '$.부칙내용') IS NULL
          THEN json_array()
        ELSE json_array(json_extract(je.value, '$.부칙내용'))
      END
    ) AS txt
  ) AS addendum_text
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN json_each(json_extract(v.raw_json, '$.부칙.부칙단위')) AS je
WHERE l.law_id = '000591'
ORDER BY CAST(je.key AS INTEGER);


-- ############################################################################
-- F. 별표·서식 첨부 (법령)
-- ############################################################################

-- F-1. law_annexes 테이블
SELECT
  COALESCE(x.id, x.rowid) AS annex_id,
  x.annex_no,
  x.annex_sub_no,
  x.annex_type,
  x.annex_title,
  x.enf_date,
  x.file_link,
  x.local_path,
  x.content,
  x.raw_json
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_annexes x
  ON x.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '000591'
ORDER BY COALESCE(x.id, x.rowid);

-- F-2. raw_json 별표 (테이블이 비어 있을 때 원본 확인)
SELECT
  je.key AS annex_index,
  json_extract(je.value, '$.별표번호')         AS annex_no,
  json_extract(je.value, '$.별표가지번호')     AS annex_sub_no,
  json_extract(je.value, '$.별표구분')         AS annex_type,
  json_extract(je.value, '$.별표제목')         AS annex_title,
  json_extract(je.value, '$.별표시행일자')     AS enf_date,
  json_extract(je.value, '$.별표서식파일링크') AS file_link,
  je.value AS annex_raw
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN json_each(
  CASE
    WHEN json_type(json_extract(v.raw_json, '$.별표.별표단위')) = 'array'
      THEN json_extract(v.raw_json, '$.별표.별표단위')
    WHEN json_type(json_extract(v.raw_json, '$.별표.별표단위')) = 'object'
      THEN json_array(json_extract(v.raw_json, '$.별표.별표단위'))
    ELSE json_array()
  END
) AS je
WHERE l.law_id = '000591'
ORDER BY CAST(je.key AS INTEGER);


-- ############################################################################
-- G. 관련 행정규칙
-- ############################################################################

-- G-1. 법령↔행정규칙 연결
SELECT
  COALESCE(lk.id, lk.rowid) AS link_id,
  lk.law_id,
  lk.adm_serial_id,
  lk.adm_lid,
  lk.rule_name_kr,
  lk.source_query,
  lk.created_at,
  COALESCE(s.id, s.rowid) AS snapshot_id
FROM law_admrul_links lk
LEFT JOIN admrul_snapshots s
  ON TRIM(s.adm_serial_id) = TRIM(lk.adm_serial_id)
WHERE TRIM(lk.law_id) = '000591'
   OR LTRIM(TRIM(lk.law_id), '0') = LTRIM('000591', '0')
ORDER BY COALESCE(lk.id, lk.rowid);

-- G-2. 행정규칙 목록 검색 이력 (본문수집 시 related_law_id 저장)
SELECT
  COALESCE(r.id, r.rowid) AS search_run_id,
  r.query,
  r.related_law_id,
  r.total_cnt,
  r.fetched_count,
  r.org,
  r.target,
  r.result_code,
  r.result_msg,
  r.created_at,
  r.run_at
FROM admrul_search_runs r
WHERE r.related_law_id = '000591'
   OR r.query LIKE '%관세사%'
ORDER BY COALESCE(r.id, r.rowid) DESC;

-- G-3. 행정규칙 목록 항목
SELECT
  COALESCE(i.id, i.rowid) AS list_item_id,
  COALESCE(r.id, r.rowid) AS search_run_id,
  r.query,
  r.related_law_id,
  i.adm_serial_id,
  i.adm_lid,
  i.rule_name_kr,
  i.rule_type,
  i.ministry_name,
  i.promulgation_date,
  i.promulgation_no,
  i.enforcement_date,
  i.revision_name,
  i.detail_link,
  i.embed_text,
  i.raw_item
FROM admrul_list_items i
JOIN admrul_search_runs r
  ON i.search_run_id = COALESCE(r.id, r.rowid)
WHERE r.related_law_id = '000591'
   OR r.query LIKE '%관세사%'
   OR i.rule_name_kr LIKE '%관세사%'
ORDER BY COALESCE(r.id, r.rowid) DESC, COALESCE(i.id, i.rowid);

-- G-4. 행정규칙 본문 스냅샷 (연결 기준)
SELECT
  COALESCE(s.id, s.rowid) AS snapshot_id,
  s.adm_serial_id,
  s.adm_lid,
  s.rule_name_kr,
  s.ministry_name,
  s.promulgation_date,
  s.enforcement_date,
  s.requested_url,
  s.created_at,
  s.raw_response,
  lk.source_query,
  lk.law_id AS related_law_id
FROM law_admrul_links lk
JOIN admrul_snapshots s
  ON TRIM(s.adm_serial_id) = TRIM(lk.adm_serial_id)
WHERE TRIM(lk.law_id) = '000591'
ORDER BY COALESCE(s.id, s.rowid);

-- G-5. 행정규칙 본문 스냅샷 (규칙명 검색 — 링크 누락 대비)
SELECT
  COALESCE(s.id, s.rowid) AS snapshot_id,
  s.adm_serial_id,
  s.adm_lid,
  s.rule_name_kr,
  s.ministry_name,
  s.promulgation_date,
  s.enforcement_date,
  s.created_at,
  s.raw_response
FROM admrul_snapshots s
WHERE s.rule_name_kr LIKE '%관세사%'
ORDER BY COALESCE(s.id, s.rowid) DESC;

-- G-6. 행정규칙 본문 요약 필드 (AdmRulService / 루트 모두 대응)
SELECT
  COALESCE(s.id, s.rowid) AS snapshot_id,
  s.adm_serial_id,
  s.rule_name_kr,
  COALESCE(
    json_extract(s.raw_response, '$.AdmRulService.행정규칙기본정보.행정규칙명'),
    json_extract(s.raw_response, '$.행정규칙기본정보.행정규칙명'),
    s.rule_name_kr
  ) AS json_rule_name,
  COALESCE(
    json_extract(s.raw_response, '$.AdmRulService.행정규칙기본정보.시행일자'),
    json_extract(s.raw_response, '$.행정규칙기본정보.시행일자'),
    s.enforcement_date
  ) AS json_enf_date,
  COALESCE(
    json_extract(s.raw_response, '$.AdmRulService.조문.조문내용'),
    json_extract(s.raw_response, '$.조문.조문내용')
  ) AS jo_content,
  COALESCE(
    json_extract(s.raw_response, '$.AdmRulService.부칙.부칙내용'),
    json_extract(s.raw_response, '$.부칙.부칙내용')
  ) AS byl_content
FROM law_admrul_links lk
JOIN admrul_snapshots s
  ON TRIM(s.adm_serial_id) = TRIM(lk.adm_serial_id)
WHERE TRIM(lk.law_id) = '000591';

-- G-7. 행정규칙 별표·첨부파일
SELECT
  s.adm_serial_id,
  s.rule_name_kr,
  COALESCE(x.id, x.rowid) AS annex_id,
  x.annex_no,
  x.annex_sub_no,
  x.annex_type,
  x.annex_title,
  x.enf_date,
  x.file_link,
  x.local_path,
  x.content,
  x.raw_json
FROM law_admrul_links lk
JOIN admrul_snapshots s
  ON TRIM(s.adm_serial_id) = TRIM(lk.adm_serial_id)
JOIN admrul_annexes x
  ON TRIM(x.admrul_id) = TRIM(s.adm_serial_id)
  OR TRIM(x.admrul_id) = TRIM(COALESCE(s.adm_lid, ''))
WHERE TRIM(lk.law_id) = '000591'
ORDER BY s.adm_serial_id, COALESCE(x.id, x.rowid);


-- ############################################################################
-- H. 시행령 / 시행규칙 (본문 수집된 경우)
-- ############################################################################

-- H-1. 시행령(002521) 본문 메타
SELECT
  l.law_id,
  l.law_name_kr,
  l.law_type_name,
  COALESCE(v.id, v.rowid) AS law_version_id,
  v.promulgation_no,
  v.promulgation_date,
  v.enforcement_date,
  v.revision_type,
  v.raw_json
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
WHERE l.law_id = '002521';

-- H-2. 시행령 조문
SELECT
  a.article_no,
  a.article_title,
  a.article_content,
  a.article_type,
  a.display_order
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '002521'
  AND a.article_type = '조문'
ORDER BY a.display_order;

-- H-3. 시행령 부칙
SELECT
  json_extract(je.value, '$.부칙공포번호') AS promulgation_no,
  json_extract(je.value, '$.부칙공포일자') AS promulgation_date,
  je.value AS addendum_raw
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN json_each(json_extract(v.raw_json, '$.부칙.부칙단위')) AS je
WHERE l.law_id = '002521'
ORDER BY CAST(je.key AS INTEGER);

-- H-4. 시행규칙(006489) 본문 메타
SELECT
  l.law_id,
  l.law_name_kr,
  l.law_type_name,
  COALESCE(v.id, v.rowid) AS law_version_id,
  v.promulgation_no,
  v.promulgation_date,
  v.enforcement_date,
  v.revision_type,
  v.raw_json
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
WHERE l.law_id = '006489';

-- H-5. 시행규칙 조문
SELECT
  a.article_no,
  a.article_title,
  a.article_content,
  a.article_type,
  a.display_order
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id = '006489'
  AND a.article_type = '조문'
ORDER BY a.display_order;


-- ############################################################################
-- I. 통합 조회 (법률 + 시행령 + 시행규칙 조문)
-- ############################################################################
SELECT
  l.law_id,
  l.law_name_kr,
  l.law_type_name,
  a.article_type,
  a.article_no,
  a.article_title,
  a.article_content,
  a.display_order
FROM laws l
JOIN law_versions v
  ON v.law_id = l.id
 AND v.is_current = 1
JOIN law_articles a
  ON a.law_version_id = COALESCE(v.id, v.rowid)
WHERE l.law_id IN ('000591', '002521', '006489')
  AND a.article_type = '조문'
ORDER BY
  CASE l.law_id WHEN '000591' THEN 1 WHEN '002521' THEN 2 ELSE 3 END,
  a.display_order;


-- ############################################################################
-- J. 데이터 존재 요약 (한 눈에 확인)
-- ############################################################################
SELECT 'laws_관세사법' AS item,
       (SELECT COUNT(*) FROM laws WHERE law_id = '000591') AS cnt
UNION ALL
SELECT 'law_versions_현행',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        WHERE l.law_id = '000591')
UNION ALL
SELECT '조문',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        JOIN law_articles a ON a.law_version_id = COALESCE(v.id, v.rowid)
        WHERE l.law_id = '000591' AND a.article_type = '조문')
UNION ALL
SELECT '전문',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        JOIN law_articles a ON a.law_version_id = COALESCE(v.id, v.rowid)
        WHERE l.law_id = '000591' AND a.article_type = '전문')
UNION ALL
SELECT '항호목',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        JOIN law_articles a ON a.law_version_id = COALESCE(v.id, v.rowid)
        JOIN law_article_items i ON i.law_article_id = COALESCE(a.id, a.rowid)
        WHERE l.law_id = '000591')
UNION ALL
SELECT '구조노드',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        JOIN law_structure_nodes n ON n.law_version_id = COALESCE(v.id, v.rowid)
        WHERE l.law_id = '000591')
UNION ALL
SELECT '법령별표_law_annexes',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        JOIN law_annexes x ON x.law_version_id = COALESCE(v.id, v.rowid)
        WHERE l.law_id = '000591')
UNION ALL
SELECT '부칙_json',
       (SELECT COUNT(*) FROM laws l
        JOIN law_versions v ON v.law_id = l.id AND v.is_current = 1
        JOIN json_each(json_extract(v.raw_json, '$.부칙.부칙단위')) je
        WHERE l.law_id = '000591')
UNION ALL
SELECT '관련행정규칙_links',
       (SELECT COUNT(*) FROM law_admrul_links WHERE law_id = '000591')
UNION ALL
SELECT '관련행정규칙_snapshots',
       (SELECT COUNT(*) FROM law_admrul_links lk
        JOIN admrul_snapshots s ON TRIM(s.adm_serial_id) = TRIM(lk.adm_serial_id)
        WHERE lk.law_id = '000591')
UNION ALL
SELECT '행정규칙_별표첨부',
       (SELECT COUNT(*) FROM law_admrul_links lk
        JOIN admrul_snapshots s ON TRIM(s.adm_serial_id) = TRIM(lk.adm_serial_id)
        JOIN admrul_annexes x ON TRIM(x.admrul_id) = TRIM(s.adm_serial_id)
        WHERE lk.law_id = '000591')
UNION ALL
SELECT '시행령_laws',
       (SELECT COUNT(*) FROM laws WHERE law_id = '002521')
UNION ALL
SELECT '시행규칙_laws',
       (SELECT COUNT(*) FROM laws WHERE law_id = '006489')
UNION ALL
SELECT '시행령_law_list',
       (SELECT COUNT(DISTINCT law_id) FROM law_list WHERE law_id = '002521')
UNION ALL
SELECT '시행규칙_law_list',
       (SELECT COUNT(DISTINCT law_id) FROM law_list WHERE law_id = '006489');
