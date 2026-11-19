# base_llm.py
#
# 역할: Smart Law AI의 LLM Provider 공통 인터페이스.

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseLLM(ABC):
    """
    Smart Law AI의 LLM Provider 공통 인터페이스.
    """

    @abstractmethod
    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> dict[str, Any]:
        """
        System Prompt와 User Prompt를 기반으로
        답변을 생성하고 표준 결과를 반환한다.
        """
        raise NotImplementedError
