# embedding_service.py
#
# 역할: 청크 텍스트를 임베딩 벡터로 변환한다.
#
# - Provider: Google Gemini API (google-genai SDK)
# - Model: gemini-embedding-001 / dimension 768
# - STEP 6-1: 정규화·설정·검증
# - STEP 6-2: generate_document_embedding() 실제 API 호출
# - STEP 6-3: L2 정규화 후 DB 저장(Repository)
# - STEP 6-4: generate_query_embedding()

from __future__ import annotations

import math
import os
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_OUTPUT_DIMENSIONALITY = 768

DOCUMENT_TASK_TYPE = "RETRIEVAL_DOCUMENT"
QUERY_TASK_TYPE = "RETRIEVAL_QUERY"

SUPPORTED_TASK_TYPES = frozenset(
    {
        DOCUMENT_TASK_TYPE,
        QUERY_TASK_TYPE,
    }
)


def normalize_text_v2(text: str) -> str:
    """
    법령·행정규칙·판례·FTA 문서를 임베딩하기 전에
    의미를 훼손하지 않는 범위에서 텍스트를 정규화한다.
    """
    if not isinstance(text, str):
        raise TypeError("text는 문자열이어야 합니다.")

    if not text or not text.strip():
        return ""

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = (
        normalized.replace("\u00a0", " ")
        .replace("\u2007", " ")
        .replace("\u202f", " ")
        .replace("\t", " ")
    )
    normalized = (
        normalized.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
    )

    lines = [re.sub(r" {2,}", " ", line.strip()) for line in normalized.split("\n")]
    normalized = "\n".join(lines)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)

    normalized = re.sub(r"제\s+(\d+)\s+조의\s+(\d+)", r"제\1조의\2", normalized)
    normalized = re.sub(r"제\s+(\d+)\s+조", r"제\1조", normalized)
    normalized = re.sub(r"제\s+(\d+)\s+항", r"제\1항", normalized)
    normalized = re.sub(r"제\s+(\d+)\s+호", r"제\1호", normalized)

    normalized = re.sub(r"「\s+([^」]*?)\s+」", r"「\1」", normalized)
    normalized = re.sub(r"『\s+([^』]*?)\s+』", r"『\1』", normalized)
    normalized = re.sub(r"\(\s+([^)]*?)\s+\)", r"(\1)", normalized)
    normalized = re.sub(r"\[\s+([^\]]*?)\s+\]", r"[\1]", normalized)

    return normalized.strip()


def prepare_embedding_text(text: str) -> str:
    """
    임베딩 요청에 사용할 최종 텍스트를 만든다.
    """
    prepared = normalize_text_v2(text)
    if not prepared:
        raise ValueError("임베딩할 텍스트가 없습니다.")
    return prepared


def validate_task_type(task_type: str) -> str:
    if not isinstance(task_type, str):
        raise TypeError("task_type은 문자열이어야 합니다.")

    cleaned = task_type.strip().upper()
    if cleaned not in SUPPORTED_TASK_TYPES:
        raise ValueError(f"지원하지 않는 task_type입니다: {task_type}")
    return cleaned


def extract_embedding_values(response: Any) -> list[float]:
    """
    Google Gen AI SDK 응답에서 첫 번째 embedding vector를 추출한다.
    """
    if response is None:
        raise RuntimeError("Embedding 응답이 없습니다.")

    embeddings = getattr(response, "embeddings", None)
    if not embeddings:
        raise RuntimeError("Embedding 응답에 embeddings가 없습니다.")

    first = embeddings[0]
    values = getattr(first, "values", None)
    if not values:
        raise RuntimeError("Embedding 응답에 vector 값이 없습니다.")

    result: list[float] = []
    for value in values:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError("Embedding vector에는 숫자만 포함되어야 합니다.")
        result.append(float(value))
    return result


def validate_embedding_dimension(
    embedding: Sequence[float],
    *,
    expected_dimension: int = DEFAULT_OUTPUT_DIMENSIONALITY,
) -> None:
    if isinstance(embedding, (str, bytes)):
        raise TypeError("embedding은 숫자 Sequence여야 합니다.")
    if expected_dimension < 1:
        raise ValueError("expected_dimension은 1 이상이어야 합니다.")

    actual_dimension = len(embedding)
    if actual_dimension != expected_dimension:
        raise ValueError(
            f"Embedding 차원이 일치하지 않습니다. "
            f"expected={expected_dimension}, actual={actual_dimension}"
        )

    for value in embedding:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError("Embedding vector에는 숫자만 포함되어야 합니다.")
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            raise ValueError(
                "Embedding vector에 유효하지 않은 숫자가 포함되어 있습니다."
            )


