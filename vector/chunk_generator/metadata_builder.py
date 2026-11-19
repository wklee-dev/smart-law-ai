# metadata_builder.py
#
# 역할: 각 청크에 붙일 메타데이터(dict)를 구성한다.
#
# - param, gubun, seq_id, law_name, article_no 등
#   smartlaw_chunk.metadata (JSONB) 에 넣을 필드를 만든다.
# - article_content 는 본문 전용이므로 metadata 에 포함하지 않는다.

from __future__ import annotations

import re
from typing import Any, Mapping

from vector.chunk_generator.chunk_builder import build_article_label

METADATA_VERSION = "1.0"

DOCUMENT_TYPE_PATTERNS = (
    ("시행규칙", "시행규칙"),
    ("시행령", "시행령"),
    ("시행세칙", "시행세칙"),
    ("고시", "고시"),
    ("공고", "공고"),
    ("훈령", "훈령"),
    ("예규", "예규"),
    ("규정", "규정"),
    ("규칙", "규칙"),
    ("협정", "협정"),
    ("법률", "법률"),
    ("판결", "판결"),
    ("질의회신", "질의회신"),
)


def _clean_value(value: Any) -> Any | None:
    """
    None·빈 문자열·공백만 있는 값을 None 으로 정규화한다.

    문자열은 strip 후 비어 있으면 None.
    그 외 타입은 그대로 반환한다 (0, False 등 유지).
    """
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def extract_document_type(
    law_name: str,
) -> str:
    """
    문서명에서 가장 구체적인 document_type을 추출한다.
    """
    if not isinstance(law_name, str):
        raise TypeError("law_name은 문자열이어야 합니다.")

    cleaned_law_name = law_name.strip()
    if cleaned_law_name == "":
        raise ValueError("document_type을 추출할 law_name이 없습니다.")

    normalized_name = re.sub(
        r"\s+",
        "",
        cleaned_law_name,
    )

    for pattern, document_type in DOCUMENT_TYPE_PATTERNS:
        if pattern in normalized_name:
            return document_type

    safe_law_name = cleaned_law_name[:100]
    raise ValueError(
        f"document_type을 추출할 수 없습니다. law_name={safe_law_name}"
    )


def _resolve_document_type(
    document: Mapping[str, Any],
    *,
    document_type: str | None = None,
) -> str:
    """
    명시적 document_type을 우선하고, 없으면 law_name에서 추출한다.
    """
    if isinstance(document_type, str):
        cleaned_explicit = document_type.strip()
        if cleaned_explicit:
            return cleaned_explicit

    raw_document_type = document.get("document_type")
    if isinstance(raw_document_type, str):
        cleaned_raw = raw_document_type.strip()
        if cleaned_raw:
            return cleaned_raw

    return extract_document_type(document.get("law_name"))


def build_metadata(
    document: Mapping[str, Any],
    *,
    source_table: str,
    source_pk: Any | None = None,
    document_category: str = "ADMIN_RULE",
    document_type: str | None = None,
    chunk_type: str = "ARTICLE",
) -> dict[str, Any]:
    """
    admin_rule 등 원본 1건으로부터 smartlaw_chunk.metadata 용 dict를 생성한다.

    Args:
        document: 원본 행(dict). 수정하지 않는다.
        source_table: 출처 테이블명 (필수).
        source_pk: 원본 PK. 없으면 metadata 에서 제외.
        document_category: 문서 대분류. 기본 ADMIN_RULE.
        document_type: 고시·훈령·예규 등. 없으면 document/law_name에서 추출.
        chunk_type: 청크 유형. 기본 ARTICLE.

    Returns:
        빈 값이 제거된 metadata dict.
        metadata_version 은 항상 포함.
        article_content 는 포함하지 않는다.
    """
    table = _clean_value(source_table)
    if table is None:
        raise ValueError("source_table 은 필수입니다.")

    metadata: dict[str, Any] = {
        "metadata_version": METADATA_VERSION,
        "source_table": table,
    }

    pk = _clean_value(source_pk)
    if pk is not None:
        metadata["source_pk"] = pk

    category = _clean_value(document_category)
    if category is not None:
        metadata["document_category"] = category

    metadata["document_type"] = _resolve_document_type(
        document,
        document_type=document_type,
    )

    ctype = _clean_value(chunk_type)
    if ctype is not None:
        metadata["chunk_type"] = ctype

    for key in (
        "gubun",
        "param",
        "seq_id",
        "law_name",
        "article_no",
    ):
        cleaned = _clean_value(document.get(key))
        if cleaned is not None:
            metadata[key] = cleaned

    label = build_article_label(document.get("article_no"))
    if label:
        metadata["article_label"] = label

    title = _clean_value(document.get("article_title"))
    if title is not None:
        metadata["article_title"] = title

    return metadata


