# chunk_builder.py
#
# 역할: 행정규칙 본문·부칙·별표·첨부 메타 텍스트를
#       RAG용 청크(단위 텍스트)로 분할·조립한다.
#
# - admin_rule 조문, addendum, annex, law 등에서 재사용 가능한
#   범용 chunk_text 조립 함수를 제공한다.
#
# TODO
# 향후
# 별표1
# 부칙 제2조
# 지원

from __future__ import annotations

import re
from typing import Any, Mapping


def normalize_text(text: str) -> str:
    """
    Embedding 전에 텍스트를 정규화한다.

    - Windows 줄바꿈(\\r\\n) → \\n
    - Mac 줄바꿈(\\r) → \\n
    - Tab → 공백
    - 연속 공백 제거
    - 앞뒤 공백 제거
    """
    if not text:
        return ""

    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")
    text = text.replace("\t", " ")
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def build_article_label(article_no: Any) -> str:
    """
    article_no 로부터 표시용 조문 라벨을 생성한다.

    - 이미 \"제…조\" 형식이면 그대로 반환 (제1조, 제1조의2)
    - 숫자·축약형이면 변환 (1 → 제1조, 1의2 → 제1조의2)
    - 빈 값이면 빈 문자열
    """
    text = _as_text(article_no)
    if not text:
        return ""

    if text.startswith("제") and "조" in text:
        return text

    # 1의2 → 제1조의2
    m = re.fullmatch(r"(\d+)의(\d+)", text)
    if m:
        return f"제{m.group(1)}조의{m.group(2)}"

    return f"제{text}조"


def build_chunk_text(document: Mapping[str, Any]) -> str:
    """
    문서 1건을 Embedding용 chunk_text 문자열로 변환한다.

    admin_rule / admin_rule_addendum / admin_rule_annex / law 등
    공통 필드(document_category, law_name, article_no, article_title,
    article_content)를 가진 dict에 범용으로 사용한다.

    Args:
        document: 청크 원본 필드 dict.

    Returns:
        항목 사이를 빈 줄(\\n\\n)로 구분한 chunk_text.
        빈 값은 생략하며, 마지막 줄바꿈은 없다.
    """
    parts: list[str] = []

    category = _as_text(document.get("document_category"))
    if category:
        parts.append(category)

    law_name = _as_text(document.get("law_name"))
    if law_name:
        parts.append(law_name)

    article_label = build_article_label(document.get("article_no"))
    article_title = _as_text(document.get("article_title"))

    if article_label:
        # 제목이 이미 조문번호를 포함하면 라벨만 중복 출력하지 않음
        if article_title and article_label in article_title:
            parts.append(article_title)
        else:
            parts.append(article_label)
            if article_title:
                parts.append(article_title)
    elif article_title:
        parts.append(article_title)

    article_content = _as_text(document.get("article_content"))
    if article_content:
        parts.append(article_content)

    return normalize_text("\n\n".join(parts))


def _as_text(value: Any) -> str:
    """None·공백을 빈 문자열로 정규화한다."""
    if value is None:
        return ""
    return str(value).strip()


if __name__ == "__main__":
    assert build_article_label("제1조") == "제1조"
    assert build_article_label("제1조의2") == "제1조의2"
    assert build_article_label("1") == "제1조"
    assert build_article_label("1의2") == "제1조의2"
    assert build_article_label("") == ""
    assert build_article_label(None) == ""

    sample = {
        "document_category": "행정규칙",
        "law_name": "사후관리에 관한 고시",
        "article_no": "제1조",
        "article_title": "제1조(목적)",
        "article_content": "본문...",
    }
    text = build_chunk_text(sample)
    assert "제제1조조" not in text
    print(text)
    print("ok")