def normalize_embedding_vector(
    embedding: Sequence[float],
) -> list[float]:
    """
    Embedding vector를 L2 norm이 1이 되도록 정규화한다.
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

    if not values:
        raise ValueError("정규화할 embedding이 없습니다.")

    norm = math.sqrt(math.fsum(value * value for value in values))
    if norm == 0:
        raise ValueError(
            "Embedding vector의 L2 norm이 0이므로 정규화할 수 없습니다."
        )

    normalized = [value / norm for value in values]
    for number in normalized:
        if not math.isfinite(number):
            raise ValueError(
                "Embedding vector에 유효하지 않은 숫자가 포함되어 있습니다."
            )
    return normalized


class EmbeddingService:
    """Gemini Embedding 설정·검증 서비스. (API 호출은 STEP 6-2)"""

    model_name: str
    output_dimensionality: int
    client: Any

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model_name: str | None = None,
        output_dimensionality: int | None = None,
        client: Any | None = None,
    ) -> None:
        load_dotenv(_ROOT / ".env")
        load_dotenv(_ROOT / ".env.local")
        load_dotenv()

        resolved_model = (
            model_name
            or os.getenv("EMBEDDING_MODEL")
            or DEFAULT_EMBEDDING_MODEL
        )
        if resolved_model is None or str(resolved_model).strip() == "":
            raise ValueError("Embedding 모델명이 설정되지 않았습니다.")
        self.model_name = str(resolved_model).strip()

        if output_dimensionality is not None:
            resolved_dimension = int(output_dimensionality)
        else:
            env_dimension = os.getenv("EMBEDDING_OUTPUT_DIMENSIONALITY")
            if env_dimension is not None and str(env_dimension).strip() != "":
                resolved_dimension = int(env_dimension)
            else:
                resolved_dimension = DEFAULT_OUTPUT_DIMENSIONALITY

        if resolved_dimension < 1:
            raise ValueError(
                "EMBEDDING_OUTPUT_DIMENSIONALITY는 1 이상이어야 합니다."
            )
        self.output_dimensionality = resolved_dimension

        if client is not None:
            self.client = client
            return

        resolved_api_key = (
            api_key
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        if not resolved_api_key or str(resolved_api_key).strip() == "":
            raise ValueError(
                "GEMINI_API_KEY 또는 GOOGLE_API_KEY가 설정되지 않았습니다."
            )

        timeout_raw = os.getenv("API_TIMEOUT_SECONDS")
        http_options = None
        if timeout_raw is not None and str(timeout_raw).strip() != "":
            try:
                timeout_seconds = int(str(timeout_raw).strip())
            except ValueError:
                timeout_seconds = 55
            if timeout_seconds > 0:
                http_options = types.HttpOptions(
                    timeout=timeout_seconds * 1000,
                )

        if http_options is not None:
            self.client = genai.Client(
                api_key=str(resolved_api_key).strip(),
                http_options=http_options,
            )
        else:
            self.client = genai.Client(
                api_key=str(resolved_api_key).strip()
            )

    def build_embed_config(
        self,
        task_type: str,
        *,
        title: str | None = None,
    ) -> types.EmbedContentConfig:
        validated_task_type = validate_task_type(task_type)

        if title is not None and not isinstance(title, str):
            raise TypeError("title은 문자열 또는 None이어야 합니다.")

        cleaned_title: str | None = None
        if isinstance(title, str):
            cleaned_title = title.strip()
            if not cleaned_title:
                cleaned_title = None

        if cleaned_title is not None and validated_task_type == QUERY_TASK_TYPE:
            raise ValueError(
                "title은 RETRIEVAL_DOCUMENT에서만 사용할 수 있습니다."
            )

        if cleaned_title is not None:
            return types.EmbedContentConfig(
                task_type=validated_task_type,
                output_dimensionality=self.output_dimensionality,
                title=cleaned_title,
            )

        return types.EmbedContentConfig(
            task_type=validated_task_type,
            output_dimensionality=self.output_dimensionality,
        )

    def validate_embedding(
        self,
        embedding: Sequence[float],
    ) -> None:
        validate_embedding_dimension(
            embedding,
            expected_dimension=self.output_dimensionality,
        )

    def _generate_embedding(
        self,
        text: str,
        *,
        task_type: str,
        title: str | None = None,
    ) -> list[float]:
        """
        Gemini API를 호출하고 검증된 Embedding vector를 반환한다.
        """
        prepared_text = prepare_embedding_text(text)
        validated_task_type = validate_task_type(task_type)
        config = self.build_embed_config(
            validated_task_type,
            title=title,
        )

        try:
            response = self.client.models.embed_content(
                model=self.model_name,
                contents=prepared_text,
                config=config,
            )
        except errors.APIError as exc:
            raise RuntimeError(
                "Gemini Embedding API 호출 중 오류가 발생했습니다."
            ) from exc
        except Exception as exc:
            raise RuntimeError(
                "Gemini Embedding 생성 중 예상하지 못한 오류가 발생했습니다."
            ) from exc

        raw_embedding = extract_embedding_values(response)
        self.validate_embedding(raw_embedding)
        normalized_embedding = normalize_embedding_vector(raw_embedding)
        self.validate_embedding(normalized_embedding)
        return normalized_embedding

    def generate_document_embedding(
        self,
        text: str,
        *,
        title: str | None = None,
    ) -> list[float]:
        """
        문서 검색용 RETRIEVAL_DOCUMENT Embedding을 생성한다.
        """
        return self._generate_embedding(
            text,
            task_type=DOCUMENT_TASK_TYPE,
            title=title,
        )

    def generate_query_embedding(
        self,
        query: str,
    ) -> list[float]:
        """
        사용자 검색어를 RETRIEVAL_QUERY용 Embedding으로 변환한다.

        반환 벡터는 설정된 output_dimensionality와 동일한 차원이며,
        _generate_embedding() 내부에서 L2 정규화된다.
        """
        return self._generate_embedding(
            query,
            task_type=QUERY_TASK_TYPE,
        )


if __name__ == "__main__":
    from types import SimpleNamespace

    # ----- A. STEP 6-1 회귀 단위 테스트 -----
    unit_service = EmbeddingService(
        model_name="gemini-embedding-001",
        output_dimensionality=768,
        client=object(),
    )

    raw_text = (
        "  행정규칙\r\n"
        "\r\n"
        "\r\n"
        "「 관세법 」\t제 102 조 및 제 108 조\r\n"
        "제 1 조의 2 ( 적용 범위 )  "
    )

    normalized = normalize_text_v2(raw_text)

    assert "\r" not in normalized
    assert "\t" not in normalized
    assert "\n\n\n" not in normalized
    assert "「관세법」" in normalized
    assert "제102조" in normalized
    assert "제108조" in normalized
    assert "제1조의2" in normalized
    assert "(적용 범위)" in normalized

    prepared = prepare_embedding_text(raw_text)

    assert prepared == normalized
    assert prepared

    try:
        prepare_embedding_text("   ")
    except ValueError as exc:
        assert str(exc) == "임베딩할 텍스트가 없습니다."
    else:
        raise AssertionError(
            "빈 임베딩 텍스트 ValueError가 발생하지 않았습니다."
        )

    assert (
        validate_task_type("retrieval_document")
        == "RETRIEVAL_DOCUMENT"
    )

    assert (
        validate_task_type(" RETRIEVAL_QUERY ")
        == "RETRIEVAL_QUERY"
    )

    try:
        validate_task_type("CLASSIFICATION")
    except ValueError:
        pass
    else:
        raise AssertionError(
            "지원하지 않는 task_type ValueError가 발생하지 않았습니다."
        )

    document_config = unit_service.build_embed_config(
        "RETRIEVAL_DOCUMENT",
        title="사후관리에 관한 고시",
    )

    assert document_config.task_type is not None
    assert document_config.output_dimensionality == 768

    query_config = unit_service.build_embed_config(
        "RETRIEVAL_QUERY"
    )

    assert query_config.task_type is not None
    assert query_config.output_dimensionality == 768

    try:
        unit_service.build_embed_config(
            "RETRIEVAL_QUERY",
            title="잘못된 제목",
        )
    except ValueError as exc:
        assert (
            str(exc)
            == "title은 RETRIEVAL_DOCUMENT에서만 사용할 수 있습니다."
        )
    else:
        raise AssertionError(
            "Query title ValueError가 발생하지 않았습니다."
        )

    fake_response = SimpleNamespace(
        embeddings=[
            SimpleNamespace(
                values=[0.1, 0.2, 0.3]
            )
        ]
    )

    values = extract_embedding_values(fake_response)

    assert values == [0.1, 0.2, 0.3]
    assert all(isinstance(value, float) for value in values)

    fake_embedding = [0.0] * 768

    unit_service.validate_embedding(fake_embedding)

    try:
        unit_service.validate_embedding([0.0] * 767)
    except ValueError as exc:
        assert "expected=768" in str(exc)
        assert "actual=767" in str(exc)
    else:
        raise AssertionError(
            "Embedding 차원 ValueError가 발생하지 않았습니다."
        )

    invalid_embedding = [0.0] * 768
    invalid_embedding[10] = math.nan

    try:
        unit_service.validate_embedding(invalid_embedding)
    except ValueError as exc:
        assert (
            str(exc)
            == "Embedding vector에 유효하지 않은 숫자가 포함되어 있습니다."
        )
    else:
        raise AssertionError(
            "NaN Embedding ValueError가 발생하지 않았습니다."
        )

    normalized_test = normalize_embedding_vector([3.0, 4.0])

    assert len(normalized_test) == 2
    assert math.isclose(
        normalized_test[0],
        0.6,
        rel_tol=1e-9,
    )
    assert math.isclose(
        normalized_test[1],
        0.8,
        rel_tol=1e-9,
    )

    normalized_norm = math.sqrt(
        math.fsum(value * value for value in normalized_test)
    )

    assert math.isclose(
        normalized_norm,
        1.0,
        rel_tol=1e-9,
        abs_tol=1e-9,
    )

    try:
        normalize_embedding_vector([0.0, 0.0])
    except ValueError as exc:
        assert (
            str(exc)
            == "Embedding vector의 L2 norm이 0이므로 정규화할 수 없습니다."
        )
    else:
        raise AssertionError(
            "0 vector 정규화 ValueError가 발생하지 않았습니다."
        )

    print("OK: STEP 6-1 회귀 단위 테스트 완료")

    # ----- B. Query 메서드 단위 테스트 (fake client) -----
    class FakeModels:
        def __init__(self) -> None:
            self.last_model: str | None = None
            self.last_contents: str | None = None
            self.last_config: Any = None

        def embed_content(
            self,
            *,
            model: str,
            contents: str,
            config: Any,
        ) -> Any:
            self.last_model = model
            self.last_contents = contents
            self.last_config = config
            return SimpleNamespace(
                embeddings=[
                    SimpleNamespace(values=[1.0] + [0.0] * 767)
                ]
            )

    class FakeClient:
        def __init__(self) -> None:
            self.models = FakeModels()

    fake_client = FakeClient()
    fake_query_service = EmbeddingService(
        model_name="gemini-embedding-001",
        output_dimensionality=768,
        client=fake_client,
    )

    fake_query_embedding = fake_query_service.generate_query_embedding(
        "  제 102 조에 따른 사후관리  "
    )

    assert len(fake_query_embedding) == 768
    assert fake_client.models.last_model == "gemini-embedding-001"
    assert fake_client.models.last_config.task_type is not None
    assert (
        "RETRIEVAL_QUERY"
        in str(fake_client.models.last_config.task_type).upper()
    )
    assert fake_client.models.last_config.title is None
    assert "제102조" in fake_client.models.last_contents
    assert "제 102 조" not in fake_client.models.last_contents

    fake_query_norm = math.sqrt(
        math.fsum(value * value for value in fake_query_embedding)
    )
    assert math.isclose(
        fake_query_norm,
        1.0,
        rel_tol=1e-9,
        abs_tol=1e-9,
    )

    # ----- C. 실제 Gemini Query Embedding 통합 테스트 -----
    service = EmbeddingService()
    query = "사후관리 물품의 용도 외 사용금지기간은?"
    query_embedding = service.generate_query_embedding(query)

    print("query:", query)
    print("model:", service.model_name)
    print(
        "output_dimensionality:",
        service.output_dimensionality,
    )
    print("task_type:", QUERY_TASK_TYPE)
    print(
        "query embedding length:",
        len(query_embedding),
    )
    print(
        "query embedding sample:",
        query_embedding[:5],
    )

    query_embedding_norm = math.sqrt(
        math.fsum(value * value for value in query_embedding)
    )
    print(
        "query embedding norm:",
        query_embedding_norm,
    )

    assert query_embedding
    assert isinstance(query_embedding, list)
    assert len(query_embedding) == 768
    assert len(query_embedding) == service.output_dimensionality

    assert all(
        isinstance(value, float)
        for value in query_embedding
    )

    assert all(
        math.isfinite(value)
        for value in query_embedding
    )

    assert math.isclose(
        query_embedding_norm,
        1.0,
        rel_tol=1e-6,
        abs_tol=1e-6,
    )

    # ----- D. Query 예외 테스트 -----
    try:
        service.generate_query_embedding("   ")
    except ValueError as exc:
        assert str(exc) == "임베딩할 텍스트가 없습니다."
    else:
        raise AssertionError(
            "빈 Query ValueError가 발생하지 않았습니다."
        )

    try:
        service.generate_query_embedding(123)  # type: ignore[arg-type]
    except TypeError as exc:
        assert str(exc) == "text는 문자열이어야 합니다."
    else:
        raise AssertionError(
            "비문자열 Query TypeError가 발생하지 않았습니다."
        )

    print("OK: STEP 6-4 Gemini Query Embedding 768차원 생성 완료")