if __name__ == "__main__":
    import json

    sample = {
        "id": 105,
        "gubun": "adm_rule",
        "param": "b",
        "seq_id": "2100000222332",
        "law_name": "관세법 제226조에 따른 세관장확인물품 및 확인방법 지정고시",
        "article_no": "제1조",
        "article_title": "제1조(목적)",
        "article_content": "이 고시는 ...",
    }
    result = build_metadata(
        sample,
        source_table="admin_rule",
        source_pk=sample.get("id"),
        document_category="ADMIN_RULE",
        document_type="고시",
        chunk_type="ARTICLE",
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    assert result["metadata_version"] == "1.0"
    assert result["article_label"] == "제1조"
    assert "article_content" not in result

    numeric = build_metadata(
        {**sample, "article_no": "1"},
        source_table="admin_rule",
        source_pk=105,
    )
    assert numeric["article_label"] == "제1조"

    assert (
        extract_document_type(
            "관세법 제226조에 따른 세관장확인물품 및 확인방법 지정고시"
        )
        == "고시"
    )

    assert (
        extract_document_type(
            "사후관리에 관한 고시"
        )
        == "고시"
    )

    assert (
        extract_document_type(
            "통합공고"
        )
        == "공고"
    )

    assert (
        extract_document_type(
            "대외무역관리규정"
        )
        == "규정"
    )

    assert (
        extract_document_type(
            "관세법시행규칙"
        )
        == "시행규칙"
    )

    assert (
        extract_document_type(
            "자유무역협정(FTA)관세법 시행규칙"
        )
        == "시행규칙"
    )

    assert (
        extract_document_type(
            "자유무역협정(FTA)관세법 시행령"
        )
        == "시행령"
    )

    assert (
        extract_document_type(
            "  관세법   시행규칙  "
        )
        == "시행규칙"
    )

    assert (
        extract_document_type(
            "테스트 시행규칙"
        )
        != "규칙"
    )

    sample_explicit_type = {
        "id": 999,
        "law_name": "유형이 없는 테스트 문서",
        "document_type": "내부지침",
        "gubun": "test",
        "param": "999",
    }
    explicit_metadata = build_metadata(
        sample_explicit_type,
        source_table="admin_rule",
        source_pk=sample_explicit_type.get("id"),
    )
    assert explicit_metadata["document_type"] == "내부지침"
    assert explicit_metadata.get("param") == "999"

    try:
        extract_document_type(
            "유형을 알 수 없는 테스트 문서"
        )
    except ValueError as exc:
        assert "document_type을 추출할 수 없습니다" in str(exc)
    else:
        raise AssertionError(
            "알 수 없는 document_type ValueError가 발생하지 않았습니다."
        )

    try:
        extract_document_type(None)
    except TypeError as exc:
        assert str(exc) == "law_name은 문자열이어야 합니다."
    else:
        raise AssertionError(
            "비문자열 law_name TypeError가 발생하지 않았습니다."
        )

    print("OK: STEP 7-6A document_type 추출 단위 테스트 완료")
    print("ok")
