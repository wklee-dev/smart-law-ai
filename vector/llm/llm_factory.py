# llm_factory.py
#
# 역할: 설정된 Provider에 맞는 LLM 구현을 생성한다.

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from vector.llm.base_llm import BaseLLM
from vector.llm.gemini_llm import GeminiLLM

_ROOT = Path(__file__).resolve().parents[2]

LLM_PROVIDER_ENV = "LLM_PROVIDER"
DEFAULT_LLM_PROVIDER = "gemini"

SUPPORTED_LLM_PROVIDERS = frozenset(
    {
        "gemini",
    }
)


def create_llm(
    provider: str | None = None,
) -> BaseLLM:
    """
    설정된 Provider에 맞는 LLM 구현을 생성한다.
    """
    load_dotenv(_ROOT / ".env")
    load_dotenv(_ROOT / ".env.local")
    load_dotenv()

    if provider is None:
        resolved_provider = os.getenv(
            LLM_PROVIDER_ENV,
            DEFAULT_LLM_PROVIDER,
        )
    else:
        resolved_provider = provider

    if not isinstance(resolved_provider, str):
        raise TypeError(
            "LLM Provider는 문자열이어야 합니다."
        )

    cleaned_provider = resolved_provider.strip().lower()
    if cleaned_provider == "":
        cleaned_provider = DEFAULT_LLM_PROVIDER

    if cleaned_provider not in SUPPORTED_LLM_PROVIDERS:
        raise ValueError(
            f"지원하지 않는 LLM Provider입니다: {cleaned_provider}"
        )

    if cleaned_provider == "gemini":
        return GeminiLLM()

    raise ValueError(
        f"지원하지 않는 LLM Provider입니다: {cleaned_provider}"
    )
