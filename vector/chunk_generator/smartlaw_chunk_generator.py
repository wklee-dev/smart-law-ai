# smartlaw_chunk_generator.py
#
# 역할: admin_rule 등 원본 1건을 smartlaw_chunk 저장용 dict 로 변환한다.
#
# - chunk_builder.build_chunk_text / build_article_label
# - metadata_builder.build_metadata
# - DB 저장·Embedding 은 하지 않는다.

from __future__ import annotations

import math
import os
import time
from collections.abc import Callable, Mapping, Sequence
from pprint import pprint
from typing import Any

from vector.chunk_generator.chunk_builder import build_chunk_text
from vector.chunk_generator.embedding_service import EmbeddingService
from vector.chunk_generator.metadata_builder import (
    build_metadata,
    extract_document_type,
)
from vector.chunk_generator.supabase_repository import SupabaseRepository

PROCESS_STATUS_NEW = "NEW"
PROCESS_STATUS_NEEDS_KEYWORDS = "NEEDS_KEYWORDS"
PROCESS_STATUS_NEEDS_EMBEDDING = "NEEDS_EMBEDDING"
PROCESS_STATUS_COMPLETE = "COMPLETE"
PROCESS_STATUS_DUPLICATE = "DUPLICATE"

SUPPORTED_PROCESS_STATUSES = frozenset(
    {
        PROCESS_STATUS_NEW,
        PROCESS_STATUS_NEEDS_KEYWORDS,
        PROCESS_STATUS_NEEDS_EMBEDDING,
        PROCESS_STATUS_COMPLETE,
        PROCESS_STATUS_DUPLICATE,
    }
)

DEFAULT_PREVIEW_BATCH_SIZE = 10
MAX_PREVIEW_BATCH_SIZE = 100

BATCH_RESULT_READY = "READY"
BATCH_RESULT_ERROR = "ERROR"
BATCH_SAVE_STATUS_SAVED = "SAVED"

EMBEDDING_BATCH_SUCCESS = "SUCCESS"
EMBEDDING_BATCH_ERROR = "ERROR"

RECOVERY_STATUS_SUCCESS = "SUCCESS"
RECOVERY_STATUS_ERROR = "ERROR"
RECOVERY_STATUS_SKIP = "SKIP"

SUPPORTED_RECOVERY_STATUSES = frozenset(
    {
        RECOVERY_STATUS_SUCCESS,
        RECOVERY_STATUS_ERROR,
        RECOVERY_STATUS_SKIP,
    }
)

DEFAULT_RECOVERY_RETRY_LIMIT = 100

FULL_BATCH_CONFIRM_ENV = "SMARTLAW_FULL_BATCH_CONFIRM"
FULL_BATCH_CONFIRM_VALUE = "YES"
FULL_BATCH_MAX_CYCLES_ENV = "SMARTLAW_FULL_BATCH_MAX_CYCLES"

DEFAULT_FULL_BATCH_SIZE = 10
MAX_FULL_BATCH_SIZE = 100

FULL_RUN_STATUS_COMPLETED = "COMPLETED"
FULL_RUN_STATUS_PARTIAL = "PARTIAL"
FULL_RUN_STATUS_ERROR = "ERROR"

_BATCH_SAVE_REQUIRED_FIELDS = (
    "source_table",
    "source_pk",
    "document_category",
    "document_type",
    "law_name",
    "chunk_type",
    "header",
    "body",
    "chunk_text",
    "keywords",
)

_BATCH_SAVE_REQUIRED_STRING_FIELDS = frozenset(
    {
        "source_table",
        "document_category",
        "document_type",
        "law_name",
        "chunk_type",
        "header",
        "body",
        "chunk_text",
    }
)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _build_title(document: Mapping[str, Any], metadata: Mapping[str, Any]) -> str:
    """
    title / header 생성.

    - article_title 이 article_label 을 포함하면 article_title 만 사용
      (제1조 + 제1조(목적) → 제1조(목적))
    - 포함하지 않으면 \"제1조 목적\" 형태
    - label 만 있으면 label
    - 둘 다 없으면 law_name
    """
    label = _as_text(metadata.get("article_label"))
    article_title = _as_text(document.get("article_title"))
    if label and article_title:
        if label in article_title:
            return article_title
        return f"{label} {article_title}"
    if label:
        return label
    if article_title:
        return article_title
    return _as_text(document.get("law_name"))


def _chunk_text_document(
    document: Mapping[str, Any],
    *,
    document_category: str,
) -> dict[str, Any]:
    """
    build_chunk_text 용 뷰 dict (원본 document 는 수정하지 않음).

    ADMIN_RULE 등 코드값은 chunk_text 표시용 한글 라벨로 치환한다.
    """
    display_category = {
        "ADMIN_RULE": "행정규칙",
        "LAW": "법령",
        "ADDENDUM": "부칙",
        "ANNEX": "별표",
    }.get(document_category, document_category)

    raw_category = _as_text(document.get("document_category"))
    if raw_category and raw_category not in (
        "ADMIN_RULE",
        "LAW",
        "ADDENDUM",
        "ANNEX",
    ):
        display_category = raw_category
    elif not raw_category:
        display_category = display_category or "행정규칙"

    return {
        "document_category": display_category,
        "law_name": document.get("law_name"),
        "article_no": document.get("article_no"),
        "article_title": document.get("article_title"),
        "article_content": document.get("article_content"),
    }


def _resolve_document_type(document: Mapping[str, Any]) -> str:
    raw_document_type = document.get("document_type")
    if isinstance(raw_document_type, str):
        cleaned = raw_document_type.strip()
        if cleaned:
            return cleaned
    return extract_document_type(document.get("law_name"))


def generate_chunk(document: Mapping[str, Any]) -> dict[str, Any]:
    """
    원본 문서 1건을 smartlaw_chunk 저장용 dict 로 변환한다.

    admin_rule / addendum / annex / law 공통으로 사용한다.

    Args:
        document: 원본 행. 수정하지 않는다.

    Returns:
        smartlaw_chunk 저장용 dict.
    """
    source_table = _as_text(document.get("source_table")) or "admin_rule"
    source_pk = document.get("source_pk", document.get("id"))
    document_category = _as_text(document.get("document_category")) or "ADMIN_RULE"
    if document_category in ("행정규칙",):
        document_category = "ADMIN_RULE"
    elif document_category in ("법령",):
        document_category = "LAW"

    document_type = _resolve_document_type(document)
    chunk_type = _as_text(document.get("chunk_type")) or "ARTICLE"

    metadata = build_metadata(
        document,
        source_table=source_table,
        source_pk=source_pk,
        document_category=document_category,
        document_type=document_type,
        chunk_type=chunk_type,
    )

    chunk_text = build_chunk_text(
        _chunk_text_document(document, document_category=document_category)
    )
    title = _build_title(document, metadata)
    body = _as_text(document.get("article_content"))
    law_name = _as_text(document.get("law_name"))
    article_no = _as_text(document.get("article_no"))

    return {
        "source_table": source_table,
        "source_pk": source_pk,
        "document_category": document_category,
        "document_type": document_type,
        "law_name": law_name,
        "chunk_type": chunk_type,
        "article_no": article_no,
        "title": title,
        "header": title,
        "body": body,
        "chunk_text": chunk_text,
        "metadata": metadata,
    }


