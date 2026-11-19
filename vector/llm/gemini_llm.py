# gemini_llm.py
#
# 역할: Google Gemini Generate Content 기반 LLM 구현.

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from vector.llm.base_llm import BaseLLM

_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = _ROOT

GEMINI_API_KEY_ENV = "GEMINI_API_KEY"
GEMINI_GENERATION_MODEL_ENV = (
    "GEMINI_GENERATION_MODEL"
)
GEMINI_GENERATION_TEMPERATURE_ENV = (
    "GEMINI_GENERATION_TEMPERATURE"
)
GEMINI_GENERATION_MAX_OUTPUT_TOKENS_ENV = (
    "GEMINI_GENERATION_MAX_OUTPUT_TOKENS"
)

DEFAULT_GEMINI_TEMPERATURE = 0.2
DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 2048

MIN_GEMINI_TEMPERATURE = 0.0
MAX_GEMINI_TEMPERATURE = 2.0

MIN_GEMINI_MAX_OUTPUT_TOKENS = 128
MAX_GEMINI_MAX_OUTPUT_TOKENS = 8192

MAX_GENERATED_ANSWER_CHARS = 50_000
MAX_PROMPT_CHARS = 100_000


class GeminiLLM(BaseLLM):
    """
    Google Gemini Generate Content 기반 LLM 구현.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
        client: Any | None = None,
    ) -> None:
        load_dotenv(PROJECT_ROOT / ".env.local", override=False)
        load_dotenv(PROJECT_ROOT / ".env", override=False)

        if api_key is None:
            resolved_api_key = os.getenv(GEMINI_API_KEY_ENV, "")
        else:
            resolved_api_key = api_key
        cleaned_api_key = str(resolved_api_key).strip()
        if cleaned_api_key == "":
            raise ValueError(
                "GEMINI_API_KEY가 설정되지 않았습니다."
            )

        if model is None:
            resolved_model = os.getenv(
                GEMINI_GENERATION_MODEL_ENV,
                "",
            )
        else:
            resolved_model = model
        cleaned_model = str(resolved_model).strip()
        if cleaned_model == "":
            raise ValueError(
                "GEMINI_GENERATION_MODEL이 설정되지 않았습니다."
            )
        self.model = cleaned_model

        if temperature is None:
            env_temperature = os.getenv(
                GEMINI_GENERATION_TEMPERATURE_ENV
            )
            if (
                env_temperature is None
                or str(env_temperature).strip() == ""
            ):
                self.temperature = DEFAULT_GEMINI_TEMPERATURE
            else:
                self.temperature = (
                    self._parse_environment_temperature(
                        env_temperature
                    )
                )
        else:
            self.temperature = self._validate_temperature(
                temperature
            )

        if max_output_tokens is None:
            env_max_tokens = os.getenv(
                GEMINI_GENERATION_MAX_OUTPUT_TOKENS_ENV
            )
            if (
                env_max_tokens is None
                or str(env_max_tokens).strip() == ""
            ):
                self.max_output_tokens = (
                    DEFAULT_GEMINI_MAX_OUTPUT_TOKENS
                )
            else:
                self.max_output_tokens = (
                    self._parse_environment_max_output_tokens(
                        env_max_tokens
                    )
                )
        else:
            self.max_output_tokens = (
                self._validate_max_output_tokens(
                    max_output_tokens
                )
            )

        if client is not None:
            self.client = client
        else:
            timeout_raw = os.getenv("API_TIMEOUT_SECONDS")
            http_options = None
            if (
                timeout_raw is not None
                and str(timeout_raw).strip() != ""
            ):
                try:
                    timeout_seconds = int(
                        str(timeout_raw).strip()
                    )
                except ValueError:
                    timeout_seconds = 55
                if timeout_seconds > 0:
                    # google-genai HttpOptions.timeout 단위: ms
                    http_options = types.HttpOptions(
                        timeout=timeout_seconds * 1000,
                    )

            if http_options is not None:
                self.client = genai.Client(
                    api_key=cleaned_api_key,
                    http_options=http_options,
                )
            else:
                self.client = genai.Client(
                    api_key=cleaned_api_key,
                )

    def __repr__(self) -> str:
        return (
            "GeminiLLM("
            f"model={self.model!r}, "
            f"temperature={self.temperature!r}, "
            f"max_output_tokens={self.max_output_tokens!r}"
            ")"
        )

    @staticmethod
    def _validate_prompt(
        value: str,
        field_name: str,
    ) -> str:
        if not isinstance(value, str):
            raise TypeError(
                f"{field_name}는 문자열이어야 합니다."
            )
        cleaned = value.strip()
        if cleaned == "":
            raise ValueError(
                f"{field_name}는 필수입니다."
            )
        if len(cleaned) > MAX_PROMPT_CHARS:
            raise ValueError(
                f"{field_name}가 최대 길이를 초과했습니다."
            )
        return cleaned

    @staticmethod
    def _validate_temperature(
        value: Any,
    ) -> float:
        if isinstance(value, bool) or not isinstance(
            value,
            (int, float),
        ):
            raise TypeError(
                "temperature는 숫자여야 합니다."
            )
        cleaned = float(value)
        if not math.isfinite(cleaned):
            raise ValueError(
                "temperature는 0.0 이상 2.0 이하여야 합니다."
            )
        if (
            cleaned < MIN_GEMINI_TEMPERATURE
            or cleaned > MAX_GEMINI_TEMPERATURE
        ):
            raise ValueError(
                "temperature는 0.0 이상 2.0 이하여야 합니다."
            )
        return cleaned

    @staticmethod
    def _validate_max_output_tokens(
        value: Any,
    ) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(
                "max_output_tokens는 정수여야 합니다."
            )
        if (
            value < MIN_GEMINI_MAX_OUTPUT_TOKENS
            or value > MAX_GEMINI_MAX_OUTPUT_TOKENS
        ):
            raise ValueError(
                "max_output_tokens는 128 이상 8192 이하여야 합니다."
            )
        return value

    @classmethod
    def _parse_environment_temperature(
        cls,
        value: str,
    ) -> float:
        try:
            parsed = float(str(value).strip())
        except (TypeError, ValueError) as exc:
            raise ValueError(
                "GEMINI_GENERATION_TEMPERATURE가 "
                "유효한 숫자가 아닙니다."
            ) from exc
        return cls._validate_temperature(parsed)

    @classmethod
    def _parse_environment_max_output_tokens(
        cls,
        value: str,
    ) -> int:
        try:
            parsed = int(str(value).strip())
        except (TypeError, ValueError) as exc:
            raise ValueError(
                "GEMINI_GENERATION_MAX_OUTPUT_TOKENS가 "
                "유효한 정수가 아닙니다."
            ) from exc
        return cls._validate_max_output_tokens(parsed)

    @staticmethod
    def _extract_response_text(
        response: Any,
    ) -> str:
        if response is None:
            raise RuntimeError(
                "Gemini가 답변 텍스트를 반환하지 않았습니다."
            )

        try:
            text_value = response.text
        except Exception:
            text_value = None

        if isinstance(text_value, str) and text_value.strip():
            cleaned = text_value.strip()
            if len(cleaned) > MAX_GENERATED_ANSWER_CHARS:
                raise RuntimeError(
                    "Gemini 답변이 허용된 최대 길이를 초과했습니다."
                )
            return cleaned

        parts: list[str] = []
        candidates = getattr(response, "candidates", None)
        if candidates:
            for candidate in candidates:
                content = getattr(candidate, "content", None)
                content_parts = getattr(content, "parts", None)
                if not content_parts:
                    continue
                for part in content_parts:
                    part_text = getattr(part, "text", None)
                    if isinstance(part_text, str) and part_text.strip():
                        parts.append(part_text.strip())

        if not parts:
            raise RuntimeError(
                "Gemini가 답변 텍스트를 반환하지 않았습니다."
            )

        cleaned = "\n".join(parts).strip()
        if cleaned == "":
            raise RuntimeError(
                "Gemini가 답변 텍스트를 반환하지 않았습니다."
            )
        if len(cleaned) > MAX_GENERATED_ANSWER_CHARS:
            raise RuntimeError(
                "Gemini 답변이 허용된 최대 길이를 초과했습니다."
            )
        return cleaned

    @staticmethod
    def _safe_token_count(value: Any) -> int | None:
        if isinstance(value, bool) or not isinstance(value, int):
            return None
        if value < 0:
            return None
        return value

    @classmethod
    def _extract_usage_metadata(
        cls,
        response: Any,
    ) -> dict[str, int | None]:
        usage = getattr(response, "usage_metadata", None)
        if usage is None:
            return {
                "prompt_token_count": None,
                "candidate_token_count": None,
                "total_token_count": None,
            }

        try:
            prompt_token_count = cls._safe_token_count(
                getattr(usage, "prompt_token_count", None)
            )
            candidate_token_count = cls._safe_token_count(
                getattr(usage, "candidates_token_count", None)
            )
            if candidate_token_count is None:
                candidate_token_count = cls._safe_token_count(
                    getattr(usage, "candidate_token_count", None)
                )
            total_token_count = cls._safe_token_count(
                getattr(usage, "total_token_count", None)
            )
        except Exception:
            return {
                "prompt_token_count": None,
                "candidate_token_count": None,
                "total_token_count": None,
            }

        return {
            "prompt_token_count": prompt_token_count,
            "candidate_token_count": candidate_token_count,
            "total_token_count": total_token_count,
        }

    @staticmethod
    def _extract_finish_reason(
        response: Any,
    ) -> str | None:
        try:
            candidates = getattr(response, "candidates", None)
            if not candidates:
                return None
            finish_reason = getattr(
                candidates[0],
                "finish_reason",
                None,
            )
            if finish_reason is None:
                return None
            name = getattr(finish_reason, "name", None)
            if isinstance(name, str) and name.strip():
                return name.strip()
            text = str(finish_reason).strip()
            return text or None
        except Exception:
            return None

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> dict[str, Any]:
        cleaned_system_prompt = self._validate_prompt(
            system_prompt,
            "system_prompt",
        )
        cleaned_user_prompt = self._validate_prompt(
            user_prompt,
            "user_prompt",
        )

        if temperature is None:
            cleaned_temperature = self.temperature
        else:
            cleaned_temperature = self._validate_temperature(
                temperature
            )

        if max_output_tokens is None:
            cleaned_max_output_tokens = self.max_output_tokens
        else:
            cleaned_max_output_tokens = (
                self._validate_max_output_tokens(
                    max_output_tokens
                )
            )

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=cleaned_user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=cleaned_system_prompt,
                    temperature=cleaned_temperature,
                    max_output_tokens=cleaned_max_output_tokens,
                ),
            )
        except Exception as exc:
            raise RuntimeError(
                "Gemini 답변 생성 중 오류가 발생했습니다."
            ) from exc

        answer_text = self._extract_response_text(response)
        usage = self._extract_usage_metadata(response)
        finish_reason = self._extract_finish_reason(response)

        return {
            "provider": "gemini",
            "model": self.model,
            "answer_text": answer_text,
            "finish_reason": finish_reason,
            "prompt_token_count": (
                usage["prompt_token_count"]
            ),
            "candidate_token_count": (
                usage["candidate_token_count"]
            ),
            "total_token_count": (
                usage["total_token_count"]
            ),
            "temperature": cleaned_temperature,
            "max_output_tokens": (
                cleaned_max_output_tokens
            ),
        }
