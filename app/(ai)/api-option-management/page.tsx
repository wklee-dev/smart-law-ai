"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { useState } from "react";
import {
  API_OPTION_STORAGE_KEY,
  DEFAULT_API_OPTION_CONFIG,
  type ApiOptionConfig,
  normalizeOptionConfig,
} from "@/app/shared/api-option-storage";

export default function ApiOptionManagementPage() {
  const [config, setConfig] = useState<ApiOptionConfig>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_API_OPTION_CONFIG;
    }

    const raw = window.localStorage.getItem(API_OPTION_STORAGE_KEY);
    if (!raw) return DEFAULT_API_OPTION_CONFIG;

    try {
      const parsed = JSON.parse(raw) as Partial<ApiOptionConfig>;
      return normalizeOptionConfig(parsed);
    } catch {
      return DEFAULT_API_OPTION_CONFIG;
    }
  });
  const [newDivision, setNewDivision] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [message, setMessage] = useState("");

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2000);
  };

  const saveConfig = (nextConfig: ApiOptionConfig) => {
    setConfig(nextConfig);
    window.localStorage.setItem(API_OPTION_STORAGE_KEY, JSON.stringify(nextConfig));
  };

  const addDivision = () => {
    const value = newDivision.trim();
    if (!value) return;
    if (config.divisions.includes(value)) {
      showMessage("이미 존재하는 구분입니다.");
      return;
    }
    saveConfig({ ...config, divisions: [...config.divisions, value] });
    setNewDivision("");
    showMessage("구분이 추가되었습니다.");
  };

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    if (config.categories.includes(value)) {
      showMessage("이미 존재하는 분류입니다.");
      return;
    }
    saveConfig({ ...config, categories: [...config.categories, value] });
    setNewCategory("");
    showMessage("분류가 추가되었습니다.");
  };

  const removeDivision = (target: string) => {
    saveConfig({
      ...config,
      divisions: config.divisions.filter((item) => item !== target),
    });
    showMessage("구분이 삭제되었습니다.");
  };

  const removeCategory = (target: string) => {
    saveConfig({
      ...config,
      categories: config.categories.filter((item) => item !== target),
    });
    showMessage("분류가 삭제되었습니다.");
  };

  const resetDefaults = () => {
    saveConfig(DEFAULT_API_OPTION_CONFIG);
    showMessage("기본값으로 초기화되었습니다.");
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-slate-50 p-4 md:p-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col gap-4">
        <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CasPageHeader title="구분/분류 관리" className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={resetDefaults}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              기본값으로 초기화
            </button>
          </div>

          {message ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          ) : null}
        </section>

        <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:gap-4">
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <h2 className="shrink-0 text-lg font-semibold text-slate-900">
                구분 목록{" "}
                <span className="text-sm font-normal text-slate-500">
                  ({config.divisions.length}건)
                </span>
              </h2>
              <div className="mt-3 shrink-0 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newDivision}
                  onChange={(e) => setNewDivision(e.target.value)}
                  placeholder="구분 추가"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && addDivision()}
                />
                <button
                  type="button"
                  onClick={addDivision}
                  className="shrink-0 rounded-lg bg-[#1e2f4f] px-3 py-2 text-sm font-medium text-white hover:bg-[#162438]"
                >
                  추가
                </button>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                <ul className="space-y-1.5">
                  {config.divisions.map((item) => (
                    <li
                      key={item}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-sm"
                    >
                      <span className="min-w-0 break-words">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeDivision(item)}
                        className="shrink-0 rounded bg-[#1e2f4f] px-2 py-1 text-xs font-medium text-white hover:bg-[#162438]"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <h2 className="shrink-0 text-lg font-semibold text-slate-900">
                분류 목록{" "}
                <span className="text-sm font-normal text-slate-500">
                  ({config.categories.length}건)
                </span>
              </h2>
              <div className="mt-3 shrink-0 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="분류 추가"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                />
                <button
                  type="button"
                  onClick={addCategory}
                  className="shrink-0 rounded-lg bg-[#1e2f4f] px-3 py-2 text-sm font-medium text-white hover:bg-[#162438]"
                >
                  추가
                </button>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-2">
                <ul className="space-y-1.5">
                  {config.categories.map((item) => (
                    <li
                      key={item}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-sm"
                    >
                      <span className="min-w-0 break-words">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeCategory(item)}
                        className="shrink-0 rounded bg-[#1e2f4f] px-2 py-1 text-xs font-medium text-white hover:bg-[#162438]"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