def diagnose_admin_rule_chunk(
    repository: SupabaseRepository,
    source_pk: int,
) -> dict[str, Any]:
    """
    admin_rule 한 건을 조회하여 generate_chunk() 결과와
    document_type 생성 상태를 진단한다.
    """
    if isinstance(source_pk, bool) or not isinstance(source_pk, int):
        raise TypeError("source_pk는 정수여야 합니다.")
    if source_pk < 1:
        raise ValueError("source_pk는 1 이상이어야 합니다.")

    document = repository.get_admin_rule(source_pk)
    if document is None:
        raise RuntimeError(
            f"admin_rule을 찾을 수 없습니다. source_pk={source_pk}"
        )

    chunk = generate_chunk(document)
    metadata = chunk.get("metadata") or {}

    return {
        "source_pk": source_pk,
        "document": {
            "id": document.get("id"),
            "gubun": document.get("gubun"),
            "param": document.get("param"),
            "seq_id": document.get("seq_id"),
            "law_name": document.get("law_name"),
            "section_type": document.get("section_type"),
            "article_no": document.get("article_no"),
            "article_title": document.get("article_title"),
        },
        "chunk": {
            "source_table": chunk.get("source_table"),
            "source_pk": chunk.get("source_pk"),
            "document_category": chunk.get("document_category"),
            "document_type": chunk.get("document_type"),
            "law_name": chunk.get("law_name"),
            "chunk_type": chunk.get("chunk_type"),
            "article_no": chunk.get("article_no"),
            "title": chunk.get("title"),
            "header": chunk.get("header"),
        },
        "metadata": {
            "document_category": metadata.get("document_category"),
            "document_type": metadata.get("document_type"),
            "gubun": metadata.get("gubun"),
            "param": metadata.get("param"),
        },
    }


def validate_admin_rule_document_types(
    repository: SupabaseRepository,
) -> dict[str, Any]:
    """
    전체 admin_rule 문서의 law_name에 대해
    document_type 추출 가능 여부를 사전검증한다.
    """
    plan = repository.get_admin_rule_processing_plan(
        page_size=100,
    )

    seen_keys: set[str] = set()
    valid_rows: list[dict[str, Any]] = []
    error_rows: list[dict[str, Any]] = []

    for row in plan:
        seq_id = row.get("seq_id")
        law_name = row.get("law_name")

        if seq_id is not None and str(seq_id).strip() != "":
            document_key = str(seq_id)
        else:
            document_key = "" if law_name is None else str(law_name)

        if document_key in seen_keys:
            continue
        seen_keys.add(document_key)

        try:
            document_type = extract_document_type(law_name)
            valid_rows.append(
                {
                    "seq_id": seq_id,
                    "law_name": law_name,
                    "document_type": document_type,
                    "status": "VALID",
                }
            )
        except Exception as exc:
            error_rows.append(
                {
                    "seq_id": seq_id,
                    "law_name": law_name,
                    "status": "ERROR",
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                }
            )

    return {
        "total_documents": len(seen_keys),
        "valid_count": len(valid_rows),
        "error_count": len(error_rows),
        "valid": valid_rows,
        "error": error_rows,
    }


def generate_and_save_chunk(
    repository: SupabaseRepository,
    rule_id: int,
) -> dict[str, Any]:
    """
    admin_rule 1건을 조회·청크 변환한 뒤 smartlaw_chunk 에 저장한다.

    keywords·embedding 은 생성하지 않는다.

    Args:
        repository: SupabaseRepository 인스턴스.
        rule_id: admin_rule.id (1 이상).

    Returns:
        save_chunk() 가 반환한 저장된 행.
    """
    if rule_id < 1:
        raise ValueError("rule_id는 1 이상이어야 합니다.")

    document = repository.get_admin_rule(rule_id)
    if document is None:
        raise ValueError(f"admin_rule을 찾을 수 없습니다. rule_id={rule_id}")

    chunk = generate_chunk(document)
    return repository.save_chunk(chunk)


def analyze_admin_rule_batch(
    repository: SupabaseRepository,
) -> dict[str, Any]:
    """
    행정규칙 전체 적재 전 통계와 검토 대상을 분석한다.
    """
    statistics = repository.get_admin_rule_batch_statistics()
    section_counts = repository.get_admin_rule_section_counts()
    invalid_samples = repository.get_admin_rule_invalid_samples(
        limit_per_type=5,
    )
    return {
        "statistics": statistics,
        "section_counts": section_counts,
        "invalid_samples": invalid_samples,
    }


def build_admin_rule_processing_summary(
    repository: SupabaseRepository,
    *,
    page_size: int = 100,
) -> dict[str, Any]:
    """
    admin_rule ARTICLE Batch 처리 계획과 상태 요약을 생성한다.
    """
    plan = repository.get_admin_rule_processing_plan(
        page_size=page_size,
    )

    new_count = 0
    needs_keywords = 0
    needs_embedding = 0
    complete = 0
    duplicate = 0

    for row in plan:
        status = row.get("status")
        if status not in SUPPORTED_PROCESS_STATUSES:
            raise RuntimeError(f"알 수 없는 처리 상태입니다: {status}")
        if status == PROCESS_STATUS_NEW:
            new_count += 1
        elif status == PROCESS_STATUS_NEEDS_KEYWORDS:
            needs_keywords += 1
        elif status == PROCESS_STATUS_NEEDS_EMBEDDING:
            needs_embedding += 1
        elif status == PROCESS_STATUS_COMPLETE:
            complete += 1
        elif status == PROCESS_STATUS_DUPLICATE:
            duplicate += 1

    return {
        "total": len(plan),
        "new": new_count,
        "needs_keywords": needs_keywords,
        "needs_embedding": needs_embedding,
        "complete": complete,
        "duplicate": duplicate,
        "plan": plan,
    }


