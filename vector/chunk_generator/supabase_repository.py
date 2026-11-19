# supabase_repository.py
#
# 역할: Supabase(Postgres) 입출력 계층. (STEP 4-2)
#
# - 읽기: admin_rule
# - 쓰기: smartlaw_chunk
# - Embedding·keywords 생성은 하지 않는다.

from __future__ import annotations

import math
import os
import re
import sys
from pathlib import Path
from pprint import pprint
from typing import Any, Mapping, Sequence

from dotenv import load_dotenv

# 프로젝트 루트 `supabase/` 가 pip 패키지 `supabase` 를 가리므로 import 경로 조정
_ROOT = Path(__file__).resolve().parents[2]


def _import_supabase():
    removed: list[str] = []
    for entry in list(sys.path):
        try:
            resolved = Path(entry or ".").resolve()
        except OSError:
            continue
        if resolved == _ROOT.resolve():
            sys.path.remove(entry)
            removed.append(entry)
    for name in list(sys.modules):
        if name == "supabase" or name.startswith("supabase."):
            del sys.modules[name]
    try:
        from supabase import Client as _Client
        from supabase import create_client as _create_client

        return _Client, _create_client
    finally:
        for entry in reversed(removed):
            if entry not in sys.path:
                sys.path.insert(0, entry)


Client, create_client = _import_supabase()

ADMIN_RULE_SELECT_COLUMNS = (
    "id,"
    "sqlite_id,"
    "gubun,"
    "param,"
    "seq_id,"
    "law_name,"
    "promulgation_no,"
    "promulgation_dt,"
    "section_type,"
    "article_no,"
    "article_title,"
    "article_content"
)

ADMIN_RULE_ANALYSIS_PAGE_SIZE = 500
ADMIN_RULE_BATCH_PAGE_SIZE = 100

ADMIN_RULE_ANALYSIS_SELECT_COLUMNS = (
    "id,"
    "seq_id,"
    "law_name,"
    "section_type,"
    "article_no,"
    "article_content"
)

ADMIN_RULE_INVALID_SAMPLE_SELECT_COLUMNS = (
    "id,"
    "seq_id,"
    "law_name,"
    "section_type,"
    "article_no,"
    "article_title"
)

DICTIONARY_SELECT_COLUMNS = (
    "id,"
    "category,"
    "term,"
    "synonyms,"
    "description,"
    "weight,"
    "use_yn"
)

CHUNK_EMBEDDING_SELECT_COLUMNS = (
    "id,"
    "source_table,"
    "source_pk,"
    "document_category,"
    "document_type,"
    "law_name,"
    "chunk_type,"
    "article_no,"
    "title,"
    "header,"
    "body,"
    "chunk_text,"
    "keywords,"
    "metadata,"
    "embedding,"
    "created_at"
)

SMARTLAW_EMBEDDING_DIMENSION = 768

DEFAULT_EMBEDDING_BATCH_SIZE = 10
MAX_EMBEDDING_BATCH_SIZE = 100
EMBEDDING_CANDIDATE_PAGE_SIZE = 100

DEFAULT_VECTOR_MATCH_COUNT = 10
MAX_VECTOR_MATCH_COUNT = 100

DEFAULT_KEYWORD_MATCH_COUNT = 10
MAX_KEYWORD_MATCH_COUNT = 100

CHUNK_NEEDS_EMBEDDING_SELECT_COLUMNS = (
    "id,"
    "source_table,"
    "source_pk,"
    "document_category,"
    "document_type,"
    "law_name,"
    "chunk_type,"
    "article_no,"
    "title,"
    "header,"
    "chunk_text,"
    "keywords,"
    "embedding,"
    "created_at"
)

_REQUIRED_CHUNK_FIELDS = (
    "source_table",
    "source_pk",
    "document_category",
    "document_type",
    "law_name",
    "chunk_type",
    "header",
    "body",
    "chunk_text",
)

_CHUNK_PAYLOAD_COLUMNS = (
    "source_table",
    "source_pk",
    "document_category",
    "document_type",
    "law_id",
    "law_name",
    "chunk_type",
    "article_no",
    "paragraph_no",
    "item_no",
    "title",
    "header",
    "body",
    "chunk_text",
    "keywords",
    "metadata",
    "embedding",
)


def _is_blank(value: Any) -> bool:
    """None 또는 공백 문자열이면 True. source_pk=0 은 빈 값이 아니다."""
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _validate_required_fields(chunk: Mapping[str, Any]) -> None:
    """smartlaw_chunk 필수 필드를 검사한다."""
    for field in _REQUIRED_CHUNK_FIELDS:
        if field not in chunk or _is_blank(chunk[field]):
            raise ValueError(f"smartlaw_chunk 필수값이 없습니다: {field}")


def _build_chunk_payload(chunk: Mapping[str, Any]) -> dict[str, Any]:
    """
    smartlaw_chunk DB 컬럼에 해당하는 값만 복사한다.

    id·created_at 제외. embedding·keywords 는 입력에 있을 때만 포함.
    """
    payload: dict[str, Any] = {}
    for key in _CHUNK_PAYLOAD_COLUMNS:
        if key not in chunk:
            continue
        payload[key] = chunk[key]
    return payload


