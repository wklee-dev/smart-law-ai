# keyword_extractor.py
#
# 역할: admin_rule 원본과 chunk_text 에서 smartlaw_chunk.keywords 용
#       키워드 목록을 규칙 기반으로 추출한다. (Keyword Extractor V1)
#
# - Dictionary / 동의어 / Gemini / 형태소 분석 / Embedding 은 이후 단계

from __future__ import annotations

import re
from pprint import pprint
from typing import Any, Mapping, Sequence

from .smartlaw_chunk_generator import generate_chunk
from .supabase_repository import SupabaseRepository

DEFAULT_STOPWORDS: frozenset[str] = frozenset(
    {
        "그리고",
        "그러나",
        "또는",
        "따라",
        "따른",
        "관한",
        "위한",
        "대한",
        "경우",
        "해당",
        "이를",
        "그",
        "등",
        "및",
        "수",
        "때",
        "중",
        "함은",
        "한다",
        "하여야",
        "있다",
        "있는",
        "없다",
        "아니한다",
        "규정",
        "사항",
        "목적",
        "받은",
        "받아",
        "받고",
        "하는",
        "하게",
        "하고",
        "하며",
        "정하고",
        "필요한",
        "시행에",
        "규정함을",
        "목적으로",
        "적용",
        "외",
    }
)

IMPORTANT_LEGAL_PHRASES: tuple[str, ...] = (
    "사후관리",
    "용도세율",
    "분할납부",
    "사용금지기간",
    "양도금지기간",
    "양수금지기간",
    "양도양수금지기간",
    "선택적 사후관리",
    "선별 관리시스템",
    "관리시스템",
    "관세 감면",
)

# 복합어에서 추가로 보존할 핵심 구성 단어
_PHRASE_CORE_TERMS: dict[str, tuple[str, ...]] = {
    "선택적 사후관리": ("선택적", "사후관리"),
    "선별 관리시스템": ("관리시스템",),
    "관세 감면": ("관세", "감면"),
}

# 법령명에서만 제외하는 연결 표현 (전체 법령명 문자열은 유지)
_LAW_NAME_CONNECTORS: frozenset[str] = frozenset(
    {
        "에",
        "의",
        "를",
        "을",
        "이",
        "가",
        "은",
        "는",
        "관한",
        "따른",
        "및",
        "또는",
        "그",
        "등",
    }
)

_ARTICLE_LABEL_RE = re.compile(
    r"제\d+조의\d+|제\d+조|제\d+항|제\d+호|별표\d+|별지\d+|부칙"
)

_LAW_CITATION_RE = re.compile(r"「([^」]+)」")

_PHRASE_JOSA_PREFIXES: tuple[str, ...] = (
    "에는",
    "에서",
    "으로",
    "로서",
    "로써",
    "부터",
    "까지",
    "을",
    "를",
    "의",
    "에",
    "이",
    "가",
    "은",
    "는",
    "과",
    "와",
    "도",
    "만",
    "로",
)

_TOKEN_RE = re.compile(
    r"제\d+조의\d+|제\d+조|제\d+항|제\d+호|별표\d+|별지\d+|부칙|"
    r"[A-Za-z][A-Za-z0-9]*|"
    r"[가-힣]{2,}"
)

_SEPARATOR_RE = re.compile(
    r"[\s,.\(\)\[\]\{\}\"\'“”‘’「」〈〉<>ㆍ·:;／/]+"
)

_EDGE_PUNCT_CHARS = "()[]{},.\"'" + "\u201c\u201d\u2018\u2019\u300c\u300d"
_EDGE_PUNCT_RE = re.compile(
    rf"^[{re.escape(_EDGE_PUNCT_CHARS)}]+|[{re.escape(_EDGE_PUNCT_CHARS)}]+$"
)

_JOSA_SUFFIXES: tuple[str, ...] = (
    "에는",
    "에서",
    "으로",
    "로서",
    "로써",
    "부터",
    "까지",
    "에",
    "의",
    "를",
    "을",
    "이",
    "가",
    "은",
    "는",
)