def prepare_admin_rule_batch(
    repository: SupabaseRepository,
    *,
    batch_size: int = DEFAULT_PREVIEW_BATCH_SIZE,
) -> list[dict[str, Any]]:
    """
    NEW 상태의 admin_rule ARTICLE 일부를 조회하여
    청크와 확장 키워드를 메모리에서 생성한다.
    """
    # keyword_extractor ↔ 이 모듈 순환 import 방지
    from vector.chunk_generator.keyword_extractor import (
        expand_dictionary_keywords,
        extract_keywords,
    )

    if batch_size < 1:
        raise ValueError("batch_size는 1 이상이어야 합니다.")
    if batch_size > MAX_PREVIEW_BATCH_SIZE:
        raise ValueError("batch_size는 100 이하여야 합니다.")

    plan = repository.get_admin_rule_processing_plan(page_size=100)

    if any(row.get("status") == PROCESS_STATUS_DUPLICATE for row in plan):
        raise RuntimeError(
            "중복 smartlaw_chunk가 있어 Batch를 준비할 수 없습니다."
        )

    new_rows = sorted(
        (
            row
            for row in plan
            if row.get("status") == PROCESS_STATUS_NEW
        ),
        key=lambda row: row["source_pk"],
    )
    selected_rows = new_rows[:batch_size]
    if not selected_rows:
        return []

    selected_source_pks = [int(row["source_pk"]) for row in selected_rows]
    documents = repository.get_admin_rules_by_ids(selected_source_pks)
    document_ids = [int(document["id"]) for document in documents]
    if document_ids != selected_source_pks:
        raise RuntimeError(
            "Batch 처리 계획과 원본 조회 순서가 일치하지 않습니다."
        )

    dictionary_rows = repository.get_dictionary_entries()

    results: list[dict[str, Any]] = []
    for document in documents:
        source_pk = int(document["id"])
        try:
            chunk = generate_chunk(document)
            base_keywords = extract_keywords(
                document,
                chunk["chunk_text"],
                max_keywords=30,
            )
            expanded_keywords = expand_dictionary_keywords(
                base_keywords,
                dictionary_rows,
                max_keywords=40,
            )
            payload = dict(chunk)
            payload["keywords"] = list(expanded_keywords)
            results.append(
                {
                    "source_pk": source_pk,
                    "status": BATCH_RESULT_READY,
                    "chunk": payload,
                    "base_keywords": list(base_keywords),
                    "expanded_keywords": list(expanded_keywords),
                }
            )
        except Exception as exc:
            results.append(
                {
                    "source_pk": source_pk,
                    "status": BATCH_RESULT_ERROR,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                }
            )

    results.sort(key=lambda row: row["source_pk"])
    return results