def _normalize_keywords_for_storage(
    keywords: Sequence[str],
) -> list[str]:
    """
    저장용 keywords를 정리한다. DB 접근 없음.

    입력 Sequence 원본은 수정하지 않는다.
    """
    items = list(keywords)
    result: list[str] = []
    seen: set[str] = set()

    for item in items:
        if not isinstance(item, str):
            raise TypeError("keywords의 모든 항목은 문자열이어야 합니다.")

        text = re.sub(r"\s+", " ", item).strip()
        if not text or text.isdigit():
            continue

        key = text.lower() if re.search(r"[A-Za-z]", text) else text
        if key in seen:
            continue
        seen.add(key)
        result.append(text)

    if not result:
        raise ValueError("저장할 keywords가 없습니다.")
    return result


def _validate_embedding_for_storage(
    embedding: Sequence[float],
) -> list[float]:
    """
    저장용 embedding을 검증·복사한다. DB 접근 없음.

    입력 Sequence 원본은 수정하지 않는다.
    """
    if isinstance(embedding, (str, bytes)):
        raise TypeError("embedding은 숫자 Sequence여야 합니다.")

    values: list[float] = []
    for value in embedding:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError("Embedding vector에는 숫자만 포함되어야 합니다.")
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            raise ValueError(
                "Embedding vector에 유효하지 않은 숫자가 포함되어 있습니다."
            )
        values.append(number)

    actual_dimension = len(values)
    if actual_dimension != SMARTLAW_EMBEDDING_DIMENSION:
        raise ValueError(
            f"Embedding 차원이 일치하지 않습니다. "
            f"expected={SMARTLAW_EMBEDDING_DIMENSION}, "
            f"actual={actual_dimension}"
        )
    return values


def _normalize_optional_filter(
    value: str | None,
    field_name: str,
) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(
            f"{field_name}은 문자열 또는 None이어야 합니다."
        )
    cleaned = value.strip()
    if cleaned == "":
        return None
    return cleaned