def extract_keywords(
    document: Mapping[str, Any],
    chunk_text: str,
    *,
    max_keywords: int = 20,
) -> list[str]:
    """
    document 와 chunk_text 로부터 검색용 키워드 목록을 생성한다.

    우선순위:
      1. article_no
      2. article_title 순수 제목
      3. law_name 전체
      4. law_name 핵심어
      5. 본문·chunk_text 법령 구조 키워드
      6. IMPORTANT_LEGAL_PHRASES
      7. 복합어 핵심 구성 단어
      8. 나머지 일반 토큰

    Args:
        document: admin_rule 등 원본 문서 dict (수정하지 않음).
        chunk_text: 생성된 청크 텍스트 (수정하지 않음).
        max_keywords: 반환 최대 개수 (1 이상).

    Returns:
        중요도 순 list[str]. 중복 없음.
    """
    if max_keywords < 1:
        raise ValueError("max_keywords는 1 이상이어야 합니다.")

    result: list[str] = []
    seen: set[str] = set()

    # 1. article_no
    article_label = _normalize_article_label(document.get("article_no"))
    if article_label:
        _append_unique(result, seen, article_label, allow_stopword=True)

    # 2. article_title (제목은 불용어보다 우선)
    title_keyword = _extract_article_title(document.get("article_title"))
    if title_keyword:
        _append_unique(result, seen, title_keyword, allow_stopword=True)

    # 3. law_name 전체
    law_name = _as_text(document.get("law_name"))
    if law_name:
        _append_unique(result, seen, law_name, allow_stopword=True)

    # 4. law_name 핵심어
    for term in _extract_law_name_terms(law_name):
        _append_unique(result, seen, term, allow_stopword=False)

    body = _as_text(document.get("article_content"))
    chunk = _as_text(chunk_text)
    search_text = f"{body}\n{chunk}"

    # 5. 본문·chunk_text 법령 구조 키워드 및 법령 인용
    for label in _extract_article_labels_from_texts([body, chunk]):
        _append_unique(result, seen, label, allow_stopword=False)
    for citation in _extract_law_citations_from_texts([body, chunk]):
        _append_unique(result, seen, citation, allow_stopword=False)

    # 6. IMPORTANT_LEGAL_PHRASES
    matched_phrases: list[str] = []
    for phrase in IMPORTANT_LEGAL_PHRASES:
        if _text_contains_phrase(search_text, phrase):
            matched_phrases.append(phrase)
            _append_unique(result, seen, phrase, allow_stopword=False)

    # 7. 복합어 핵심 구성 단어
    for phrase in matched_phrases:
        for part in _phrase_core_terms(phrase):
            _append_unique(result, seen, part, allow_stopword=False)

    # 8. 나머지 일반 토큰
    for token in _tokenize_text(body):
        _append_unique(result, seen, token, allow_stopword=False)
    for token in _tokenize_text(chunk):
        _append_unique(result, seen, token, allow_stopword=False)

    return result[:max_keywords]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_article_label(value: Any) -> str:
    text = _as_text(value)
    if not text:
        return ""

    if _ARTICLE_LABEL_RE.fullmatch(text):
        return text

    match = re.fullmatch(r"(\d+)의(\d+)", text)
    if match:
        return f"제{match.group(1)}조의{match.group(2)}"

    match = re.fullmatch(r"(\d+)", text)
    if match:
        return f"제{match.group(1)}조"

    found = _ARTICLE_LABEL_RE.search(text)
    if found:
        return found.group(0)

    return ""


def _extract_article_title(value: Any) -> str:
    text = _as_text(value)
    if not text:
        return ""

    text = re.sub(
        r"^제\d+조의\d+|^제\d+조|^제\d+항|^제\d+호",
        "",
        text,
    )
    text = _normalize_space(text)
    match = re.fullmatch(r"\((.+)\)", text)
    if match:
        text = match.group(1).strip()
    else:
        text = text.strip("()").strip()

    return _clean_keyword(text)


def _strip_trailing_josa(token: str) -> str:
    for josa in _JOSA_SUFFIXES:
        if token.endswith(josa) and len(token) - len(josa) >= 2:
            return token[: -len(josa)]
    return token


def _extract_law_name_terms(law_name: str) -> list[str]:
    if not law_name:
        return []

    terms: list[str] = []
    for raw in _SEPARATOR_RE.split(law_name):
        token = _as_text(raw)
        if not token:
            continue
        if token in _LAW_NAME_CONNECTORS:
            continue
        stripped = _strip_trailing_josa(token)
        if stripped in _LAW_NAME_CONNECTORS:
            continue
        cleaned = _clean_keyword(stripped)
        if cleaned:
            terms.append(cleaned)
    return terms


def _normalize_for_phrase_match(text: str) -> str:
    return text.replace("ㆍ", "").replace("·", "")


def _text_contains_phrase(text: str, phrase: str) -> bool:
    """원문에 복합어가 단어 경계(조사 허용)로 포함되는지 검사한다."""
    if not text or not phrase:
        return False

    # 가운데점(ㆍ·)을 제거한 뒤 매칭해 "양도ㆍ양수…" 중간 오탐을 막는다.
    source = _normalize_for_phrase_match(text)
    target = _normalize_for_phrase_match(phrase)
    if not target:
        return False

    start = 0
    while True:
        idx = source.find(target, start)
        if idx < 0:
            return False
        if _is_phrase_boundary_match(source, target, idx):
            return True
        start = idx + 1