def summarize_prepared_batch(
    results: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """
    prepare_admin_rule_batch() 결과의 요약을 반환한다.
    """
    source_pks: list[Any] = []
    ready_source_pks: list[Any] = []
    error_source_pks: list[Any] = []
    ready = 0
    error = 0

    for row in results:
        status = row.get("status")
        source_pk = row.get("source_pk")
        source_pks.append(source_pk)

        if status == BATCH_RESULT_READY:
            ready += 1
            ready_source_pks.append(source_pk)
        elif status == BATCH_RESULT_ERROR:
            error += 1
            error_source_pks.append(source_pk)
        else:
            raise RuntimeError(
                f"알 수 없는 Batch 결과 상태입니다: {status}"
            )

    return {
        "total": len(results),
        "ready": ready,
        "error": error,
        "source_pks": source_pks,
        "ready_source_pks": ready_source_pks,
        "error_source_pks": error_source_pks,
    }


def _raise_batch_save_required_missing(
    result: Mapping[str, Any],
    chunk: Mapping[str, Any],
    field_name: str,
) -> None:
    source_pk = result.get(
        "source_pk",
        chunk.get("source_pk"),
    )
    raise ValueError(
        "Batch 저장 필수값이 없습니다. "
        f"source_pk={source_pk}, field={field_name}"
    )


def validate_prepared_batch_for_save(
    prepared_results: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """
    STEP 7-3 준비 결과를 검증하고
    DB 저장용 payload 목록을 반환한다.
    """
    if isinstance(prepared_results, (str, bytes)):
        raise TypeError(
            "prepared_results는 Mapping Sequence여야 합니다."
        )

    items = list(prepared_results)
    if not items:
        return []

    payloads: list[dict[str, Any]] = []
    seen_source_pks: set[int] = set()

    for result in items:
        if not isinstance(result, Mapping):
            raise TypeError(
                "prepared_results의 모든 항목은 Mapping이어야 합니다."
            )

        status = result.get("status")
        if status != BATCH_RESULT_READY:
            raise RuntimeError(
                f"저장할 수 없는 Batch 결과 상태입니다: {status}"
            )

        chunk = result.get("chunk")
        if not isinstance(chunk, Mapping):
            raise RuntimeError(
                "READY 결과에 저장할 chunk가 없습니다."
            )

        for field_name in _BATCH_SAVE_REQUIRED_FIELDS:
            if field_name not in chunk:
                _raise_batch_save_required_missing(
                    result,
                    chunk,
                    field_name,
                )

            value = chunk[field_name]

            if field_name == "source_pk":
                if isinstance(value, bool) or not isinstance(value, int):
                    _raise_batch_save_required_missing(
                        result,
                        chunk,
                        field_name,
                    )
                if value < 1:
                    _raise_batch_save_required_missing(
                        result,
                        chunk,
                        field_name,
                    )
            elif field_name == "keywords":
                if not isinstance(value, (list, tuple)) or len(value) == 0:
                    _raise_batch_save_required_missing(
                        result,
                        chunk,
                        field_name,
                    )
            elif field_name in _BATCH_SAVE_REQUIRED_STRING_FIELDS:
                if not isinstance(value, str) or value.strip() == "":
                    _raise_batch_save_required_missing(
                        result,
                        chunk,
                        field_name,
                    )

        if (
            "embedding" in chunk
            and chunk.get("embedding") is not None
        ):
            raise RuntimeError(
                "STEP 7-4 Batch payload에는 embedding이 포함되면 안 됩니다."
            )

        if chunk.get("source_table") != "admin_rule":
            _raise_batch_save_required_missing(
                result,
                chunk,
                "source_table",
            )
        if chunk.get("chunk_type") != "ARTICLE":
            _raise_batch_save_required_missing(
                result,
                chunk,
                "chunk_type",
            )

        source_pk = chunk["source_pk"]
        if source_pk in seen_source_pks:
            raise RuntimeError(
                f"Batch 내부에 중복 source_pk가 있습니다: {source_pk}"
            )
        seen_source_pks.add(source_pk)

        payload = dict(chunk)
        payload.pop("id", None)
        payload.pop("created_at", None)
        payload.pop("embedding", None)
        payload["keywords"] = list(chunk["keywords"])
        payloads.append(payload)

    payloads.sort(key=lambda row: int(row["source_pk"]))
    return payloads


def save_prepared_chunk_batch(
    repository: SupabaseRepository,
    prepared_results: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """
    검증된 준비 결과를 smartlaw_chunk에 일괄 저장한다.
    """
    payloads = validate_prepared_batch_for_save(prepared_results)
    if not payloads:
        return []

    saved_rows = repository.save_chunks(payloads)
    if len(saved_rows) != len(payloads):
        raise RuntimeError(
            "Batch 저장 요청 건수와 저장 결과 건수가 일치하지 않습니다."
        )

    ordered_saved = sorted(
        (dict(row) for row in saved_rows),
        key=lambda row: int(row["source_pk"]),
    )

    requested_pks = [int(row["source_pk"]) for row in payloads]
    saved_pks = [int(row["source_pk"]) for row in ordered_saved]
    if saved_pks != requested_pks:
        raise RuntimeError(
            "Batch 저장 요청과 저장 결과의 source_pk가 일치하지 않습니다."
        )

    for row in ordered_saved:
        if row.get("id") is None:
            raise RuntimeError(
                "Batch 저장 결과에 smartlaw_chunk.id가 없습니다."
            )
        if (
            "embedding" in row
            and row.get("embedding") is not None
        ):
            raise RuntimeError(
                "STEP 7-4 저장 결과에 예상하지 않은 embedding이 존재합니다."
            )

    return ordered_saved


def run_admin_rule_chunk_save_batch(
    repository: SupabaseRepository,
    *,
    batch_size: int = DEFAULT_PREVIEW_BATCH_SIZE,
) -> dict[str, Any]:
    """
    NEW 행정규칙 조문을 준비하고 청크·키워드를 Batch 저장한다.
    """
    prepared_results = prepare_admin_rule_batch(
        repository,
        batch_size=batch_size,
    )
    prepared_summary = summarize_prepared_batch(prepared_results)

    if prepared_summary["error"] >= 1:
        raise RuntimeError(
            "준비 단계에 ERROR가 있어 Batch 저장을 중단합니다."
        )

    saved_rows = save_prepared_chunk_batch(
        repository,
        prepared_results,
    )

    return {
        "requested": prepared_summary["total"],
        "prepared": prepared_summary["ready"],
        "saved": len(saved_rows),
        "source_pks": [row["source_pk"] for row in saved_rows],
        "saved_rows": saved_rows,
    }


def _resolve_embedding_title(
    chunk: Mapping[str, Any],
) -> str | None:
    """
    문서 Embedding title을 결정한다.
    """
    for key in ("title", "header", "law_name"):
        value = chunk.get(key)
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                return cleaned
    return None


def _validate_generated_embedding(
    embedding: Any,
    *,
    expected_dimension: int,
) -> float:
    if not isinstance(embedding, list):
        raise RuntimeError("Embedding 결과는 list여야 합니다.")
    if len(embedding) != expected_dimension:
        raise RuntimeError(
            "Embedding 차원이 일치하지 않습니다. "
            f"expected={expected_dimension}, actual={len(embedding)}"
        )
    if len(embedding) != 768:
        raise RuntimeError(
            "Embedding 차원이 일치하지 않습니다. "
            f"expected=768, actual={len(embedding)}"
        )
    for value in embedding:
        if not isinstance(value, float):
            raise RuntimeError("Embedding vector의 모든 값은 float여야 합니다.")
        if not math.isfinite(value):
            raise RuntimeError(
                "Embedding vector에 유효하지 않은 숫자가 포함되어 있습니다."
            )

    embedding_norm = math.sqrt(
        math.fsum(value * value for value in embedding)
    )
    if not math.isclose(
        embedding_norm,
        1.0,
        rel_tol=1e-6,
        abs_tol=1e-6,
    ):
        raise RuntimeError(
            "Embedding vector의 L2 norm이 1.0이 아닙니다."
        )
    return embedding_norm


def run_chunk_embedding_batch(
    repository: SupabaseRepository,
    embedding_service: EmbeddingService,
    *,
    source_table: str,
    chunk_type: str,
    batch_size: int = 10,
) -> list[dict[str, Any]]:
    """
    Embedding이 필요한 청크 일부에 문서 Embedding을 생성하고
    기존 행의 embedding 컬럼을 업데이트한다.
    """
    chunks = repository.get_chunks_needing_embedding(
        source_table=source_table,
        chunk_type=chunk_type,
        limit=batch_size,
    )
    if not chunks:
        return []

    ordered_chunks = sorted(
        chunks,
        key=lambda row: int(row["source_pk"]),
    )

    results: list[dict[str, Any]] = []
    for chunk in ordered_chunks:
        try:
            chunk_id = chunk["id"]
            chunk_text = chunk["chunk_text"]
            document_title = _resolve_embedding_title(chunk)

            embedding = embedding_service.generate_document_embedding(
                chunk_text,
                title=document_title,
            )
            embedding_norm = _validate_generated_embedding(
                embedding,
                expected_dimension=embedding_service.output_dimensionality,
            )

            updated = repository.update_chunk_embedding(
                chunk_id=chunk_id,
                embedding=embedding,
            )

            results.append(
                {
                    "chunk_id": chunk_id,
                    "source_pk": chunk["source_pk"],
                    "status": EMBEDDING_BATCH_SUCCESS,
                    "law_name": chunk["law_name"],
                    "article_no": chunk.get("article_no"),
                    "title": document_title,
                    "embedding_dimension": len(embedding),
                    "embedding_norm": embedding_norm,
                    "updated_id": updated["id"],
                }
            )
        except Exception as exc:
            results.append(
                {
                    "chunk_id": chunk.get("id"),
                    "source_pk": chunk.get("source_pk"),
                    "status": EMBEDDING_BATCH_ERROR,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                }
            )

    results.sort(
        key=lambda row: (
            -1
            if row.get("source_pk") is None
            else int(row["source_pk"])
        )
    )
    return results


def summarize_embedding_batch(
    results: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """
    Embedding Batch 실행 결과를 요약한다.
    """
    source_pks: list[Any] = []
    success_source_pks: list[Any] = []
    error_source_pks: list[Any] = []
    success = 0
    error = 0

    for row in results:
        status = row.get("status")
        source_pk = row.get("source_pk")
        source_pks.append(source_pk)

        if status == EMBEDDING_BATCH_SUCCESS:
            success += 1
            success_source_pks.append(source_pk)
        elif status == EMBEDDING_BATCH_ERROR:
            error += 1
            error_source_pks.append(source_pk)
        else:
            raise RuntimeError(
                f"알 수 없는 Embedding Batch 상태입니다: {status}"
            )

    return {
        "total": len(results),
        "success": success,
        "error": error,
        "source_pks": source_pks,
        "success_source_pks": success_source_pks,
        "error_source_pks": error_source_pks,
    }


def run_items_with_recovery(
    items: Sequence[Mapping[str, Any]],
    processor: Callable[[Mapping[str, Any]], Mapping[str, Any] | None],
    *,
    source_table: str,
    chunk_type: str,
    stage: str,
    skip_resolver: (
        Callable[[Mapping[str, Any]], str | None] | None
    ) = None,
) -> dict[str, Any]:
    """
    Batch 항목을 순차 처리하면서 SUCCESS, ERROR, SKIP 결과를
    메모리에서 수집한다.

    오류가 발생해도 다음 항목 처리를 계속한다.
    """
    if isinstance(items, (str, bytes)):
        raise TypeError("items는 Mapping Sequence여야 합니다.")
    if not callable(processor):
        raise TypeError("processor는 callable이어야 합니다.")
    if skip_resolver is not None and not callable(skip_resolver):
        raise TypeError(
            "skip_resolver는 callable 또는 None이어야 합니다."
        )

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

    if not isinstance(stage, str):
        raise TypeError("stage는 문자열이어야 합니다.")
    cleaned_stage = stage.strip()
    if not cleaned_stage:
        raise ValueError("stage는 필수입니다.")

    items_list = list(items)
    seen_source_pks: set[int] = set()
    validated_items: list[tuple[int, Mapping[str, Any]]] = []

    for item in items_list:
        if not isinstance(item, Mapping):
            raise TypeError(
                "items의 모든 항목은 Mapping이어야 합니다."
            )
        if "source_pk" not in item:
            raise ValueError("Recovery 항목에 source_pk가 없습니다.")

        source_pk = item.get("source_pk")
        if isinstance(source_pk, bool) or not isinstance(source_pk, int):
            raise ValueError(
                "Recovery source_pk는 1 이상의 정수여야 합니다."
            )
        if source_pk < 1:
            raise ValueError(
                "Recovery source_pk는 1 이상의 정수여야 합니다."
            )
        if source_pk in seen_source_pks:
            raise RuntimeError(
                f"Recovery Batch 내부에 중복 source_pk가 있습니다: {source_pk}"
            )
        seen_source_pks.add(source_pk)
        validated_items.append((source_pk, item))

    results: list[dict[str, Any]] = []
    success_rows: list[dict[str, Any]] = []
    error_rows: list[dict[str, Any]] = []
    skip_rows: list[dict[str, Any]] = []

    for source_pk, item in validated_items:
        try:
            skip_reason: str | None = None
            if skip_resolver is not None:
                skip_reason = skip_resolver(item)

            if isinstance(skip_reason, str) and skip_reason.strip():
                skip_row = {
                    "source_table": cleaned_source_table,
                    "source_pk": source_pk,
                    "chunk_type": cleaned_chunk_type,
                    "stage": cleaned_stage,
                    "status": RECOVERY_STATUS_SKIP,
                    "reason": skip_reason.strip(),
                }
                results.append(skip_row)
                skip_rows.append(skip_row)
                continue

            processor_result = processor(item)
            if processor_result is None:
                processor_result = {}
            if not isinstance(processor_result, Mapping):
                raise TypeError(
                    "processor 반환값은 Mapping 또는 None이어야 합니다."
                )

            success_row = {
                "source_table": cleaned_source_table,
                "source_pk": source_pk,
                "chunk_type": cleaned_chunk_type,
                "stage": cleaned_stage,
                "status": RECOVERY_STATUS_SUCCESS,
                "result": dict(processor_result),
            }
            results.append(success_row)
            success_rows.append(success_row)
        except Exception as exc:
            error_row = {
                "source_table": cleaned_source_table,
                "source_pk": source_pk,
                "chunk_type": cleaned_chunk_type,
                "stage": cleaned_stage,
                "status": RECOVERY_STATUS_ERROR,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
            }
            results.append(error_row)
            error_rows.append(error_row)

    return {
        "source_table": cleaned_source_table,
        "chunk_type": cleaned_chunk_type,
        "stage": cleaned_stage,
        "total": len(results),
        "success_count": len(success_rows),
        "error_count": len(error_rows),
        "skip_count": len(skip_rows),
        "success": success_rows,
        "error": error_rows,
        "skip": skip_rows,
        "results": results,
    }


def validate_recovery_report(
    report: Mapping[str, Any],
) -> None:
    """
    Recovery Report의 구조와 건수 일관성을 검증한다.
    """
    if not isinstance(report, Mapping):
        raise TypeError("report는 Mapping이어야 합니다.")

    required_fields = (
        "source_table",
        "chunk_type",
        "stage",
        "total",
        "success_count",
        "error_count",
        "skip_count",
        "success",
        "error",
        "skip",
        "results",
    )
    for field_name in required_fields:
        if field_name not in report:
            raise ValueError(
                f"Recovery Report 필수값이 없습니다: {field_name}"
            )

    for count_field in (
        "total",
        "success_count",
        "error_count",
        "skip_count",
    ):
        value = report[count_field]
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(
                f"Recovery Report 필수값이 없습니다: {count_field}"
            )
        if value < 0:
            raise ValueError(
                f"Recovery Report 필수값이 없습니다: {count_field}"
            )

    if (
        report["total"]
        != report["success_count"]
        + report["error_count"]
        + report["skip_count"]
    ):
        raise RuntimeError(
            "Recovery Report 상태별 건수 합계가 total과 일치하지 않습니다."
        )

    results = report["results"]
    success = report["success"]
    error = report["error"]
    skip = report["skip"]

    if len(results) != report["total"]:
        raise RuntimeError(
            "Recovery Report 상태별 건수 합계가 total과 일치하지 않습니다."
        )
    if len(success) != report["success_count"]:
        raise RuntimeError(
            "Recovery Report 상태별 건수 합계가 total과 일치하지 않습니다."
        )
    if len(error) != report["error_count"]:
        raise RuntimeError(
            "Recovery Report 상태별 건수 합계가 total과 일치하지 않습니다."
        )
    if len(skip) != report["skip_count"]:
        raise RuntimeError(
            "Recovery Report 상태별 건수 합계가 total과 일치하지 않습니다."
        )

    seen_source_pks: set[Any] = set()
    for row in results:
        status = row.get("status")
        if status not in SUPPORTED_RECOVERY_STATUSES:
            raise RuntimeError(
                f"알 수 없는 Recovery 상태입니다: {status}"
            )
        source_pk = row.get("source_pk")
        if source_pk in seen_source_pks:
            raise RuntimeError(
                f"Recovery Batch 내부에 중복 source_pk가 있습니다: {source_pk}"
            )
        seen_source_pks.add(source_pk)


def get_recovery_retry_source_pks(
    report: Mapping[str, Any],
    *,
    limit: int = DEFAULT_RECOVERY_RETRY_LIMIT,
) -> list[int]:
    """
    Recovery Report에서 ERROR 상태의 source_pk만 반환한다.

    COMPLETE 또는 SKIP 항목은 재처리 대상으로 반환하지 않는다.
    """
    validate_recovery_report(report)

    if isinstance(limit, bool) or not isinstance(limit, int):
        raise TypeError("limit은 정수여야 합니다.")
    if limit < 1:
        raise ValueError("limit은 1 이상이어야 합니다.")
    if limit > 1000:
        raise ValueError("limit은 1000 이하여야 합니다.")

    retry_ids: list[int] = []
    seen: set[int] = set()
    for row in report["error"]:
        source_pk = row.get("source_pk")
        if not isinstance(source_pk, int) or isinstance(source_pk, bool):
            continue
        if source_pk in seen:
            continue
        seen.add(source_pk)
        retry_ids.append(source_pk)
        if len(retry_ids) >= limit:
            break
    return retry_ids


def summarize_recovery_report(
    report: Mapping[str, Any],
) -> dict[str, Any]:
    """
    콘솔 출력용 Recovery 요약값을 반환한다.
    """
    validate_recovery_report(report)
    return {
        "source_table": report["source_table"],
        "chunk_type": report["chunk_type"],
        "stage": report["stage"],
        "total": report["total"],
        "success": report["success_count"],
        "error": report["error_count"],
        "skip": report["skip_count"],
        "success_source_pks": [
            row["source_pk"]
            for row in report["success"]
        ],
        "error_source_pks": [
            row["source_pk"]
            for row in report["error"]
        ],
        "skip_source_pks": [
            row["source_pk"]
            for row in report["skip"]
        ],
    }


def _validate_full_batch_parameters(
    *,
    batch_size: int,
    max_cycles: int | None,
) -> None:
    if isinstance(batch_size, bool) or not isinstance(batch_size, int):
        raise TypeError("batch_size는 정수여야 합니다.")
    if batch_size < 1:
        raise ValueError("batch_size는 1 이상이어야 합니다.")
    if batch_size > MAX_FULL_BATCH_SIZE:
        raise ValueError("batch_size는 100 이하여야 합니다.")

    if max_cycles is None:
        return
    if isinstance(max_cycles, bool) or not isinstance(max_cycles, int):
        raise TypeError("max_cycles는 정수 또는 None이어야 합니다.")
    if max_cycles < 1:
        raise ValueError("max_cycles는 1 이상이어야 합니다.")


def validate_full_generation_preconditions(
    summary: Mapping[str, Any],
) -> None:
    """
    전체 Batch 실행 전에 중복과 비정상 중간 상태를 검증한다.
    """
    if not isinstance(summary, Mapping):
        raise TypeError("summary는 Mapping이어야 합니다.")

    required_fields = (
        "total",
        "new",
        "needs_keywords",
        "needs_embedding",
        "complete",
        "duplicate",
    )
    for field_name in required_fields:
        if field_name not in summary:
            raise ValueError(
                f"전체 처리 상태 필수값이 없습니다: {field_name}"
            )

    if summary["duplicate"] > 0:
        raise RuntimeError(
            "중복 smartlaw_chunk가 있어 전체 처리를 시작할 수 없습니다."
        )
    if summary["needs_keywords"] > 0:
        raise RuntimeError(
            "keywords가 없는 smartlaw_chunk가 있어 전체 처리를 시작할 수 없습니다."
        )

    if (
        summary["new"]
        + summary["needs_keywords"]
        + summary["needs_embedding"]
        + summary["complete"]
        + summary["duplicate"]
        != summary["total"]
    ):
        raise RuntimeError(
            "전체 처리 상태별 건수 합계가 total과 일치하지 않습니다."
        )


def _is_full_generation_complete(summary: Mapping[str, Any]) -> bool:
    return (
        summary["new"] == 0
        and summary["needs_keywords"] == 0
        and summary["needs_embedding"] == 0
        and summary["duplicate"] == 0
        and summary["complete"] == summary["total"]
    )


def _build_full_generation_report(
    *,
    repository: SupabaseRepository,
    status: str,
    batch_size: int,
    cycle_count: int,
    initial_summary: Mapping[str, Any],
    total_saved: int,
    total_embedded: int,
    error_results: list[dict[str, Any]],
    cycle_results: list[dict[str, Any]],
) -> dict[str, Any]:
    final_summary = build_admin_rule_processing_summary(
        repository,
        page_size=100,
    )
    return {
        "status": status,
        "batch_size": batch_size,
        "cycle_count": cycle_count,
        "initial_summary": dict(initial_summary),
        "final_summary": dict(final_summary),
        "saved_count": total_saved,
        "embedded_count": total_embedded,
        "error_count": len(error_results),
        "error_results": list(error_results),
        "cycle_results": list(cycle_results),
        "completed": status == FULL_RUN_STATUS_COMPLETED,
    }


def run_admin_rule_full_generation(
    repository: SupabaseRepository,
    embedding_service: EmbeddingService,
    *,
    batch_size: int = DEFAULT_FULL_BATCH_SIZE,
    max_cycles: int | None = None,
) -> dict[str, Any]:
    """
    admin_rule ARTICLE 전체를 청크·키워드·Embedding 완료 상태로 만든다.

    기존 DB 처리 상태를 기준으로 중단 지점부터 재개 가능해야 한다.
    """
    _validate_full_batch_parameters(
        batch_size=batch_size,
        max_cycles=max_cycles,
    )

    run_started_at = time.perf_counter()
    print(
        "[FULL BATCH] 1. Batch 시작"
        f" batch_size={batch_size}"
        f" max_cycles={max_cycles}"
        f" elapsed={0.0:.2f}s",
        flush=True,
    )

    document_type_report = validate_admin_rule_document_types(
        repository,
    )
    if document_type_report["error_count"] >= 1:
        for error_row in document_type_report["error"][:10]:
            print(error_row.get("law_name"))
        raise RuntimeError(
            "document_type을 추출할 수 없는 행정규칙 문서가 있습니다."
        )

    initial_summary = build_admin_rule_processing_summary(
        repository,
        page_size=100,
    )
    validate_full_generation_preconditions(initial_summary)
    print(
        "[FULL BATCH] 1. Batch 시작 상태 확인"
        f" total={initial_summary['total']}"
        f" new={initial_summary['new']}"
        f" needs_embedding={initial_summary['needs_embedding']}"
        f" complete={initial_summary['complete']}"
        f" elapsed={time.perf_counter() - run_started_at:.2f}s",
        flush=True,
    )

    cycle_count = 0
    total_saved = 0
    total_embedded = 0
    error_results: list[dict[str, Any]] = []
    cycle_results: list[dict[str, Any]] = []
    status = FULL_RUN_STATUS_PARTIAL

    while True:
        cycle_started_at = time.perf_counter()
        current_summary = build_admin_rule_processing_summary(
            repository,
            page_size=100,
        )
        validate_full_generation_preconditions(current_summary)

        if _is_full_generation_complete(current_summary):
            status = FULL_RUN_STATUS_COMPLETED
            break

        complete_before = current_summary["complete"]
        cycle_saved = 0
        cycle_embedded = 0
        print(
            "[FULL BATCH] Cycle 시작"
            f" next_cycle={cycle_count + 1}"
            f" new={current_summary['new']}"
            f" needs_embedding={current_summary['needs_embedding']}"
            f" complete={complete_before}"
            f" elapsed={time.perf_counter() - run_started_at:.2f}s",
            flush=True,
        )

        if current_summary["needs_embedding"] > 0:
            embedding_batch_size = min(
                batch_size,
                current_summary["needs_embedding"],
            )
            print(
                "[FULL BATCH] 7. Embedding 시작"
                f" count={embedding_batch_size}"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )
            embedding_started_at = time.perf_counter()
            embedding_results = run_chunk_embedding_batch(
                repository,
                embedding_service,
                source_table="admin_rule",
                chunk_type="ARTICLE",
                batch_size=embedding_batch_size,
            )
            embedding_summary = summarize_embedding_batch(
                embedding_results
            )
            total_embedded += embedding_summary["success"]
            cycle_embedded = embedding_summary["success"]
            print(
                "[FULL BATCH] 8. Embedding 완료"
                f" success={embedding_summary['success']}"
                f" error={embedding_summary['error']}"
                f" step_elapsed={time.perf_counter() - embedding_started_at:.2f}s"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )

            if embedding_summary["error"] >= 1:
                for result in embedding_results:
                    if result.get("status") == EMBEDDING_BATCH_ERROR:
                        error_results.append(dict(result))
                status = FULL_RUN_STATUS_ERROR
                return _build_full_generation_report(
                    repository=repository,
                    status=status,
                    batch_size=batch_size,
                    cycle_count=cycle_count,
                    initial_summary=initial_summary,
                    total_saved=total_saved,
                    total_embedded=total_embedded,
                    error_results=error_results,
                    cycle_results=cycle_results,
                )

        elif current_summary["new"] > 0:
            save_batch_size = min(
                batch_size,
                current_summary["new"],
            )
            print(
                "[FULL BATCH] 2. 저장 대상 조회 완료"
                f" count={save_batch_size}"
                f" remaining_new={current_summary['new']}"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )

            print(
                "[FULL BATCH] 3. Batch 준비 시작"
                f" count={save_batch_size}"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )
            prepare_started_at = time.perf_counter()
            prepared_results = prepare_admin_rule_batch(
                repository,
                batch_size=save_batch_size,
            )
            prepared_summary = summarize_prepared_batch(
                prepared_results
            )
            print(
                "[FULL BATCH] 4. Batch 준비 완료"
                f" ready={prepared_summary['ready']}"
                f" error={prepared_summary['error']}"
                f" step_elapsed={time.perf_counter() - prepare_started_at:.2f}s"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )
            if prepared_summary["error"] >= 1:
                raise RuntimeError(
                    "준비 단계에 ERROR가 있어 Batch 저장을 중단합니다."
                )

            try:
                validate_prepared_batch_for_save(prepared_results)
            except Exception as exc:
                raise RuntimeError(
                    "전체 Batch 청크 저장 사전검증 중 오류가 발생했습니다. "
                    f"cycle={cycle_count + 1}, error={exc}"
                ) from exc

            print(
                "[FULL BATCH] 5. Batch 저장 시작"
                f" count={prepared_summary['ready']}"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )
            save_started_at = time.perf_counter()
            saved_rows = save_prepared_chunk_batch(
                repository,
                prepared_results,
            )
            save_result = {
                "requested": prepared_summary["total"],
                "prepared": prepared_summary["ready"],
                "saved": len(saved_rows),
                "source_pks": [
                    row["source_pk"] for row in saved_rows
                ],
                "saved_rows": saved_rows,
            }
            print(
                "[FULL BATCH] 6. Batch 저장 완료"
                f" saved={save_result['saved']}"
                f" step_elapsed={time.perf_counter() - save_started_at:.2f}s"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )
            if (
                save_result["requested"] != save_batch_size
                or save_result["prepared"] != save_batch_size
                or save_result["saved"] != save_batch_size
            ):
                raise RuntimeError(
                    "전체 처리 중 청크 Batch 저장 건수가 일치하지 않습니다."
                )

            total_saved += save_result["saved"]
            cycle_saved = save_result["saved"]

            after_save_summary = build_admin_rule_processing_summary(
                repository,
                page_size=100,
            )
            if after_save_summary["needs_embedding"] < save_batch_size:
                raise RuntimeError(
                    "전체 처리 중 청크 Batch 저장 건수가 일치하지 않습니다."
                )

            print(
                "[FULL BATCH] 7. Embedding 시작"
                f" count={save_batch_size}"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )
            embedding_started_at = time.perf_counter()
            embedding_results = run_chunk_embedding_batch(
                repository,
                embedding_service,
                source_table="admin_rule",
                chunk_type="ARTICLE",
                batch_size=save_batch_size,
            )
            embedding_summary = summarize_embedding_batch(
                embedding_results
            )
            total_embedded += embedding_summary["success"]
            cycle_embedded = embedding_summary["success"]
            print(
                "[FULL BATCH] 8. Embedding 완료"
                f" success={embedding_summary['success']}"
                f" error={embedding_summary['error']}"
                f" step_elapsed={time.perf_counter() - embedding_started_at:.2f}s"
                f" elapsed={time.perf_counter() - run_started_at:.2f}s",
                flush=True,
            )

            if embedding_summary["error"] >= 1:
                for result in embedding_results:
                    if result.get("status") == EMBEDDING_BATCH_ERROR:
                        error_results.append(dict(result))
                status = FULL_RUN_STATUS_ERROR
                return _build_full_generation_report(
                    repository=repository,
                    status=status,
                    batch_size=batch_size,
                    cycle_count=cycle_count,
                    initial_summary=initial_summary,
                    total_saved=total_saved,
                    total_embedded=total_embedded,
                    error_results=error_results,
                    cycle_results=cycle_results,
                )
        else:
            raise RuntimeError(
                "전체 Batch 처리 진행이 감지되지 않아 실행을 중단합니다."
            )

        after_cycle_summary = build_admin_rule_processing_summary(
            repository,
            page_size=100,
        )
        validate_full_generation_preconditions(after_cycle_summary)
        complete_after = after_cycle_summary["complete"]

        if complete_after <= complete_before:
            raise RuntimeError(
                "전체 Batch 처리 진행이 감지되지 않아 실행을 중단합니다."
            )

        cycle_count += 1
        cycle_results.append(
            {
                "cycle": cycle_count,
                "new_before": current_summary["new"],
                "needs_embedding_before": (
                    current_summary["needs_embedding"]
                ),
                "complete_before": complete_before,
                "new_after": after_cycle_summary["new"],
                "needs_embedding_after": (
                    after_cycle_summary["needs_embedding"]
                ),
                "complete_after": complete_after,
                "saved": cycle_saved,
                "embedded": cycle_embedded,
            }
        )
        print(
            "[FULL BATCH] 9. Cycle 종료"
            f" cycle={cycle_count}"
            f" saved={cycle_saved}"
            f" embedded={cycle_embedded}"
            f" new_after={after_cycle_summary['new']}"
            f" needs_embedding_after={after_cycle_summary['needs_embedding']}"
            f" complete_after={complete_after}"
            f" cycle_elapsed={time.perf_counter() - cycle_started_at:.2f}s"
            f" elapsed={time.perf_counter() - run_started_at:.2f}s",
            flush=True,
        )

        if _is_full_generation_complete(after_cycle_summary):
            status = FULL_RUN_STATUS_COMPLETED
            break

        if max_cycles is not None and cycle_count >= max_cycles:
            status = FULL_RUN_STATUS_PARTIAL
            break

    return _build_full_generation_report(
        repository=repository,
        status=status,
        batch_size=batch_size,
        cycle_count=cycle_count,
        initial_summary=initial_summary,
        total_saved=total_saved,
        total_embedded=total_embedded,
        error_results=error_results,
        cycle_results=cycle_results,
    )


def validate_admin_rule_full_generation(
    report: Mapping[str, Any],
    *,
    expected_total: int = 740,
) -> None:
    """
    전체 실행 완료 Report와 최종 처리 상태를 검증한다.
    """
    if not isinstance(report, Mapping):
        raise TypeError("report는 Mapping이어야 합니다.")

    if isinstance(expected_total, bool) or not isinstance(expected_total, int):
        raise TypeError("expected_total은 정수여야 합니다.")
    if expected_total < 1:
        raise ValueError("expected_total은 1 이상이어야 합니다.")

    report_status = report.get("status")
    if report_status != FULL_RUN_STATUS_COMPLETED:
        raise RuntimeError(
            f"전체 생성이 완료되지 않았습니다: {report_status}"
        )
    if report.get("completed") is not True:
        raise RuntimeError(
            f"전체 생성이 완료되지 않았습니다: {report_status}"
        )

    final_summary = report.get("final_summary")
    if not isinstance(final_summary, Mapping):
        raise RuntimeError(
            "행정규칙 전체 생성 최종 상태가 완료 조건과 일치하지 않습니다."
        )

    if not (
        final_summary.get("total") == expected_total
        and final_summary.get("new") == 0
        and final_summary.get("needs_keywords") == 0
        and final_summary.get("needs_embedding") == 0
        and final_summary.get("complete") == expected_total
        and final_summary.get("duplicate") == 0
    ):
        raise RuntimeError(
            "행정규칙 전체 생성 최종 상태가 완료 조건과 일치하지 않습니다."
        )

    if report.get("error_count") != 0:
        raise RuntimeError(
            "행정규칙 전체 생성 최종 상태가 완료 조건과 일치하지 않습니다."
        )


if __name__ == "__main__":
    validate_full_generation_preconditions(
        {
            "total": 10,
            "new": 5,
            "needs_keywords": 0,
            "needs_embedding": 2,
            "complete": 3,
            "duplicate": 0,
        }
    )

    try:
        validate_full_generation_preconditions(
            {
                "total": 10,
                "new": 8,
                "needs_keywords": 0,
                "needs_embedding": 0,
                "complete": 1,
                "duplicate": 1,
            }
        )
    except RuntimeError as exc:
        assert "중복 smartlaw_chunk" in str(exc)
    else:
        raise AssertionError(
            "duplicate 사전조건 오류가 발생하지 않았습니다."
        )

    try:
        validate_full_generation_preconditions(
            {
                "total": 10,
                "new": 8,
                "needs_keywords": 1,
                "needs_embedding": 0,
                "complete": 1,
                "duplicate": 0,
            }
        )
    except RuntimeError as exc:
        assert "keywords가 없는 smartlaw_chunk" in str(exc)
    else:
        raise AssertionError(
            "needs_keywords 사전조건 오류가 발생하지 않았습니다."
        )

    try:
        _validate_full_batch_parameters(
            batch_size=0,
            max_cycles=None,
        )
    except ValueError:
        pass
    else:
        raise AssertionError(
            "batch_size ValueError가 발생하지 않았습니다."
        )

    print("OK: STEP 7-7 전체 Batch 사전검증 단위 테스트 완료")

    diagnose_source_pk_value = os.getenv(
        "SMARTLAW_DIAGNOSE_SOURCE_PK",
        "",
    ).strip()
    if diagnose_source_pk_value:
        try:
            diagnose_source_pk = int(diagnose_source_pk_value)
        except ValueError as exc:
            raise ValueError(
                "SMARTLAW_DIAGNOSE_SOURCE_PK는 정수여야 합니다."
            ) from exc

        repository = SupabaseRepository()
        diagnosis = diagnose_admin_rule_chunk(
            repository,
            diagnose_source_pk,
        )
        pprint(diagnosis)

        if diagnose_source_pk == 63:
            assert (
                diagnosis["document"]["law_name"]
                == "통합공고"
            )
            assert (
                diagnosis["chunk"]["document_type"]
                == "공고"
            )
            assert (
                diagnosis["metadata"]["document_type"]
                == "공고"
            )

        print("OK: admin_rule Chunk 진단 완료")
    else:
        confirm_value = os.getenv(
            FULL_BATCH_CONFIRM_ENV,
            "",
        ).strip()

        repository = SupabaseRepository()
        summary = build_admin_rule_processing_summary(
            repository,
            page_size=100,
        )

        if confirm_value != FULL_BATCH_CONFIRM_VALUE:
            print("전체 ARTICLE 대상:", summary["total"])
            print("현재 NEW:", summary["new"])
            print(
                "현재 NEEDS_KEYWORDS:",
                summary["needs_keywords"],
            )
            print(
                "현재 NEEDS_EMBEDDING:",
                summary["needs_embedding"],
            )
            print("현재 COMPLETE:", summary["complete"])
            print("현재 DUPLICATE:", summary["duplicate"])
            print(
                "전체 실행을 시작하려면 "
                "SMARTLAW_FULL_BATCH_CONFIRM=YES를 설정하세요."
            )
        else:
            max_cycles_raw = os.getenv(
                FULL_BATCH_MAX_CYCLES_ENV,
                "",
            )
            max_cycles_cleaned = max_cycles_raw.strip()
            if max_cycles_cleaned == "":
                max_cycles: int | None = None
            else:
                try:
                    max_cycles = int(max_cycles_cleaned)
                except ValueError as exc:
                    raise ValueError(
                        "SMARTLAW_FULL_BATCH_MAX_CYCLES는 정수여야 합니다."
                    ) from exc
                if max_cycles < 1:
                    raise ValueError(
                        "SMARTLAW_FULL_BATCH_MAX_CYCLES는 1 이상이어야 합니다."
                    )

            embedding_service = EmbeddingService()
            report = run_admin_rule_full_generation(
                repository,
                embedding_service,
                batch_size=10,
                max_cycles=max_cycles,
            )

            for cycle in report["cycle_results"]:
                print(
                    "cycle:",
                    cycle["cycle"],
                    "saved:",
                    cycle["saved"],
                    "embedded:",
                    cycle["embedded"],
                    "NEW:",
                    cycle["new_after"],
                    "NEEDS_EMBEDDING:",
                    cycle["needs_embedding_after"],
                    "COMPLETE:",
                    cycle["complete_after"],
                )

            final_summary = report["final_summary"]
            print("실행 상태:", report["status"])
            print("전체 사이클:", report["cycle_count"])
            print("신규 저장:", report["saved_count"])
            print(
                "Embedding 완료:",
                report["embedded_count"],
            )
            print("ERROR:", report["error_count"])
            print("최종 NEW:", final_summary["new"])
            print(
                "최종 NEEDS_KEYWORDS:",
                final_summary["needs_keywords"],
            )
            print(
                "최종 NEEDS_EMBEDDING:",
                final_summary["needs_embedding"],
            )
            print("최종 COMPLETE:", final_summary["complete"])
            print("최종 DUPLICATE:", final_summary["duplicate"])

            if report["status"] == FULL_RUN_STATUS_ERROR:
                for error_row in report["error_results"]:
                    print(
                        {
                            "source_pk": error_row.get("source_pk"),
                            "error_type": error_row.get("error_type"),
                        }
                    )
            elif report["status"] == FULL_RUN_STATUS_COMPLETED:
                validate_admin_rule_full_generation(
                    report,
                    expected_total=740,
                )
                print(
                    "OK: STEP 7-7 행정규칙 ARTICLE 740건 "
                    "전체 생성 및 검증 완료"
                )
