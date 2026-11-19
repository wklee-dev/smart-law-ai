# secure_logging.py
#
# 역할: 민감정보 마스킹 및 운영 성능 로그를 제공한다.

from __future__ import annotations

import logging
import re
from typing import Any, Mapping

from vector.api.ops_settings import get_ops_settings

MASK = "********"

_SENSITIVE_KEY_PATTERN = re.compile(
    r"(api[_\-\s]?key|authorization|cookie|bearer|secret|password)",
    re.IGNORECASE,
)

_SENSITIVE_VALUE_PATTERN = re.compile(
    r"(?i)(api[_\-\s]?key|authorization|cookie|bearer|secret|password)"
    r"\s*[=:]\s*([^\s,;]+)"
)

_BEARER_PATTERN = re.compile(
    r"(?i)\bBearer\s+[A-Za-z0-9\-._~+/]+=*"
)


def mask_sensitive_text(value: str) -> str:
    if not isinstance(value, str) or value == "":
        return value

    masked = _SENSITIVE_VALUE_PATTERN.sub(
        lambda m: f"{m.group(1)}={MASK}",
        value,
    )
    masked = _BEARER_PATTERN.sub(f"Bearer {MASK}", masked)
    return masked


def mask_sensitive_data(value: Any) -> Any:
    if isinstance(value, Mapping):
        result: dict[Any, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if _SENSITIVE_KEY_PATTERN.search(key_text):
                result[key] = MASK
            else:
                result[key] = mask_sensitive_data(item)
        return result

    if isinstance(value, (list, tuple)):
        return [mask_sensitive_data(item) for item in value]

    if isinstance(value, str):
        return mask_sensitive_text(value)

    return value


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = mask_sensitive_text(record.msg)

        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    mask_sensitive_data(arg)
                    for arg in record.args
                )
            elif isinstance(record.args, dict):
                record.args = mask_sensitive_data(
                    record.args
                )
            else:
                record.args = mask_sensitive_data(
                    record.args
                )
        return True


def configure_secure_logging() -> logging.Logger:
    settings = get_ops_settings()
    root = logging.getLogger()
    level = getattr(
        logging,
        settings.log_level,
        logging.INFO,
    )
    root.setLevel(level)

    ops_logger = logging.getLogger("smartlaw.ops")
    ops_logger.setLevel(level)

    for logger in (root, ops_logger):
        already = any(
            isinstance(f, SensitiveDataFilter)
            for f in logger.filters
        )
        if not already:
            logger.addFilter(SensitiveDataFilter())

    if not ops_logger.handlers:
        handler = logging.StreamHandler()
        handler.setLevel(level)
        handler.addFilter(SensitiveDataFilter())
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s "
                "[%(name)s] %(message)s"
            )
        )
        ops_logger.addHandler(handler)
        ops_logger.propagate = False

    return ops_logger


def get_ops_logger() -> logging.Logger:
    logger = logging.getLogger("smartlaw.ops")
    if not any(
        isinstance(f, SensitiveDataFilter)
        for f in logger.filters
    ):
        configure_secure_logging()
    return logger


def log_request(
    *,
    request_id: str,
    path: str,
    method: str,
    extra: Mapping[str, Any] | None = None,
) -> None:
    settings = get_ops_settings()
    if not settings.enable_request_log:
        return

    payload = {
        "RequestID": request_id,
        "method": method,
        "path": path,
    }
    if extra:
        payload.update(dict(extra))

    get_ops_logger().info(
        "request %s",
        mask_sensitive_data(payload),
    )


def log_performance(
    *,
    request_id: str,
    search_time_ms: float | None,
    ranking_time_ms: float | None,
    context_time_ms: float | None,
    gemini_time_ms: float | None,
    total_time_ms: float | None,
    prompt_token: int | None,
    completion_token: int | None,
) -> None:
    settings = get_ops_settings()
    if not settings.enable_performance_log:
        return

    payload = {
        "RequestID": request_id,
        "Search Time": search_time_ms,
        "Ranking Time": ranking_time_ms,
        "Context Time": context_time_ms,
        "Gemini Time": gemini_time_ms,
        "Total Time": total_time_ms,
        "Prompt Token": prompt_token,
        "Completion Token": completion_token,
    }
    get_ops_logger().info(
        "performance %s",
        payload,
    )
