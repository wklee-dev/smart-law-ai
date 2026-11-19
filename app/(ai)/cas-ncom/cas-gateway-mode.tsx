"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CAS_GATEWAY_MODE_HEADER,
  type CasGatewayMode,
} from "@/app/lib/cas-ncom-api-paths";

export type { CasGatewayMode };
export { CAS_GATEWAY_MODE_HEADER };

const STORAGE_KEY = "cas-ncom-gateway-mode";

export function loadCasGatewayMode(): CasGatewayMode {
  if (typeof window === "undefined") return "production";
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw === "local" ? "local" : "production";
  } catch {
    return "production";
  }
}

export function saveCasGatewayMode(mode: CasGatewayMode): void {
  sessionStorage.setItem(STORAGE_KEY, mode);
}

export function casGatewayModeLabel(mode: CasGatewayMode): string {
  return mode === "local" ? "로컬" : "운영";
}

export function casGatewayRequestHeaders(
  mode: CasGatewayMode,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    ...extra,
    [CAS_GATEWAY_MODE_HEADER]: mode,
  };
}

export function useCasGatewayMode() {
  const [mode, setModeState] = useState<CasGatewayMode>("production");

  useEffect(() => {
    setModeState(loadCasGatewayMode());
  }, []);

  const setMode = useCallback((next: CasGatewayMode) => {
    saveCasGatewayMode(next);
    setModeState(next);
  }, []);

  return { mode, setMode };
}

export function CasGatewaySwitch({
  mode,
  onChange,
}: {
  mode: CasGatewayMode;
  onChange: (mode: CasGatewayMode) => void;
}) {
  const options: { value: CasGatewayMode; label: string }[] = [
    { value: "production", label: "운영" },
    { value: "local", label: "로컬" },
  ];

  return (
    <div
      className="inline-flex shrink-0 items-center gap-1"
      role="group"
      aria-label="Gateway 서버 선택"
    >
      <span className="hidden text-[10px] font-medium text-slate-400 lg:inline">
        GW
      </span>
      <div className="inline-flex rounded-md bg-slate-100 p-0.5">
        {options.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "bg-[#1e2f4f] text-white shadow-sm"
                  : "text-[#666] hover:text-[#333]"
              }`}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
