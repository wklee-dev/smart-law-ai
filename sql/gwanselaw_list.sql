-- API 관리 목록 (기존 data/api-management-list.json → smart_law_ai.db)
-- 앱: /api-management, /api-call, 조항호목·행정규칙 API 호출 화면

CREATE TABLE IF NOT EXISTS gwanselaw_list (
  id TEXT PRIMARY KEY NOT NULL,
  division TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  upload_order INTEGER NOT NULL DEFAULT 0,
  api_name TEXT NOT NULL DEFAULT '',
  law_short_name TEXT NOT NULL DEFAULT '',
  law_id TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT 'XML',
  portal_category TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  last_received_eflaw_josub TEXT NOT NULL DEFAULT '',
  last_received_admrul_body TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_law_id ON gwanselaw_list(law_id);
CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_upload_order ON gwanselaw_list(upload_order);
CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_division ON gwanselaw_list(division);