def _is_phrase_boundary_match(text: str, phrase: str, idx: int) -> bool:
    before = text[idx - 1] if idx > 0 else ""
    if before and "가" <= before <= "힣":
        return False

    rest = text[idx + len(phrase) :]
    if not rest:
        return True

    first = rest[0]
    if not ("가" <= first <= "힣"):
        return True

    for josa in _PHRASE_JOSA_PREFIXES:
        if rest.startswith(josa):
            return True
    return False


def _phrase_core_terms(phrase: str) -> tuple[str, ...]:
    if phrase in _PHRASE_CORE_TERMS:
        return _PHRASE_CORE_TERMS[phrase]
    parts = tuple(part for part in phrase.split() if part)
    if len(parts) <= 1:
        return ()
    return parts


def _extract_article_labels_from_texts(texts: list[str]) -> list[str]:
    labels: list[str] = []
    local_seen: set[str] = set()
    for text in texts:
        if not text:
            continue
        for match in _ARTICLE_LABEL_RE.finditer(text):
            label = match.group(0)
            if label in local_seen:
                continue
            local_seen.add(label)
            labels.append(label)
    return labels


def _extract_law_citations_from_texts(texts: list[str]) -> list[str]:
    citations: list[str] = []
    local_seen: set[str] = set()
    for text in texts:
        if not text:
            continue
        for match in _LAW_CITATION_RE.finditer(text):
            citation = _as_text(match.group(1))
            if not citation or citation in local_seen:
                continue
            local_seen.add(citation)
            citations.append(citation)
    return citations


def _tokenize_text(text: str) -> list[str]:
    if not text:
        return []

    tokens: list[str] = []
    for match in _TOKEN_RE.finditer(text):
        token = match.group(0)
        if _ARTICLE_LABEL_RE.fullmatch(token):
            tokens.append(token)
            continue
        if re.fullmatch(r"[가-힣]{2,}", token):
            stripped = _strip_trailing_josa(token)
            tokens.append(stripped if len(stripped) >= 2 else token)
            continue
        tokens.append(token)
    return tokens


def _clean_keyword(value: Any) -> str:
    if value is None:
        return ""

    text = _normalize_space(str(value))
    if not text:
        return ""

    while True:
        stripped = _EDGE_PUNCT_RE.sub("", text)
        stripped = stripped.strip()
        if stripped == text:
            break
        text = stripped

    if not text:
        return ""
    if len(text) < 2:
        return ""
    if text.isdigit():
        return ""

    return text


def _seen_key(keyword: str) -> str:
    if re.search(r"[A-Za-z]", keyword):
        return keyword.lower()
    return keyword


def _append_unique(
    result: list[str],
    seen: set[str],
    value: Any,
    *,
    allow_stopword: bool = False,
) -> None:
    cleaned = _clean_keyword(value)
    if not cleaned:
        return
    if not allow_stopword and cleaned in DEFAULT_STOPWORDS:
        return

    key = _seen_key(cleaned)
    if key in seen:
        return

    seen.add(key)
    result.append(cleaned)


def _normalize_keyword_key(value: Any) -> str:
    """비교용 키워드 키. 공백 정리, 영문 소문자, 숫자만/빈값 제외."""
    if value is None:
        return ""
    text = _normalize_space(str(value))
    if not text:
        return ""
    if text.isdigit():
        return ""
    if re.search(r"[A-Za-z]", text):
        return text.lower()
    return text


