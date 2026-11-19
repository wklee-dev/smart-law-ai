# vector.chunk_generator
#
# 관세 AI 검색 플랫폼 — admin_rule* 본문을 smartlaw_chunk 로 변환하는
# Python 패키지 진입점.
#
# 하위 모듈:
#   smartlaw_chunk_generator  — 전체 파이프라인 오케스트레이션
#   chunk_builder             — 본문·부칙·별표 텍스트 청킹
#   keyword_extractor         — 검색·메타용 키워드 추출
#   metadata_builder          — 청크 메타데이터 구성
#   embedding_service         — 임베딩 벡터 생성
#   supabase_repository       — Supabase 읽기/쓰기
