"use client";

import {
  CasAlert,
  CasCard,
  CasCompactInput,
  CasPageHeader,
  CasDangerButton,
  CasExcelButton,
  CasInlineField,
  CasPrimaryButton,
  CasSaveButton,
  CasSubNavTabs,
  CasSearchButton,
  CasSearchFormActions,
  CasSecondaryButton,
  slTableWrapClass,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasSearchFieldsRow,
  CasSearchFormRow,
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import { buildSystemDevStatusDashboard } from "@/app/lib/system-dev-status-dashboard";
import { SystemDevStatusDashboardPanel } from "@/app/(ai)/system-dev-status/system-dev-status-dashboard-panel";
import {
  DEFAULT_SYSTEM_DEV_STATUS_YEAR,
  EMPTY_SYSTEM_DEV_STATUS_ITEM,
  getSystemDevStatusDefaultInquiryYear,
  type SystemDevStatusHistoryEntry,
  type SystemDevStatusItem,
} from "@/app/shared/system-dev-status-types";
import {
  SYSTEM_DEV_STATUS_GRID_COLUMNS,
  downloadSystemDevStatusExcel,
  printSystemDevStatusSchedule,
  systemDevStatusCellDisplay,
} from "@/app/(ai)/system-dev-status/system-dev-status-grid";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** 그리드(`text-sm` · td `py-2`)와 동일한 등록 폼 타이포 */
const formLabelClass =
  "text-sm font-semibold leading-snug text-slate-700";
const inputClass =
  "min-h-[2.25rem] w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm leading-normal text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30";

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      {label.trim() ? (
        <span className={formLabelClass}>{label}</span>
      ) : (
        <span className="sr-only">안내</span>
      )}
      {children}
    </label>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const INQUIRY_DEFAULT_YEAR = getSystemDevStatusDefaultInquiryYear();

const CHANGED_BY_STORAGE_KEY = "system-dev-status-changed-by";

function historyActionLabel(action: SystemDevStatusHistoryEntry["action"]): string {
  if (action === "create") return "신규";
  if (action === "delete") return "삭제";
  return "수정";
}

function formatHistoryWhen(iso: string): string {
  if (!iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 그리드 본문 — 뷰포트 기준 높이 상한(부모 flex와 무관하게 스크롤) */
const SCHEDULE_GRID_SCROLL_CLASS =
  "max-h-[min(68vh,720px)] min-h-[240px] overflow-auto overscroll-contain";

const DEV_STATUS_TABS = [
  { key: "status", label: "시스템처리현황" },
  { key: "schedule", label: "시스템일정관리" },
] as const;

type DevStatusTabKey = (typeof DEV_STATUS_TABS)[number]["key"];

function parseYearText(text: string): number | null {
  const t = text.trim();
  if (t.length !== 4) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

export function SystemDevStatusView() {
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<SystemDevStatusItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<SystemDevStatusItem>(() => ({
    ...EMPTY_SYSTEM_DEV_STATUS_ITEM,
    year: INQUIRY_DEFAULT_YEAR,
  }));
  const [filterYearText, setFilterYearText] = useState(
    String(INQUIRY_DEFAULT_YEAR),
  );
  const filterYear =
    parseYearText(filterYearText) ?? INQUIRY_DEFAULT_YEAR;
  const [yearOptions, setYearOptions] = useState<number[]>([
    INQUIRY_DEFAULT_YEAR,
    DEFAULT_SYSTEM_DEV_STATUS_YEAR,
  ]);
  const [filterSystem, setFilterSystem] = useState("");
  const [filterWorkArea, setFilterWorkArea] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceSheet, setSourceSheet] = useState("");
  const [activeTab, setActiveTab] = useState<DevStatusTabKey>("status");
  const [changedBy, setChangedBy] = useState("");
  const [historyEntries, setHistoryEntries] = useState<
    SystemDevStatusHistoryEntry[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const showMsg = (text: string, isError = false) => {
    if (isError) {
      setError(text);
      setMessage("");
    } else {
      setMessage(text);
      setError("");
    }
    window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 4000);
  };

  const load = useCallback(async (opts?: { autoSeed?: boolean }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", String(filterYear));
      if (filterSystem.trim()) params.set("system", filterSystem.trim());
      if (filterWorkArea.trim()) params.set("workArea", filterWorkArea.trim());
      if (filterQ.trim()) params.set("q", filterQ.trim());
      if (opts?.autoSeed === false) params.set("autoSeed", "0");

      const res = await fetch(`/api/system-dev-status?${params.toString()}`);
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        data?: SystemDevStatusItem[];
        defaultSheet?: string;
        years?: number[];
        year?: number;
        seedInfo?: {
          seeded?: boolean;
          importResult?: { imported: number; year: number };
        };
      };
      if (!json.ok) {
        showMsg(json.message ?? "조회 실패", true);
        return;
      }
      setItems(json.data ?? []);
      setSourceSheet(json.defaultSheet ?? "");
      if (json.years?.length) {
        setYearOptions(json.years);
      }
      if (json.seedInfo?.seeded && json.seedInfo.importResult) {
        showMsg(
          `${json.seedInfo.importResult.year}년 DB가 비어 있어 WBS 엑셀에서 ${json.seedInfo.importResult.imported}건을 불러왔습니다.`,
        );
      }
    } catch {
      showMsg("목록을 불러오지 못했습니다.", true);
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterSystem, filterWorkArea, filterQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHANGED_BY_STORAGE_KEY);
      if (saved?.trim()) setChangedBy(saved.trim());
    } catch {
      // ignore
    }
  }, []);

  const loadHistory = useCallback(async (statusId: number | null) => {
    if (statusId == null) {
      setHistoryEntries([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/system-dev-status?historyStatusId=${statusId}`,
      );
      const json = (await res.json()) as {
        ok?: boolean;
        history?: SystemDevStatusHistoryEntry[];
      };
      if (json.ok) {
        setHistoryEntries(json.history ?? []);
      } else {
        setHistoryEntries([]);
      }
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const yearSelectOptions = useMemo(() => {
    const set = new Set<number>([
      ...yearOptions,
      filterYear,
      INQUIRY_DEFAULT_YEAR,
      DEFAULT_SYSTEM_DEV_STATUS_YEAR,
    ]);
    return [...set].sort((a, b) => b - a);
  }, [yearOptions, filterYear]);

  const systemOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.systemName.trim()) set.add(item.systemName.trim());
    }
    return [...set].sort();
  }, [items]);

  const dashboardSummary = useMemo(
    () => buildSystemDevStatusDashboard(items),
    [items],
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (selectedItem) {
      setForm({ ...selectedItem });
    }
  }, [selectedItem]);

  const selectRow = (item: SystemDevStatusItem) => {
    if (item.id == null) return;
    setSelectedId(item.id);
    setForm({ ...item });
  };

  const exportExcel = () => {
    if (items.length === 0) {
      showMsg("다운로드할 조회 결과가 없습니다.", true);
      return;
    }
    void downloadSystemDevStatusExcel(items, filterYear).catch(() => {
      showMsg("엑셀 다운로드 중 오류가 발생했습니다.", true);
    });
  };

  const exportPrint = () => {
    if (items.length === 0) {
      showMsg("출력할 조회 결과가 없습니다.", true);
      return;
    }
    printSystemDevStatusSchedule(items, filterYear);
  };

  const startNew = () => {
    setSelectedId(null);
    setHistoryEntries([]);
    setForm({
      ...EMPTY_SYSTEM_DEV_STATUS_ITEM,
      year: filterYear,
      sortOrder: items.length,
      sourceSheet: sourceSheet || "시스템개발현황 20251016",
    });
  };

  const updateForm = (patch: Partial<SystemDevStatusItem>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const persistChangedBy = (name: string) => {
    const trimmed = name.trim();
    try {
      if (trimmed) {
        window.localStorage.setItem(CHANGED_BY_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(CHANGED_BY_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  };

  const save = async () => {
    setLoading(true);
    try {
      persistChangedBy(changedBy);
      const progressRaw = form.progress;
      const res = await fetch("/api/system-dev-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          item: { ...form, progress: progressRaw },
          changedBy: changedBy.trim(),
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        item?: SystemDevStatusItem;
      };
      if (!json.ok || !json.item) {
        showMsg(json.message ?? "저장 실패", true);
        return;
      }
      showMsg(json.message ?? "저장되었습니다.");
      setSelectedId(json.item.id);
      setForm(json.item);
      await load({ autoSeed: false });
      await loadHistory(json.item.id);
    } catch {
      showMsg("저장 중 오류가 발생했습니다.", true);
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (form.id == null) {
      startNew();
      return;
    }
    if (!window.confirm(`「${form.taskNo}」 항목을 삭제할까요?`)) return;
    setLoading(true);
    try {
      persistChangedBy(changedBy);
      const res = await fetch("/api/system-dev-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id: form.id,
          changedBy: changedBy.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!json.ok) {
        showMsg(json.message ?? "삭제 실패", true);
        return;
      }
      showMsg(json.message ?? "삭제되었습니다.");
      setHistoryEntries([]);
      startNew();
      await load({ autoSeed: false });
    } catch {
      showMsg("삭제 중 오류가 발생했습니다.", true);
    } finally {
      setLoading(false);
    }
  };

  const uploadExcelFile = async (file: File) => {
    const year = parseYearText(filterYearText);
    if (year == null) {
      showMsg("연도를 4자리(2000~2100)로 입력한 뒤 업로드해 주세요.", true);
      return;
    }
    if (
      !window.confirm(
        `${year}년 데이터를 선택한 엑셀(「시스템개발현황」 시트)로 덮어씁니다. 계속할까요?`,
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("year", String(year));
      body.append("replaceAll", "1");
      const res = await fetch("/api/system-dev-status/upload", {
        method: "POST",
        body,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        data?: SystemDevStatusItem[];
      };
      if (!json.ok) {
        showMsg(json.message ?? "업로드 실패", true);
        return;
      }
      setItems(json.data ?? []);
      setFilterYearText(String(year));
      showMsg(json.message ?? "엑셀 업로드 완료");
    } catch {
      showMsg("엑셀 업로드 중 오류가 발생했습니다.", true);
    } finally {
      setLoading(false);
      if (excelInputRef.current) excelInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-slate-50 p-4 md:p-6">
      <CasCard className="shrink-0 p-4 md:p-5">
        <CasPageHeader title="시스템관리현황" />
        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadExcelFile(file);
          }}
        />

        {message ? (
          <div className="mt-3">
            <CasAlert tone="info">{message}</CasAlert>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <CasAlert tone="error">{error}</CasAlert>
          </div>
        ) : null}

        <div className="mt-3 border-t border-slate-100 pt-3">
        <CasSearchFormRow
          singleLine
          compact
          fields={
          <CasSearchFieldsRow singleLine compact>
            <CasInlineField label="년도" aligned className="shrink-0">
              <CasCompactInput
                type="text"
                inputMode="numeric"
                maxLength={4}
                list="system-dev-status-years"
                value={filterYearText}
                onChange={(e) =>
                  setFilterYearText(
                    e.target.value.replace(/\D/g, "").slice(0, 4),
                  )
                }
                onBlur={() => {
                  const y = parseYearText(filterYearText);
                  if (y != null) setFilterYearText(String(y));
                }}
                className="!w-[5.25rem] !min-w-[5.25rem] shrink-0 px-2 text-center tabular-nums tracking-wide"
              />
            </CasInlineField>
            <datalist id="system-dev-status-years">
              {yearSelectOptions.map((y) => (
                <option key={y} value={y} />
              ))}
            </datalist>
            <CasInlineField label="SYSTEM" aligned className="shrink-0">
              <CasCompactInput
                list="system-dev-status-systems"
                value={filterSystem}
                onChange={(e) => setFilterSystem(e.target.value)}
                className="!w-36"
              />
            </CasInlineField>
            <datalist id="system-dev-status-systems">
              {systemOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <CasInlineField label="업무" aligned className="shrink-0">
              <CasCompactInput
                value={filterWorkArea}
                onChange={(e) => setFilterWorkArea(e.target.value)}
                className="!w-36"
              />
            </CasInlineField>
            <CasInlineField label="검색" aligned className="min-w-[12rem] shrink-0">
              <CasCompactInput
                placeholder="NO·기능·메뉴·담당"
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                className="min-w-[12rem]"
              />
            </CasInlineField>
          </CasSearchFieldsRow>
          }
          actions={
          <CasSearchFormActions inline>
            <CasSearchButton type="button" disabled={loading} onClick={() => void load({ autoSeed: false })}>
              조회
            </CasSearchButton>
            <CasExcelButton
              type="button"
              disabled={loading}
              onClick={() => excelInputRef.current?.click()}
            >
              엑셀업로드
            </CasExcelButton>
          </CasSearchFormActions>
          }
        />
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <CasSubNavTabs
            tabs={DEV_STATUS_TABS}
            activeKey={activeTab}
            onChange={setActiveTab}
          />
        </div>
      </CasCard>

      {activeTab === "status" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SystemDevStatusDashboardPanel year={filterYear} summary={dashboardSummary} />
        </div>
      ) : null}

      {activeTab === "schedule" ? (
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row xl:items-start">
        <CasCard className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-sm text-slate-600">
            <span>
              {loading ? "불러오는 중…" : `${filterYear}년 · 총 ${items.length}건`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <CasExcelButton
                type="button"
                disabled={loading || items.length === 0}
                onClick={exportExcel}
              >
                엑셀
              </CasExcelButton>
              <CasSecondaryButton
                type="button"
                disabled={loading || items.length === 0}
                onClick={exportPrint}
              >
                출력
              </CasSecondaryButton>
              <CasPrimaryButton type="button" disabled={loading} onClick={startNew}>
                신규
              </CasPrimaryButton>
            </div>
          </div>
          <div
            className={`${SCHEDULE_GRID_SCROLL_CLASS} ${slTableWrapClass} rounded-none border-x-0 border-b-0`}
            role="region"
            aria-label="시스템일정 목록"
          >
            <table className="w-max min-w-full border-collapse text-left text-sm text-slate-800">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  {SYSTEM_DEV_STATUS_GRID_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${stickyThClass} !px-3 !py-2 !text-sm ${col.minWidth ?? ""}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <tr
                      key={item.id ?? item.taskNo}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-sky-50/60 ${active ? "bg-sky-50" : ""}`}
                      onClick={() => selectRow(item)}
                    >
                      {SYSTEM_DEV_STATUS_GRID_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`${tdClass} !px-3 !py-2 !text-sm ${col.minWidth ?? ""} ${
                            col.wrap
                              ? "max-w-[20rem] whitespace-normal align-top"
                              : "whitespace-nowrap"
                          }`}
                        >
                          {systemDevStatusCellDisplay(item, col.key)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {items.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={SYSTEM_DEV_STATUS_GRID_COLUMNS.length}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      데이터가 없습니다. 연도 입력 후 「엑셀업로드」로 WBS를 반영하세요.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CasCard>

        <CasCard className="flex w-full shrink-0 flex-col overflow-hidden p-0 xl:w-[32rem] xl:max-w-[32rem]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-800">
              {form.id ? "항목 수정" : "신규 항목"}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <span className="whitespace-nowrap font-semibold">처리자</span>
                <input
                  className="min-h-[2rem] w-[6.5rem] rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30"
                  value={changedBy}
                  onChange={(e) => setChangedBy(e.target.value)}
                  placeholder="이름"
                  title="저장·삭제 시 이력에 기록됩니다"
                />
              </label>
              <CasSaveButton type="button" disabled={loading} onClick={() => void save()} />
              <CasDangerButton type="button" disabled={loading || form.id == null} onClick={() => void remove()}>
                삭제
              </CasDangerButton>
            </div>
          </div>

          <div
            className={`${SCHEDULE_GRID_SCROLL_CLASS} overflow-x-hidden px-4 py-3 text-sm`}
          >
            <FormSection title="기본">
              <FormField label="년도 *">
                <input
                  className={inputClass}
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.year}
                  onChange={(e) =>
                    updateForm({ year: Number(e.target.value) || filterYear })
                  }
                />
              </FormField>
              <FormField label="NO *">
                <input className={inputClass} value={form.taskNo} onChange={(e) => updateForm({ taskNo: e.target.value })} />
              </FormField>
              <FormField label="SYSTEM">
                <input className={inputClass} value={form.systemName} onChange={(e) => updateForm({ systemName: e.target.value })} />
              </FormField>
              <FormField label="업무">
                <input className={inputClass} value={form.workArea} onChange={(e) => updateForm({ workArea: e.target.value })} />
              </FormField>
              <FormField label="기능구분" className="sm:col-span-2">
                <input className={inputClass} value={form.featureType} onChange={(e) => updateForm({ featureType: e.target.value })} />
              </FormField>
            </FormSection>

            <FormSection title="기능">
              <FormField label="메뉴" className="sm:col-span-2">
                <input className={inputClass} value={form.menuName} onChange={(e) => updateForm({ menuName: e.target.value })} />
              </FormField>
              <FormField label="기능" className="sm:col-span-2">
                <input className={inputClass} value={form.featureName} onChange={(e) => updateForm({ featureName: e.target.value })} />
              </FormField>
              <FormField label="기능상세" className="sm:col-span-2">
                <textarea className={`${inputClass} min-h-[4.5rem]`} value={form.featureDetail} onChange={(e) => updateForm({ featureDetail: e.target.value })} />
              </FormField>
            </FormSection>

            <FormSection title="담당·평가">
              <FormField label="요청부서">
                <input className={inputClass} value={form.requestDept} onChange={(e) => updateForm({ requestDept: e.target.value })} />
              </FormField>
              <FormField label="요청자">
                <input className={inputClass} value={form.requester} onChange={(e) => updateForm({ requester: e.target.value })} />
              </FormField>
              <FormField label="개발담당">
                <input className={inputClass} value={form.devOwner} onChange={(e) => updateForm({ devOwner: e.target.value })} />
              </FormField>
              <FormField label="우선순위">
                <input className={inputClass} value={form.priority} onChange={(e) => updateForm({ priority: e.target.value })} />
              </FormField>
              <FormField label="업무빈도수">
                <input className={inputClass} value={form.workFrequency} onChange={(e) => updateForm({ workFrequency: e.target.value })} />
              </FormField>
              <FormField label="RISK">
                <input className={inputClass} value={form.risk} onChange={(e) => updateForm({ risk: e.target.value })} />
              </FormField>
              <FormField label="고객요청수준">
                <input className={inputClass} value={form.customerRequestLevel} onChange={(e) => updateForm({ customerRequestLevel: e.target.value })} />
              </FormField>
              <FormField label="평가점수">
                <input className={inputClass} value={form.evalScore} onChange={(e) => updateForm({ evalScore: e.target.value })} />
              </FormField>
              <FormField label="개발난이도" className="sm:col-span-2">
                <input className={inputClass} value={form.devDifficulty} onChange={(e) => updateForm({ devDifficulty: e.target.value })} />
              </FormField>
            </FormSection>

            <FormSection title="일정·진척">
              <FormField label="요청일">
                <input className={inputClass} value={form.requestDate} onChange={(e) => updateForm({ requestDate: e.target.value })} />
              </FormField>
              <FormField label="예상개발일수">
                <input className={inputClass} value={form.expectedDevDays} onChange={(e) => updateForm({ expectedDevDays: e.target.value })} />
              </FormField>
              <FormField label="개발시작예정일">
                <input className={inputClass} value={form.planStartDate} onChange={(e) => updateForm({ planStartDate: e.target.value })} />
              </FormField>
              <FormField label="개발종료예정일">
                <input className={inputClass} value={form.planEndDate} onChange={(e) => updateForm({ planEndDate: e.target.value })} />
              </FormField>
              <FormField label="실제개발시작일">
                <input className={inputClass} value={form.actualStartDate} onChange={(e) => updateForm({ actualStartDate: e.target.value })} />
              </FormField>
              <FormField label="실제개발완료일">
                <input className={inputClass} value={form.actualEndDate} onChange={(e) => updateForm({ actualEndDate: e.target.value })} />
              </FormField>
              <FormField label="테스트일">
                <input className={inputClass} value={form.testDate} onChange={(e) => updateForm({ testDate: e.target.value })} />
              </FormField>
              <FormField label="테스트완료일">
                <input className={inputClass} value={form.testCompleteDate} onChange={(e) => updateForm({ testCompleteDate: e.target.value })} />
              </FormField>
              <FormField label="운영적용일">
                <input className={inputClass} value={form.productionApplyDate} onChange={(e) => updateForm({ productionApplyDate: e.target.value })} />
              </FormField>
              <FormField label="진척율 (0~1)">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  title="1 = 100%"
                  value={form.progress ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateForm({ progress: v === "" ? null : Number(v) });
                  }}
                />
              </FormField>
              <FormField label="정렬순서">
                <input
                  className={inputClass}
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => updateForm({ sortOrder: Number(e.target.value) || 0 })}
                />
              </FormField>
              <FormField label="지연/기타사유" className="sm:col-span-2">
                <textarea className={`${inputClass} min-h-[4rem]`} value={form.delayReason} onChange={(e) => updateForm({ delayReason: e.target.value })} />
              </FormField>
            </FormSection>

            {form.id != null ? (
              <FormSection title="변경 이력">
                {historyLoading ? (
                  <p className="text-sm text-slate-500 sm:col-span-2">이력 불러오는 중…</p>
                ) : historyEntries.length === 0 ? (
                  <p className="text-sm text-slate-400 sm:col-span-2">저장된 변경 이력이 없습니다.</p>
                ) : (
                  <ul className="max-h-[14rem] space-y-3 overflow-y-auto sm:col-span-2">
                    {historyEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {historyActionLabel(entry.action)}
                          </span>
                          <span>{formatHistoryWhen(entry.changedAt)}</span>
                          {entry.changedBy.trim() ? (
                            <span>· {entry.changedBy.trim()}</span>
                          ) : null}
                        </div>
                        {entry.changes.length > 0 ? (
                          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-700">
                            {entry.changes.map((ch) => (
                              <li key={`${entry.id}-${ch.field}`}>
                                <span className="font-medium text-slate-800">
                                  {ch.label}
                                </span>
                                {": "}
                                <span className="text-slate-500">
                                  {ch.oldValue || "(없음)"}
                                </span>
                                {" → "}
                                <span className="text-slate-900">
                                  {ch.newValue || "(없음)"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : entry.action === "delete" ? (
                          <p className="mt-1 text-xs text-slate-600">항목 삭제</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </FormSection>
            ) : null}
          </div>
        </CasCard>
      </div>
      ) : null}
    </div>
  );
}
