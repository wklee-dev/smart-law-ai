# prompt_injection_guard.py
#
# 역할: Prompt Injection 패턴을 탐지하고 warning 플래그만 생성한다.
#       요청은 차단하지 않는다.

from __future__ import annotations

from dataclasses import dataclass

INJECTION_PATTERNS: tuple[str, ...] = (
    "ignore previous instructions",
    "system prompt",
    "developer prompt",
    "act as",
    "jailbreak",
    "<system>",
    "<assistant>",
)


@dataclass(frozen=True)
class PromptInjectionScanResult:
    warning: bool
    matched_patterns: tuple[str, ...]


def scan_prompt_injection(
    query: str,
) -> PromptInjectionScanResult:
    if not isinstance(query, str) or query == "":
        return PromptInjectionScanResult(
            warning=False,
            matched_patterns=(),
        )

    lowered = query.lower()
    matched: list[str] = []
    for pattern in INJECTION_PATTERNS:
        if pattern.lower() in lowered:
            matched.append(pattern)

    return PromptInjectionScanResult(
        warning=bool(matched),
        matched_patterns=tuple(matched),
    )