class SupabaseRepository:
    """admin_rule 조회 및 smartlaw_chunk 저장 Repository."""

    client: Client

    def __init__(self) -> None:
        """
        환경변수로 로컬 Supabase 클라이언트를 초기화한다.

        URL: SUPABASE_URL → NEXT_PUBLIC_SUPABASE_URL
        Key: SUPABASE_SECRET_KEY → SUPABASE_SERVICE_ROLE_KEY
             → SUPABASE_KEY → NEXT_PUBLIC_SUPABASE_ANON_KEY
        """
        load_dotenv(_ROOT / ".env")
        load_dotenv(_ROOT / ".env.local")
        load_dotenv()

        url = ""
        for name in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"):
            value = (os.getenv(name) or "").strip()
            if value:
                url = value
                break

        key = ""
        for name in (
            "SUPABASE_SECRET_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_KEY",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ):
            value = (os.getenv(name) or "").strip()
            if value:
                key = value
                break

        if not url:
            raise ValueError("Supabase URL 환경변수가 설정되지 않았습니다.")
        if not key:
            raise ValueError("Supabase Key 환경변수가 설정되지 않았습니다.")

        db_timeout_seconds = 60
        timeout_raw = os.getenv("REQUEST_TIMEOUT_SECONDS")
        if timeout_raw is not None and str(timeout_raw).strip():
            try:
                parsed = int(str(timeout_raw).strip())
                if parsed > 0:
                    db_timeout_seconds = parsed
            except ValueError:
                pass

        try:
            from supabase.lib.client_options import (
                SyncClientOptions,
            )

            options = SyncClientOptions(
                postgrest_client_timeout=db_timeout_seconds,
            )
            self.client = create_client(
                url,
                key,
                options=options,
            )
        except Exception:
            self.client = create_client(url, key)

    def get_admin_rule(self, rule_id: int) -> dict[str, Any] | None:
        """
        admin_rule 1건을 id로 조회한다.

        Args:
            rule_id: admin_rule.id (1 이상).

        Returns:
            행 dict. 없으면 None.
        """
        if rule_id < 1:
            raise ValueError("rule_id는 1 이상이어야 합니다.")

        try:
            response = (
                self.client.table("admin_rule")
                .select(ADMIN_RULE_SELECT_COLUMNS)
                .eq("id", rule_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                f"admin_rule 조회 중 오류가 발생했습니다. rule_id={rule_id}"
            ) from exc

        data = response.data
        if not data:
            return None
        return dict(data[0])

    def get_admin_rules(self, limit: int = 10) -> list[dict[str, Any]]:
        """
        admin_rule 목록을 id 오름차순으로 조회한다.

        Args:
            limit: 최대 조회 건수 (1 이상).

        Returns:
            조회된 행 목록.
        """
        if limit < 1:
            raise ValueError("limit은 1 이상이어야 합니다.")

        try:
            response = (
                self.client.table("admin_rule")
                .select(ADMIN_RULE_SELECT_COLUMNS)
                .order("id")
                .limit(limit)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "admin_rule 목록 조회 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if data is None:
            return []
        return list(data)

    def get_dictionary_entries(
        self,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        활성화된 smartlaw_dictionary 데이터를 조회한다.

        category가 전달되면 해당 category만 조회하고,
        None 또는 공백이면 모든 활성 Dictionary를 조회한다.
        """
        cleaned_category = (category or "").strip()

        try:
            query = (
                self.client.table("smartlaw_dictionary")
                .select(DICTIONARY_SELECT_COLUMNS)
                .eq("use_yn", "Y")
            )
            if cleaned_category:
                query = query.eq("category", cleaned_category)
            response = (
                query.order("weight", desc=True).order("id").execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "smartlaw_dictionary 조회 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if data is None:
            return []
        return list(data)

    def get_chunk_by_id(
        self,
        chunk_id: int,
    ) -> dict[str, Any] | None:
        """
        smartlaw_chunk.id로 임베딩 생성에 필요한 청크 한 건을 조회한다.
        """
        if chunk_id < 1:
            raise ValueError("chunk_id는 1 이상이어야 합니다.")

        try:
            response = (
                self.client.table("smartlaw_chunk")
                .select(CHUNK_EMBEDDING_SELECT_COLUMNS)
                .eq("id", chunk_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                f"smartlaw_chunk 조회 중 오류가 발생했습니다. chunk_id={chunk_id}"
            ) from exc

        data = response.data
        if not data:
            return None
        return dict(data[0])

    def get_chunk_by_source(
        self,
        source_table: str,
        source_pk: int,
        chunk_type: str,
    ) -> dict[str, Any] | None:
        """
        원본 식별정보로 smartlaw_chunk 한 건을 조회한다.

        조회 결과가 없으면 None을 반환하고,
        동일 조건으로 여러 행이 존재하면 RuntimeError를 발생시킨다.
        """
        if source_table is None or str(source_table).strip() == "":
            raise ValueError("source_table은 필수입니다.")
        if source_pk < 1:
            raise ValueError("source_pk는 1 이상이어야 합니다.")
        if chunk_type is None or str(chunk_type).strip() == "":
            raise ValueError("chunk_type은 필수입니다.")

        cleaned_source_table = str(source_table).strip()
        cleaned_chunk_type = str(chunk_type).strip()

        try:
            response = (
                self.client.table("smartlaw_chunk")
                .select(
                    "id,"
                    "source_table,"
                    "source_pk,"
                    "document_category,"
                    "document_type,"
                    "law_name,"
                    "chunk_type,"
                    "article_no,"
                    "title,"
                    "header,"
                    "keywords,"
                    "created_at"
                )
                .eq("source_table", cleaned_source_table)
                .eq("source_pk", source_pk)
                .eq("chunk_type", cleaned_chunk_type)
                .order("id")
                .limit(2)
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "smartlaw_chunk 조회 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if not data:
            return None
        if len(data) >= 2:
            raise RuntimeError(
                "동일한 원본을 참조하는 smartlaw_chunk가 여러 건 존재합니다."
            )
        return dict(data[0])

    def update_chunk_keywords(
        self,
        chunk_id: int,
        keywords: Sequence[str],
    ) -> dict[str, Any]:
        """
        smartlaw_chunk.id를 기준으로 keywords 컬럼만 업데이트한다.
        """
        if chunk_id < 1:
            raise ValueError("chunk_id는 1 이상이어야 합니다.")
        if isinstance(keywords, str):
            raise TypeError(
                "keywords는 문자열이 아닌 문자열 Sequence여야 합니다."
            )

        cleaned_keywords = _normalize_keywords_for_storage(keywords)

        try:
            response = (
                self.client.table("smartlaw_chunk")
                .update({"keywords": cleaned_keywords})
                .eq("id", chunk_id)
                .select(
                    "id,source_table,source_pk,chunk_type,"
                    "law_name,article_no,title,header,keywords,created_at"
                )
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "smartlaw_chunk keywords 업데이트 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if not data:
            raise RuntimeError(
                "keywords 업데이트 대상 smartlaw_chunk를 찾을 수 없습니다."
            )
        if len(data) != 1:
            raise RuntimeError(
                "smartlaw_chunk keywords 업데이트 중 오류가 발생했습니다."
            )
        return dict(data[0])

    def update_chunk_embedding(
        self,
        chunk_id: int,
        embedding: Sequence[float],
    ) -> dict[str, Any]:
        """
        smartlaw_chunk.id를 기준으로 embedding 컬럼만 업데이트한다.
        """
        if chunk_id < 1:
            raise ValueError("chunk_id는 1 이상이어야 합니다.")

        cleaned_embedding = _validate_embedding_for_storage(embedding)

        try:
            response = (
                self.client.table("smartlaw_chunk")
                .update({"embedding": cleaned_embedding})
                .eq("id", chunk_id)
                .select(
                    "id,"
                    "source_table,"
                    "source_pk,"
                    "document_category,"
                    "document_type,"
                    "law_name,"
                    "chunk_type,"
                    "article_no,"
                    "title,"
                    "header,"
                    "keywords,"
                    "created_at"
                )
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "smartlaw_chunk embedding 업데이트 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if not data:
            raise RuntimeError(
                "embedding 업데이트 대상 smartlaw_chunk를 찾을 수 없습니다."
            )
        if len(data) != 1:
            raise RuntimeError(
                "smartlaw_chunk embedding 업데이트 결과가 1건이 아닙니다."
            )
        return dict(data[0])

    def _iter_admin_rule_pages(
        self,
        columns: str,
    ):
        """admin_rule 행을 id 오름차순 페이지 단위로 순회한다."""
        offset = 0
        page_size = ADMIN_RULE_ANALYSIS_PAGE_SIZE
        while True:
            response = (
                self.client.table("admin_rule")
                .select(columns)
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = response.data or []
            if not rows:
                break
            yield from rows
            if len(rows) < page_size:
                break
            offset += page_size

    def _count_admin_rule_smartlaw_chunks(
        self,
        *,
        embedded_only: bool = False,
    ) -> int:
        query = (
            self.client.table("smartlaw_chunk")
            .select("id", count="exact")
            .eq("source_table", "admin_rule")
        )
        if embedded_only:
            query = query.not_.is_("embedding", "null")
        response = query.limit(0).execute()
        return int(response.count or 0)

    def get_admin_rule_batch_statistics(
        self,
    ) -> dict[str, int]:
        """
        admin_rule 전체 적재 대상 규모와 데이터 품질 통계를 반환한다.
        """
        try:
            total_rows = 0
            article_rows = 0
            section_rows = 0
            other_section_rows = 0
            null_section_type_rows = 0
            processable_article_rows = 0
            missing_law_name_rows = 0
            missing_article_content_rows = 0
            article_missing_article_no_rows = 0
            seq_ids: set[str] = set()
            law_names: set[str] = set()

            for row in self._iter_admin_rule_pages(
                ADMIN_RULE_ANALYSIS_SELECT_COLUMNS
            ):
                total_rows += 1

                seq_id = row.get("seq_id")
                if not _is_blank(seq_id):
                    seq_ids.add(str(seq_id).strip())

                law_name = row.get("law_name")
                if _is_blank(law_name):
                    missing_law_name_rows += 1
                else:
                    law_names.add(str(law_name).strip())

                article_content = row.get("article_content")
                if _is_blank(article_content):
                    missing_article_content_rows += 1

                raw_section = row.get("section_type")
                if raw_section is None or str(raw_section).strip() == "":
                    section_type = None
                    null_section_type_rows += 1
                else:
                    section_type = str(raw_section).strip()
                    if section_type == "조문":
                        article_rows += 1
                    elif section_type == "장절":
                        section_rows += 1
                    else:
                        other_section_rows += 1

                if section_type == "조문":
                    if _is_blank(row.get("article_no")):
                        article_missing_article_no_rows += 1
                    if (
                        not _is_blank(law_name)
                        and not _is_blank(article_content)
                    ):
                        processable_article_rows += 1

            existing_smartlaw_chunk_rows = (
                self._count_admin_rule_smartlaw_chunks()
            )
            existing_embedded_chunk_rows = (
                self._count_admin_rule_smartlaw_chunks(embedded_only=True)
            )
        except Exception as exc:
            raise RuntimeError(
                "admin_rule 일괄 처리 통계 조회 중 오류가 발생했습니다."
            ) from exc

        return {
            "total_rows": total_rows,
            "document_count_by_seq_id": len(seq_ids),
            "document_count_by_law_name": len(law_names),
            "article_rows": article_rows,
            "section_rows": section_rows,
            "other_section_rows": other_section_rows,
            "null_section_type_rows": null_section_type_rows,
            "processable_article_rows": processable_article_rows,
            "missing_law_name_rows": missing_law_name_rows,
            "missing_article_content_rows": missing_article_content_rows,
            "article_missing_article_no_rows": article_missing_article_no_rows,
            "existing_smartlaw_chunk_rows": existing_smartlaw_chunk_rows,
            "existing_embedded_chunk_rows": existing_embedded_chunk_rows,
        }

    def get_admin_rule_section_counts(
        self,
    ) -> list[dict[str, Any]]:
        """
        section_type별 행 수를 반환한다.
        """
        try:
            counts: dict[Any, int] = {}
            for row in self._iter_admin_rule_pages("section_type"):
                raw_section = row.get("section_type")
                if raw_section is None or str(raw_section).strip() == "":
                    key = None
                else:
                    key = str(raw_section).strip()
                counts[key] = counts.get(key, 0) + 1
        except Exception as exc:
            raise RuntimeError(
                "admin_rule 일괄 처리 통계 조회 중 오류가 발생했습니다."
            ) from exc

        def sort_key(item: tuple[Any, int]) -> tuple[int, str]:
            section_type, _count = item
            if section_type == "조문":
                return (0, "")
            if section_type == "장절":
                return (1, "")
            if section_type is None:
                return (2, "")
            return (3, str(section_type))

        return [
            {"section_type": section_type, "count": count}
            for section_type, count in sorted(counts.items(), key=sort_key)
        ]

    def get_admin_rule_invalid_samples(
        self,
        *,
        limit_per_type: int = 5,
    ) -> dict[str, list[dict[str, Any]]]:
        """
        일괄 처리 전 검토가 필요한 원본 행의 표본을 반환한다.
        """
        if limit_per_type < 1:
            raise ValueError("limit_per_type은 1 이상이어야 합니다.")

        samples: dict[str, list[dict[str, Any]]] = {
            "missing_law_name": [],
            "missing_article_content": [],
            "article_missing_article_no": [],
            "unknown_section_type": [],
        }

        sample_columns = (
            "id",
            "seq_id",
            "law_name",
            "section_type",
            "article_no",
            "article_title",
        )

        def _append_sample(bucket: str, row: Mapping[str, Any]) -> None:
            if len(samples[bucket]) >= limit_per_type:
                return
            samples[bucket].append(
                {key: row.get(key) for key in sample_columns}
            )

        def _all_full() -> bool:
            return all(
                len(rows) >= limit_per_type for rows in samples.values()
            )

        try:
            for row in self._iter_admin_rule_pages(
                ADMIN_RULE_INVALID_SAMPLE_SELECT_COLUMNS
                + ",article_content"
            ):
                if _is_blank(row.get("law_name")):
                    _append_sample("missing_law_name", row)
                if _is_blank(row.get("article_content")):
                    _append_sample("missing_article_content", row)

                raw_section = row.get("section_type")
                if raw_section is None or str(raw_section).strip() == "":
                    section_type = None
                else:
                    section_type = str(raw_section).strip()

                if section_type == "조문" and _is_blank(row.get("article_no")):
                    _append_sample("article_missing_article_no", row)
                elif (
                    section_type is not None
                    and section_type not in {"조문", "장절"}
                ):
                    _append_sample("unknown_section_type", row)

                if _all_full():
                    break
        except Exception as exc:
            raise RuntimeError(
                "admin_rule 일괄 처리 통계 조회 중 오류가 발생했습니다."
            ) from exc

        return samples

    def get_admin_rule_processing_plan(
        self,
        *,
        page_size: int = ADMIN_RULE_BATCH_PAGE_SIZE,
    ) -> list[dict[str, Any]]:
        """
        section_type='조문'인 admin_rule 전체에 대해
        기존 smartlaw_chunk 상태를 포함한 처리 계획을 반환한다.
        """
        if page_size < 1:
            raise ValueError("page_size는 1 이상이어야 합니다.")
        if page_size > 500:
            raise ValueError("page_size는 500 이하여야 합니다.")

        try:
            chunk_index: dict[int, list[dict[str, Any]]] = {}
            chunk_offset = 0
            while True:
                chunk_response = (
                    self.client.table("smartlaw_chunk")
                    .select("id,source_pk,keywords,embedding")
                    .eq("source_table", "admin_rule")
                    .eq("chunk_type", "ARTICLE")
                    .order("id")
                    .range(chunk_offset, chunk_offset + page_size - 1)
                    .execute()
                )
                chunk_rows = chunk_response.data or []
                if not chunk_rows:
                    break
                for chunk_row in chunk_rows:
                    source_pk = chunk_row.get("source_pk")
                    if source_pk is None:
                        continue
                    key = int(source_pk)
                    chunk_index.setdefault(key, []).append(dict(chunk_row))
                if len(chunk_rows) < page_size:
                    break
                chunk_offset += page_size

            plan: list[dict[str, Any]] = []
            rule_offset = 0
            while True:
                rule_response = (
                    self.client.table("admin_rule")
                    .select(
                        "id,"
                        "seq_id,"
                        "law_name,"
                        "section_type,"
                        "article_no,"
                        "article_title,"
                        "article_content"
                    )
                    .eq("section_type", "조문")
                    .order("id")
                    .range(rule_offset, rule_offset + page_size - 1)
                    .execute()
                )
                rule_rows = rule_response.data or []
                if not rule_rows:
                    break

                for rule in rule_rows:
                    source_pk = int(rule["id"])
                    existing = chunk_index.get(source_pk, [])
                    chunk_id: int | None = None
                    status: str

                    if len(existing) == 0:
                        status = "NEW"
                        chunk_id = None
                    elif len(existing) >= 2:
                        status = "DUPLICATE"
                        chunk_id = None
                    else:
                        existing_chunk = existing[0]
                        chunk_id = existing_chunk.get("id")
                        keywords = existing_chunk.get("keywords")
                        embedding = existing_chunk.get("embedding")
                        if keywords is None or (
                            isinstance(keywords, list) and len(keywords) == 0
                        ):
                            status = "NEEDS_KEYWORDS"
                        elif embedding is None:
                            status = "NEEDS_EMBEDDING"
                        else:
                            status = "COMPLETE"

                    plan.append(
                        {
                            "source_table": "admin_rule",
                            "source_pk": source_pk,
                            "chunk_type": "ARTICLE",
                            "chunk_id": chunk_id,
                            "status": status,
                            "seq_id": rule.get("seq_id"),
                            "law_name": rule.get("law_name"),
                            "article_no": rule.get("article_no"),
                            "article_title": rule.get("article_title"),
                        }
                    )

                if len(rule_rows) < page_size:
                    break
                rule_offset += page_size

            plan.sort(key=lambda row: row["source_pk"])
            return plan
        except Exception as exc:
            raise RuntimeError(
                "admin_rule 처리 계획 생성 중 오류가 발생했습니다."
            ) from exc

    def get_admin_rules_by_ids(
        self,
        rule_ids: Sequence[int],
    ) -> list[dict[str, Any]]:
        """
        admin_rule.id 목록으로 원본 조문을 일괄 조회한다.
        """
        if isinstance(rule_ids, (str, bytes)):
            raise TypeError(
                "rule_ids는 정수 Sequence여야 합니다."
            )

        items = list(rule_ids)
        cleaned_rule_ids: list[int] = []
        seen: set[int] = set()

        for value in items:
            if isinstance(value, bool) or not isinstance(value, int):
                raise TypeError(
                    "rule_ids의 모든 항목은 정수여야 합니다."
                )
            if value < 1:
                raise ValueError(
                    "rule_ids의 모든 값은 1 이상이어야 합니다."
                )
            if value in seen:
                continue
            seen.add(value)
            cleaned_rule_ids.append(value)

        if not cleaned_rule_ids:
            return []

        if len(cleaned_rule_ids) > 100:
            raise ValueError(
                "한 번에 조회할 rule_ids는 100개 이하여야 합니다."
            )

        try:
            response = (
                self.client.table("admin_rule")
                .select(ADMIN_RULE_SELECT_COLUMNS)
                .in_("id", cleaned_rule_ids)
                .order("id")
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "admin_rule Batch 조회 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if not data:
            rows: list[dict[str, Any]] = []
        else:
            rows = [dict(row) for row in data]

        for row in rows:
            section_type = row.get("section_type")
            cleaned_section = (
                "" if section_type is None else str(section_type).strip()
            )
            if cleaned_section != "조문":
                raise RuntimeError(
                    "Batch 조회 결과에 조문이 아닌 admin_rule이 포함되어 있습니다."
                )

        found_ids = {int(row["id"]) for row in rows}
        missing_ids = [
            rule_id
            for rule_id in cleaned_rule_ids
            if rule_id not in found_ids
        ]
        if missing_ids:
            raise RuntimeError(
                f"admin_rule Batch 조회 누락 ID가 있습니다: {missing_ids}"
            )

        rows.sort(key=lambda row: int(row["id"]))
        return rows

    def get_chunks_needing_embedding(
        self,
        *,
        source_table: str,
        chunk_type: str,
        limit: int = DEFAULT_EMBEDDING_BATCH_SIZE,
        page_size: int = EMBEDDING_CANDIDATE_PAGE_SIZE,
    ) -> list[dict[str, Any]]:
        """
        keywords는 존재하지만 embedding이 없는 청크를
        source_pk 오름차순으로 조회한다.
        """
        if not isinstance(source_table, str):
            raise TypeError("source_table은 문자열이어야 합니다.")
        cleaned_source_table = source_table.strip()
        if not cleaned_source_table:
            raise ValueError("source_table은 필수입니다.")

        if not isinstance(chunk_type, str):
            raise TypeError("chunk_type은 문자열이어야 합니다.")
        cleaned_chunk_type = chunk_type.strip()
        if not cleaned_chunk_type:
            raise ValueError("chunk_type은 필수입니다.")

        if limit < 1:
            raise ValueError("limit은 1 이상이어야 합니다.")
        if limit > MAX_EMBEDDING_BATCH_SIZE:
            raise ValueError("limit은 100 이하여야 합니다.")
        if page_size < 1:
            raise ValueError("page_size는 1 이상이어야 합니다.")
        if page_size > 500:
            raise ValueError("page_size는 500 이하여야 합니다.")

        results: list[dict[str, Any]] = []
        offset = 0

        try:
            while len(results) < limit:
                response = (
                    self.client.table("smartlaw_chunk")
                    .select(CHUNK_NEEDS_EMBEDDING_SELECT_COLUMNS)
                    .eq("source_table", cleaned_source_table)
                    .eq("chunk_type", cleaned_chunk_type)
                    .is_("embedding", "null")
                    .order("source_pk")
                    .order("id")
                    .range(offset, offset + page_size - 1)
                    .execute()
                )
                rows = response.data or []
                if not rows:
                    break

                for row in rows:
                    chunk = dict(row)
                    keywords = chunk.get("keywords")
                    if not isinstance(keywords, (list, tuple)) or len(keywords) == 0:
                        continue

                    chunk_text = chunk.get("chunk_text")
                    if (
                        not isinstance(chunk_text, str)
                        or chunk_text.strip() == ""
                    ):
                        raise RuntimeError(
                            "Embedding 대상 청크에 chunk_text가 없습니다. "
                            f"chunk_id={chunk.get('id')}"
                        )

                    if chunk.get("embedding") is not None:
                        continue

                    results.append(chunk)
                    if len(results) >= limit:
                        break

                if len(rows) < page_size:
                    break
                offset += page_size
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(
                "Embedding 대상 smartlaw_chunk 조회 중 오류가 발생했습니다."
            ) from exc

        results.sort(key=lambda row: int(row["source_pk"]))
        return results[:limit]

    def save_chunk(self, chunk: Mapping[str, Any]) -> dict[str, Any]:
        """
        smartlaw_chunk 테이블에 1건 insert 한다.

        입력 원본은 수정하지 않는다.

        Args:
            chunk: 저장할 chunk Mapping.

        Returns:
            저장된 행 (select 결과 첫 건).
        """
        _validate_required_fields(chunk)
        payload = _build_chunk_payload(chunk)

        try:
            response = (
                self.client.table("smartlaw_chunk")
                .insert(payload)
                .select("*")
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "smartlaw_chunk 저장 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if not data:
            raise RuntimeError("smartlaw_chunk 저장 결과가 없습니다.")
        return dict(data[0])

    def save_chunks(
        self,
        chunks: Sequence[Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        smartlaw_chunk 테이블에 여러 건을 한 번에 insert 한다.

        빈 목록이면 DB를 호출하지 않는다.

        Args:
            chunks: 저장할 chunk 목록.

        Returns:
            저장된 행 목록.
        """
        items = list(chunks)
        if not items:
            return []

        payloads: list[dict[str, Any]] = []
        for chunk in items:
            copied = dict(chunk)
            _validate_required_fields(copied)
            payloads.append(_build_chunk_payload(copied))

        try:
            response = (
                self.client.table("smartlaw_chunk")
                .insert(payloads)
                .select("*")
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "smartlaw_chunk 일괄 저장 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if data is None:
            return []
        return list(data)

    def match_smartlaw_chunks(
        self,
        query_embedding: Sequence[float],
        *,
        match_count: int = DEFAULT_VECTOR_MATCH_COUNT,
        match_threshold: float = 0.0,
        document_category: str | None = None,
        document_type: str | None = None,
        source_table: str | None = None,
        chunk_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        public.match_smartlaw_chunk RPC를 호출하여
        cosine similarity 상위 청크를 반환한다.
        """
        if isinstance(query_embedding, (str, bytes)):
            raise TypeError(
                "query_embedding은 실수 Sequence여야 합니다."
            )

        values = list(query_embedding)
        if len(values) != SMARTLAW_EMBEDDING_DIMENSION:
            raise ValueError(
                "query_embedding은 768차원이어야 합니다."
            )

        cleaned_embedding: list[float] = []
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError(
                    "query_embedding의 모든 값은 숫자여야 합니다."
                )
            number = float(value)
            if not math.isfinite(number):
                raise ValueError(
                    "query_embedding에 유효하지 않은 숫자가 있습니다."
                )
            cleaned_embedding.append(number)

        if isinstance(match_count, bool) or not isinstance(match_count, int):
            raise TypeError("match_count는 정수여야 합니다.")
        if match_count < 1 or match_count > MAX_VECTOR_MATCH_COUNT:
            raise ValueError(
                "match_count는 1 이상 100 이하여야 합니다."
            )

        if isinstance(match_threshold, bool) or not isinstance(
            match_threshold,
            (int, float),
        ):
            raise TypeError(
                "match_threshold는 숫자여야 합니다."
            )
        cleaned_threshold = float(match_threshold)
        if not math.isfinite(cleaned_threshold):
            raise ValueError(
                "match_threshold는 유효한 숫자여야 합니다."
            )
        if cleaned_threshold < -1 or cleaned_threshold > 1:
            raise ValueError(
                "match_threshold는 -1 이상 1 이하여야 합니다."
            )

        cleaned_document_category = _normalize_optional_filter(
            document_category,
            "document_category",
        )
        cleaned_document_type = _normalize_optional_filter(
            document_type,
            "document_type",
        )
        cleaned_source_table = _normalize_optional_filter(
            source_table,
            "source_table",
        )
        cleaned_chunk_type = _normalize_optional_filter(
            chunk_type,
            "chunk_type",
        )

        rpc_params = {
            "query_embedding": cleaned_embedding,
            "match_count": match_count,
            "match_threshold": cleaned_threshold,
            "filter_document_category": (
                cleaned_document_category
            ),
            "filter_document_type": cleaned_document_type,
            "filter_source_table": cleaned_source_table,
            "filter_chunk_type": cleaned_chunk_type,
        }

        try:
            response = (
                self.client
                .rpc(
                    "match_smartlaw_chunk",
                    rpc_params,
                )
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "match_smartlaw_chunk RPC 호출 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if data is None:
            return []
        if not isinstance(data, list):
            raise RuntimeError(
                "Vector Search RPC 결과 형식이 올바르지 않습니다."
            )

        required_fields = (
            "id",
            "source_table",
            "source_pk",
            "document_category",
            "document_type",
            "law_name",
            "chunk_type",
            "chunk_text",
            "similarity",
        )

        rows: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, Mapping):
                raise RuntimeError(
                    "Vector Search RPC 결과 형식이 올바르지 않습니다."
                )

            result = dict(row)
            for field_name in required_fields:
                if field_name not in result:
                    raise RuntimeError(
                        "Vector Search 결과 필수값이 없습니다: "
                        f"{field_name}"
                    )

            similarity = result["similarity"]
            if isinstance(similarity, bool) or not isinstance(
                similarity,
                (int, float),
            ):
                raise RuntimeError(
                    "Vector Search 결과 similarity 범위가 올바르지 않습니다."
                )
            similarity_value = float(similarity)
            if not math.isfinite(similarity_value):
                raise RuntimeError(
                    "Vector Search 결과 similarity 범위가 올바르지 않습니다."
                )
            if similarity_value < -1 or similarity_value > 1:
                raise RuntimeError(
                    "Vector Search 결과 similarity 범위가 올바르지 않습니다."
                )
            result["similarity"] = similarity_value
            rows.append(result)

        return rows

    def search_smartlaw_chunks_by_keywords(
        self,
        query_terms: Sequence[str],
        *,
        match_count: int = DEFAULT_KEYWORD_MATCH_COUNT,
        match_threshold: float = 0.0,
        document_category: str | None = None,
        document_type: str | None = None,
        source_table: str | None = None,
        chunk_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        search_smartlaw_chunk_keywords RPC를 호출한다.
        """
        if isinstance(query_terms, (str, bytes)):
            raise TypeError(
                "query_terms는 문자열 Sequence여야 합니다."
            )

        cleaned_terms: list[str] = []
        seen_terms: set[str] = set()
        for term in list(query_terms):
            if not isinstance(term, str):
                raise TypeError(
                    "query_terms는 문자열 Sequence여야 합니다."
                )
            cleaned = term.strip()
            if cleaned == "":
                continue
            if cleaned in seen_terms:
                continue
            seen_terms.add(cleaned)
            cleaned_terms.append(cleaned)

        if not cleaned_terms:
            raise ValueError(
                "query_terms는 1개 이상이어야 합니다."
            )
        if len(cleaned_terms) > 50:
            raise ValueError(
                "query_terms는 50개 이하여야 합니다."
            )

        if isinstance(match_count, bool) or not isinstance(match_count, int):
            raise TypeError("match_count는 정수여야 합니다.")
        if match_count < 1 or match_count > MAX_KEYWORD_MATCH_COUNT:
            raise ValueError(
                "match_count는 1 이상 100 이하여야 합니다."
            )

        if isinstance(match_threshold, bool) or not isinstance(
            match_threshold,
            (int, float),
        ):
            raise TypeError(
                "match_threshold는 숫자여야 합니다."
            )
        cleaned_threshold = float(match_threshold)
        if not math.isfinite(cleaned_threshold):
            raise ValueError(
                "match_threshold는 유효한 숫자여야 합니다."
            )
        if cleaned_threshold < 0 or cleaned_threshold > 1:
            raise ValueError(
                "match_threshold는 0 이상 1 이하여야 합니다."
            )

        cleaned_document_category = _normalize_optional_filter(
            document_category,
            "document_category",
        )
        cleaned_document_type = _normalize_optional_filter(
            document_type,
            "document_type",
        )
        cleaned_source_table = _normalize_optional_filter(
            source_table,
            "source_table",
        )
        cleaned_chunk_type = _normalize_optional_filter(
            chunk_type,
            "chunk_type",
        )

        rpc_params = {
            "query_terms": cleaned_terms,
            "match_count": match_count,
            "match_threshold": cleaned_threshold,
            "filter_document_category": (
                cleaned_document_category
            ),
            "filter_document_type": cleaned_document_type,
            "filter_source_table": cleaned_source_table,
            "filter_chunk_type": cleaned_chunk_type,
        }

        try:
            response = (
                self.client
                .rpc(
                    "search_smartlaw_chunk_keywords",
                    rpc_params,
                )
                .execute()
            )
        except Exception as exc:
            raise RuntimeError(
                "Keyword Search RPC 호출 중 오류가 발생했습니다."
            ) from exc

        data = response.data
        if data is None:
            return []
        if not isinstance(data, list):
            raise RuntimeError(
                "Keyword Search RPC 결과 형식이 올바르지 않습니다."
            )

        required_fields = (
            "id",
            "source_table",
            "source_pk",
            "document_category",
            "document_type",
            "law_name",
            "chunk_type",
            "keywords",
            "matched_keywords",
            "exact_match_count",
            "partial_match_count",
            "keyword_score",
        )

        rows: list[dict[str, Any]] = []
        for row in data:
            if not isinstance(row, Mapping):
                raise RuntimeError(
                    "Keyword Search RPC 결과 형식이 올바르지 않습니다."
                )

            result = dict(row)
            for field_name in required_fields:
                if field_name not in result:
                    raise RuntimeError(
                        "Keyword Search 결과 필수값이 없습니다: "
                        f"{field_name}"
                    )

            keyword_score = result["keyword_score"]
            if isinstance(keyword_score, bool) or not isinstance(
                keyword_score,
                (int, float),
            ):
                raise RuntimeError(
                    "Keyword Search 결과 keyword_score 범위가 올바르지 않습니다."
                )
            score_value = float(keyword_score)
            if not math.isfinite(score_value):
                raise RuntimeError(
                    "Keyword Search 결과 keyword_score 범위가 올바르지 않습니다."
                )
            if score_value < 0 or score_value > 1:
                raise RuntimeError(
                    "Keyword Search 결과 keyword_score 범위가 올바르지 않습니다."
                )
            result["keyword_score"] = score_value
            rows.append(result)

        return rows


if __name__ == "__main__":
    repo = SupabaseRepository()
    rule = repo.get_admin_rule(2)
    if rule is None:
        raise RuntimeError("admin_rule id=2 조회 결과가 없습니다.")

    pprint(
        {
            "id": rule.get("id"),
            "sqlite_id": rule.get("sqlite_id"),
            "gubun": rule.get("gubun"),
            "param": rule.get("param"),
            "seq_id": rule.get("seq_id"),
            "law_name": rule.get("law_name"),
            "promulgation_no": rule.get("promulgation_no"),
            "promulgation_dt": rule.get("promulgation_dt"),
            "section_type": rule.get("section_type"),
            "article_no": rule.get("article_no"),
            "article_title": rule.get("article_title"),
        },
        sort_dicts=False,
    )
    print(
        "article_content 길이:",
        len(rule.get("article_content") or ""),
    )

    assert rule["id"] == 2
    assert rule["law_name"]
    assert rule["section_type"] == "조문"
    assert rule["article_no"] == "제1조"

    print("OK: STEP 4-3 admin_rule 1건 실제 조회 완료")
