import "server-only";

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on", "y"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off", "n"].includes(value)) {
    return false;
  }
  return defaultValue;
}

function parsePositiveInt(
  raw: string | undefined,
  defaultValue: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }
  if (!/^\d+$/.test(raw.trim())) {
    return defaultValue;
  }
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(value) || value < 1) {
    return defaultValue;
  }
  return value;
}

export const QUERY_VALIDATION_ERROR_MESSAGE =
  "질문을 다시 입력해주세요.";

export const RAG_VERSION_HEADER = "X-RAG-Version";
export const REQUEST_ID_HEADER = "X-Request-ID";

export function getMaxQueryLength(): number {
  return parsePositiveInt(process.env.MAX_QUERY_LENGTH, 2000);
}

export function getRagVersion(): string {
  const raw = process.env.RAG_VERSION;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.trim();
  }
  return "1.0.0";
}

export function getAllowOrigins(): string[] {
  const raw = process.env.ALLOW_ORIGINS;
  if (typeof raw !== "string" || raw.trim() === "") {
    return ["http://localhost:3000", "http://127.0.0.1:3000"];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isRequestLogEnabled(): boolean {
  return parseBool(process.env.ENABLE_REQUEST_LOG, true);
}

const SENSITIVE_KEY =
  /(api[_\-\s]?key|authorization|cookie|bearer|secret|password)/i;

export function maskSensitiveText(value: string): string {
  return value
    .replace(
      /(api[_\-\s]?key|authorization|cookie|bearer|secret|password)\s*[=:]\s*([^\s,;]+)/gi,
      "$1=********",
    )
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer ********");
}

export function maskSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveData(item));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = "********";
      } else {
        result[key] = maskSensitiveData(item);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    return maskSensitiveText(value);
  }
  return value;
}

export function validateQueryText(query: unknown): {
  ok: boolean;
  cleaned: string;
  message?: string;
} {
  if (typeof query !== "string") {
    return {
      ok: false,
      cleaned: "",
      message: QUERY_VALIDATION_ERROR_MESSAGE,
    };
  }

  try {
    const encoded = Buffer.from(query, "utf8");
    const decoded = encoded.toString("utf8");
    if (decoded !== query) {
      return {
        ok: false,
        cleaned: "",
        message: QUERY_VALIDATION_ERROR_MESSAGE,
      };
    }
  } catch {
    return {
      ok: false,
      cleaned: "",
      message: QUERY_VALIDATION_ERROR_MESSAGE,
    };
  }

  const cleaned = query.trim();
  if (cleaned === "") {
    return {
      ok: false,
      cleaned: "",
      message: QUERY_VALIDATION_ERROR_MESSAGE,
    };
  }

  if (cleaned.length > getMaxQueryLength()) {
    return {
      ok: false,
      cleaned: "",
      message: QUERY_VALIDATION_ERROR_MESSAGE,
    };
  }

  return { ok: true, cleaned };
}

const INJECTION_PATTERNS = [
  "ignore previous instructions",
  "system prompt",
  "developer prompt",
  "act as",
  "jailbreak",
  "<system>",
  "<assistant>",
] as const;

export function scanPromptInjection(query: string): {
  warning: boolean;
  matched: string[];
} {
  const lowered = query.toLowerCase();
  const matched = INJECTION_PATTERNS.filter((pattern) =>
    lowered.includes(pattern.toLowerCase()),
  );
  return {
    warning: matched.length > 0,
    matched: [...matched],
  };
}