def _as_synonym_list(value: Any) -> list[str]:
    """synonyms 필드를 list[str]로 안전하게 변환한다."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [str(value)]


def _build_dictionary_alias_index(
    dictionary_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Mapping[str, Any]]:
    """
    term/synonym 정규화 키 → Dictionary row 인덱스.

    동일 alias는 먼저 온 행(weight 우선)을 유지하고 덮어쓰지 않는다.
    """
    alias_index: dict[str, Mapping[str, Any]] = {}
    for row in dictionary_rows:
        aliases: list[Any] = [row.get("term")]
        aliases.extend(_as_synonym_list(row.get("synonyms")))
        for alias in aliases:
            key = _normalize_keyword_key(alias)
            if not key or key in alias_index:
                continue
            alias_index[key] = row
    return alias_index


def _dictionary_display_keyword(value: Any) -> str:
    """Dictionary 확장 시 반환용 표기. 공백 정리만 수행한다."""
    if value is None:
        return ""
    text = _normalize_space(str(value))
    if not text or text.isdigit():
        return ""
    return text


def expand_dictionary_keywords(
    keywords: Sequence[str],
    dictionary_rows: Sequence[Mapping[str, Any]],
    *,
    max_keywords: int | None = None,
) -> list[str]:
    """
    기본 키워드에 Dictionary 표준용어와 동의어를 확장한다.

    기존 키워드 순서를 유지하고,
    매칭된 Dictionary의 term과 synonyms를 뒤에 추가한다.
    """
    if max_keywords is not None and max_keywords < 1:
        raise ValueError("max_keywords는 1 이상이어야 합니다.")

    result: list[str] = []
    seen: set[str] = set()

    for keyword in keywords:
        key = _normalize_keyword_key(keyword)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(keyword if isinstance(keyword, str) else str(keyword))

    alias_index = _build_dictionary_alias_index(dictionary_rows)

    for keyword in keywords:
        key = _normalize_keyword_key(keyword)
        if not key:
            continue
        row = alias_index.get(key)
        if row is None:
            continue

        candidates: list[Any] = [row.get("term")]
        candidates.extend(_as_synonym_list(row.get("synonyms")))
        for candidate in candidates:
            cand_key = _normalize_keyword_key(candidate)
            if not cand_key or cand_key in seen:
                continue
            display = _dictionary_display_keyword(candidate)
            if not display:
                continue
            seen.add(cand_key)
            result.append(display)

    if max_keywords is not None:
        return result[:max_keywords]
    return result


if __name__ == "__main__":
    repository = SupabaseRepository()

    document = repository.get_admin_rule(2)
    if document is None:
        raise RuntimeError(
            "STEP 5-4 테스트용 admin_rule을 찾을 수 없습니다. rule_id=2"
        )

    chunk = generate_chunk(document)
    base_keywords = extract_keywords(
        document,
        chunk["chunk_text"],
        max_keywords=30,
    )
    dictionary_rows = repository.get_dictionary_entries()
    expanded_keywords = expand_dictionary_keywords(
        base_keywords,
        dictionary_rows,
        max_keywords=40,
    )

    stored_chunk = repository.get_chunk_by_source(
        source_table="admin_rule",
        source_pk=2,
        chunk_type="ARTICLE",
    )
    if stored_chunk is None:
        raise RuntimeError(
            "keywords를 저장할 smartlaw_chunk를 찾을 수 없습니다."
        )

    try:
        repository.update_chunk_keywords(
            chunk_id=stored_chunk["id"],
            keywords="관세법",
        )
    except TypeError as exc:
        assert (
            str(exc)
            == "keywords는 문자열이 아닌 문자열 Sequence여야 합니다."
        )
    else:
        raise AssertionError(
            "keywords 문자열 입력 TypeError가 발생하지 않았습니다."
        )

    try:
        repository.update_chunk_keywords(
            chunk_id=stored_chunk["id"],
            keywords=[],
        )
    except ValueError as exc:
        assert str(exc) == "저장할 keywords가 없습니다."
    else:
        raise AssertionError(
            "빈 keywords ValueError가 발생하지 않았습니다."
        )

    updated_chunk = repository.update_chunk_keywords(
        chunk_id=stored_chunk["id"],
        keywords=expanded_keywords,
    )

    print("smartlaw_chunk id:", updated_chunk["id"])
    print("source_table:", updated_chunk["source_table"])
    print("source_pk:", updated_chunk["source_pk"])
    print("chunk_type:", updated_chunk["chunk_type"])
    print("law_name:", updated_chunk["law_name"])
    print("article_no:", updated_chunk["article_no"])
    print("기본 키워드 개수:", len(base_keywords))
    print("확장 키워드 개수:", len(expanded_keywords))
    print("저장 키워드 개수:", len(updated_chunk["keywords"]))
    pprint(updated_chunk["keywords"])

    assert updated_chunk["id"] == stored_chunk["id"]
    assert updated_chunk["source_table"] == "admin_rule"
    assert updated_chunk["source_pk"] == 2
    assert updated_chunk["chunk_type"] == "ARTICLE"

    assert updated_chunk["keywords"]
    assert updated_chunk["keywords"] == expanded_keywords
    assert len(updated_chunk["keywords"]) == len(
        dict.fromkeys(updated_chunk["keywords"])
    )

    assert "제1조" in updated_chunk["keywords"]
    assert "사후관리" in updated_chunk["keywords"]
    assert "감면" in updated_chunk["keywords"]
    assert "관세감면" in updated_chunk["keywords"]
    assert "사후관리물품" in updated_chunk["keywords"]

    assert "받은" not in updated_chunk["keywords"]
    assert "하는" not in updated_chunk["keywords"]
    assert "" not in updated_chunk["keywords"]

    print("OK: STEP 5-4 smartlaw_chunk keywords 저장 완료")
