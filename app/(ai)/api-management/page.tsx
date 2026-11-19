"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasAccentButton,
  CasDangerButton,
  CasPrimaryButton,
  CasResetButton,
  CasSaveButton,
  CasSecondaryButton,
} from "@/app/components/search-action-buttons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_OPTION_STORAGE_KEY,
  DEFAULT_API_OPTION_CONFIG,
  type ApiOptionConfig,
  normalizeOptionConfig,
} from "@/app/shared/api-option-storage";
import {
  prepareApiManagementList,
  type ApiManagementListItem,
} from "@/app/shared/api-management-list";
import {
  nextUploadOrder,
} from "@/app/shared/api-management-sort";
import {
  formatLawIdForDisplay,
  normalizeLawIdForStorage,
} from "@/app/shared/law-id";
import { formatLastReceivedForDisplay } from "@/app/shared/last-received-date";

type FileType = "XML" | "JSON" | "CSV";
type ApiConfig = ApiManagementListItem;

type FormState = {
  division: string;
  category: string;
  apiName: string;
  lawShortName: string;
  lawId: string;
  fileType: FileType;
  updatedAt: string;
};

type Mode = "view" | "new" | "edit";

const FILE_TYPE_OPTIONS: FileType[] = ["XML", "JSON", "CSV"];

const emptyForm: FormState = {
  division: "",
  category: "",
  apiName: "",
  lawShortName: "",
  lawId: "",
  fileType: "XML",
  updatedAt: "",
};

export default function ApiManagementPage() {
  const [apiList, setApiList] = useState<ApiConfig[]>([]);
  const [optionConfig] = useState<ApiOptionConfig>(() => {
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
  const [mode, setMode] = useState<Mode>("view");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchingLawId, setFetchingLawId] = useState(false);
  const [batchFetchingLawId, setBatchFetchingLawId] = useState(false);
  const [listFilter, setListFilter] = useState("");

  const generalLawMissingIdCount = useMemo(
    () =>
      apiList.filter(
        (item) =>
          item.division.trim() === "일반법령" && !item.lawId.trim(),
      ).length,
    [apiList],
  );

  const selectedItem = useMemo(() => {
    return apiList.find((item) => item.id === selectedId) ?? null;
  }, [apiList, selectedId]);

  const isNewMode = mode === "new";
  const isEditMode = mode === "edit";
  const canSave = isNewMode || isEditMode;
  const canDelete = isEditMode && !!selectedId;
  const isFormDisabled = mode === "view";

  const modeLabel = useMemo(() => {
    if (mode === "new") return "신규 등록";
    if (mode === "edit") return "수정";
    return "조회";
  }, [mode]);

  const filteredList = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    const base = !q
      ? apiList
      : apiList.filter((item) => {
          const blob = [
            item.division,
            item.category,
            String(item.uploadOrder),
            item.apiName,
            item.lawShortName,
            item.lawId,
            item.fileType,
            item.updatedAt,
            item.lastReceivedEflawJosub,
            item.lastReceivedAdmrulBody,
          ]
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        });
    return [...base].sort((a, b) =>
      (a.apiName ?? "").localeCompare(b.apiName ?? "", "ko")
    );
  }, [apiList, listFilter]);

  const selectionHiddenByFilter = useMemo(() => {
    if (!listFilter.trim() || !selectedId) return false;
    return !filteredList.some((item) => item.id === selectedId);
  }, [listFilter, selectedId, filteredList]);

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => {
      setMessage("");
    }, 2500);
  };

  const loadApiListFromFile = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch("/api/api-management/save", {
        method: "GET",
        cache: "no-store",
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(`파일 조회 실패: ${response.status} ${text.slice(0, 200)}`);
      }

      const data = JSON.parse(text) as {
        ok: boolean;
        data?: Partial<ApiConfig>[];
        error?: string;
      };

      if (!data.ok) {
        throw new Error(data.error || "DB 조회 실패");
      }

      if (Array.isArray(data.data)) {
        setApiList(prepareApiManagementList(data.data));
      } else {
        setApiList([]);
      }
    } catch (error) {
      console.error("파일 불러오기 오류:", error);
      setApiList([]);
      const hint =
        error instanceof Error && error.message.includes("404")
          ? "API 서버 응답 없음(404). 개발 서버를 재시작한 뒤 새로고침하세요."
          : "gwanselaw_list를 불러오지 못했습니다.";
      showMessage(hint);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveApiListToFile = async (nextList: ApiConfig[]) => {
    const sorted = prepareApiManagementList(nextList);
    const response = await fetch("/api/api-management/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiList: sorted }),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`파일 저장 실패: ${response.status} ${text}`);
    }

    const data = JSON.parse(text) as {
      ok: boolean;
      error?: string;
    };

    if (!data.ok) {
      throw new Error(data.error || "DB 저장 실패");
    }

    return { ...data, sorted };
  };

  useEffect(() => {
    loadApiListFromFile();
  }, [loadApiListFromFile]);

  const handleRowClick = (item: ApiConfig) => {
    setSelectedId(item.id);
    setForm({
      division: item.division,
      category: item.category,
      apiName: item.apiName,
      lawShortName: item.lawShortName ?? "",
      lawId: formatLawIdForDisplay(item.lawId),
      fileType: item.fileType ?? "XML",
      updatedAt: formatLastReceivedForDisplay(item.updatedAt),
    });
    setMode("edit");
    setMessage("");
  };

  const handleNew = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setMode("new");
    setMessage("");
  };

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = () => {
    if (!form.division.trim()) {
      alert("구분을 입력해 주세요.");
      return false;
    }

    if (!form.category.trim()) {
      alert("분류를 입력해 주세요.");
      return false;
    }

    if (!form.apiName.trim()) {
      alert("제공API명을 입력해 주세요.");
      return false;
    }

    if (!form.fileType.trim()) {
      alert("파일타입을 선택해 주세요.");
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (!validateForm()) return;

    try {
      setIsLoading(true);

      if (isNewMode) {
        const newItem: ApiConfig = {
          id: crypto.randomUUID(),
          division: form.division.trim(),
          category: form.category.trim(),
          uploadOrder: nextUploadOrder(apiList),
          apiName: form.apiName.trim(),
          lawShortName: form.lawShortName.trim(),
          lawId: normalizeLawIdForStorage(form.lawId.trim()),
          fileType: form.fileType,
          updatedAt: formatLastReceivedForDisplay(form.updatedAt.trim()),
          lastReceivedEflawJosub: "",
          lastReceivedAdmrulBody: "",
        };

        const { sorted } = await saveApiListToFile([...apiList, newItem]);

        setApiList(sorted);
        setSelectedId(newItem.id);
        setMode("edit");
        setForm({
          division: newItem.division,
          category: newItem.category,
          apiName: newItem.apiName,
          lawShortName: newItem.lawShortName,
          lawId: formatLawIdForDisplay(newItem.lawId),
          fileType: newItem.fileType,
          updatedAt: newItem.updatedAt,
        });

        showMessage("신규 API 정보가 DB에 저장되었습니다.");
        return;
      }

      if (isEditMode && selectedId) {
        const nextList = apiList.map((item) =>
          item.id === selectedId
            ? {
                ...item,
                division: form.division.trim(),
                category: form.category.trim(),
                apiName: form.apiName.trim(),
                lawShortName: form.lawShortName.trim(),
                lawId: normalizeLawIdForStorage(form.lawId.trim()),
                fileType: form.fileType,
                updatedAt: formatLastReceivedForDisplay(form.updatedAt.trim()),
              }
            : item,
        );

        const { sorted } = await saveApiListToFile(nextList);
        setApiList(sorted);
        showMessage("API 정보가 DB에 수정 저장되었습니다.");
      }
    } catch (error) {
      console.error("저장 오류:", error);
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchLawId = async () => {
    const apiName = form.apiName.trim();
    if (!apiName) {
      alert("제공API명을 먼저 입력해 주세요.");
      return;
    }

    const requestUrl = `/api/api-management/fetch-law-id?${new URLSearchParams({ apiName })}`;

    try {
      setFetchingLawId(true);
      setMessage("국가법령정보 API 조회 중…");

      const res = await fetch(requestUrl, { cache: "no-store" });
      const text = await res.text();

      let data: {
        ok: boolean;
        lawShortName?: string;
        lawId?: string;
        lawNameKo?: string;
        error?: string;
        requestUrl?: string;
      };

      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(
          `서버 응답이 JSON이 아닙니다 (HTTP ${res.status}). 개발 서버를 재시작했는지 확인하세요.`,
        );
      }

      if (!res.ok && !data.error) {
        throw new Error(`HTTP ${res.status}: ${data.error ?? text.slice(0, 120)}`);
      }

      if (!data.ok) {
        const detail = data.requestUrl ? `\n요청: ${data.requestUrl}` : "";
        alert(`${data.error ?? "법령ID를 가져오지 못했습니다."}${detail}`);
        setMessage("");
        return;
      }

      const lawShortName = (data.lawShortName ?? "").trim();
      const lawIdStored = normalizeLawIdForStorage(data.lawId ?? "");
      const lawIdDisplay = lawIdStored
        ? formatLawIdForDisplay(lawIdStored)
        : form.lawId;

      const nextForm: FormState = {
        ...form,
        lawShortName,
        lawId: lawIdDisplay,
      };
      setForm(nextForm);

      setMessage("DB에 저장 중…");

      if (isNewMode) {
        if (!validateForm()) {
          setMessage(
            "법령ID는 조회되었습니다. 구분·분류 등 필수 항목을 채운 뒤 [저장]을 눌러 주세요.",
          );
          return;
        }
        const newItem: ApiConfig = {
          id: crypto.randomUUID(),
          division: nextForm.division.trim(),
          category: nextForm.category.trim(),
          uploadOrder: nextUploadOrder(apiList),
          apiName: nextForm.apiName.trim(),
          lawShortName,
          lawId: lawIdStored,
          fileType: nextForm.fileType,
          updatedAt: formatLastReceivedForDisplay(nextForm.updatedAt.trim()),
          lastReceivedEflawJosub: "",
          lastReceivedAdmrulBody: "",
        };
        const { sorted } = await saveApiListToFile([...apiList, newItem]);
        setApiList(sorted);
        setSelectedId(newItem.id);
        setMode("edit");
      } else if (selectedId) {
        const nextList = apiList.map((item) =>
          item.id === selectedId
            ? { ...item, lawShortName, lawId: lawIdStored }
            : item,
        );
        const { sorted } = await saveApiListToFile(nextList);
        setApiList(sorted);
      } else {
        showMessage("목록에서 항목을 선택한 뒤 다시 시도해 주세요.");
        return;
      }

      const hint = data.lawNameKo ? ` (${data.lawNameKo})` : "";
      showMessage(
        `법령ID ${lawIdDisplay} · 약칭명 "${lawShortName}" 조회 후 DB에 저장했습니다.${hint}`,
      );
    } catch (error) {
      console.error("법령ID 가져오기:", error);
      const msg =
        error instanceof Error
          ? error.message
          : "법령ID 조회 중 오류가 발생했습니다.";
      alert(msg);
      setMessage("");
    } finally {
      setFetchingLawId(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || !selectedId) return;

    const confirmed = window.confirm("선택한 API 정보를 삭제하시겠습니까?");
    if (!confirmed) return;

    try {
      setIsLoading(true);

      const nextList = apiList.filter((item) => item.id !== selectedId);

      const { sorted } = await saveApiListToFile(nextList);

      setApiList(sorted);
      setSelectedId(null);
      setForm(emptyForm);
      setMode("view");
      showMessage("API 정보가 DB에서 삭제되었습니다.");
    } catch (error) {
      console.error("삭제 오류:", error);
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetToView = () => {
    setSelectedId(null);
    setForm(emptyForm);
    setMode("view");
    setMessage("");
  };

  const handleBatchFetchLawIds = async () => {
    const count = generalLawMissingIdCount;
    if (count === 0) {
      alert("구분이「일반법령」이고 법령ID가 비어 있는 항목이 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `구분「일반법령」·법령ID 없음: ${count}건\n\n국가법령정보 API로 법령ID·약칭명을 조회해 DB(gwanselaw_list)에 바로 저장합니다. 1~3분 정도 걸릴 수 있습니다. 계속할까요?`,
    );
    if (!confirmed) return;

    try {
      setBatchFetchingLawId(true);
      setMessage(`일반법령 법령ID 일괄 조회 중… (0/${count})`);

      const res = await fetch("/api/api-management/fetch-law-id-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiList,
          save: true,
          delayMs: 400,
        }),
      });

      const text = await res.text();
      let data: {
        ok: boolean;
        updated?: number;
        failed?: number;
        totalCandidates?: number;
        error?: string;
        results?: { apiName: string; status: string; error?: string }[];
      };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(
          `서버 응답 오류 (HTTP ${res.status}). 개발 서버를 재시작했는지 확인하세요.`,
        );
      }

      if (!data.ok) {
        alert(data.error ?? "일괄 조회에 실패했습니다.");
        setMessage("");
        return;
      }

      await loadApiListFromFile();

      const failNames =
        data.results
          ?.filter((r) => r.status === "failed")
          .slice(0, 5)
          .map((r) => `· ${r.apiName}: ${r.error ?? ""}`)
          .join("\n") ?? "";

      showMessage(
        `일괄 조회 완료 — 성공 ${data.updated ?? 0}건, 실패 ${data.failed ?? 0}건 (대상 ${data.totalCandidates ?? count}건)`,
      );

      if ((data.failed ?? 0) > 0 && failNames) {
        console.warn("법령ID 일괄 조회 실패 목록:\n", failNames);
      }
    } catch (error) {
      console.error("일괄 법령ID 조회:", error);
      alert(
        error instanceof Error
          ? error.message
          : "일괄 조회 중 오류가 발생했습니다.",
      );
      setMessage("");
    } finally {
      setBatchFetchingLawId(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 sm:flex-row sm:items-center sm:justify-between">
          <CasPageHeader title="API 관리" className="flex-1 min-w-0" />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                mode === "view"
                  ? "bg-slate-100 text-slate-600"
                  : mode === "new"
                    ? "bg-violet-100 text-violet-800"
                    : "bg-sky-100 text-sky-800"
              }`}
            >
              {modeLabel}
            </span>
            <span className="text-sm text-slate-500">
              전체 {apiList.length}건
              {listFilter.trim() ? ` · 표시 ${filteredList.length}건` : null}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(380px,440px)] lg:items-start xl:grid-cols-[1.15fr_minmax(400px,480px)]">
          {/* 목록 */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">API 목록</h2>
                  <p className="text-xs text-slate-500">
                    행을 클릭하면 오른쪽 패널에서 편집할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CasSecondaryButton
                    type="button"
                    icon="refresh"
                    onClick={() => void loadApiListFromFile()}
                    disabled={isLoading || batchFetchingLawId}
                  >
                    새로고침
                  </CasSecondaryButton>
                  <CasAccentButton
                    type="button"
                    icon="batch"
                    onClick={() => void handleBatchFetchLawIds()}
                    disabled={
                      isLoading ||
                      batchFetchingLawId ||
                      generalLawMissingIdCount === 0
                    }
                    title="구분=일반법령 이고 법령ID가 비어 있는 항목"
                  >
                    {batchFetchingLawId
                      ? "일괄 조회 중…"
                      : `일반법령 법령ID 일괄(${generalLawMissingIdCount})`}
                  </CasAccentButton>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  목록 검색
                </span>
                <input
                  type="search"
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  placeholder="구분, 분류, API명, 법령ID, 파일타입, 최종수신일, 화면별 호출일…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </label>
              {selectionHiddenByFilter ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span>선택한 항목이 현재 검색 결과에 없습니다.</span>
                  <button
                    type="button"
                    onClick={() => setListFilter("")}
                    className="shrink-0 font-medium text-amber-800 underline decoration-amber-600/60 hover:text-amber-950"
                  >
                    검색 지우기
                  </button>
                </div>
              ) : null}
            </div>

            <div className="min-h-[min(50vh,520px)] max-h-[min(58vh,640px)] flex-1 overflow-auto">
              <div className="min-w-[1040px]">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "4.5rem" }} />
                    <col style={{ width: "9.5rem" }} />
                    <col style={{ width: "3.25rem" }} />
                    <col />
                    <col style={{ width: "5.5rem" }} />
                    <col style={{ width: "3.5rem" }} />
                    <col style={{ width: "9rem" }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 shadow-sm backdrop-blur-sm">
                    <tr>
                      <th
                        scope="col"
                        className="px-2 py-2.5 pl-3 text-left text-xs font-semibold text-slate-700"
                      >
                        구분
                      </th>
                      <th
                        scope="col"
                        className="px-2 py-2.5 text-left text-xs font-semibold text-slate-700"
                      >
                        분류
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-2.5 text-center text-xs font-semibold text-slate-700"
                      >
                        정렬순서
                      </th>
                      <th
                        scope="col"
                        className="px-2 py-2.5 pr-1 text-left text-xs font-semibold text-slate-700"
                      >
                        제공API명
                        <span className="ml-1 font-normal text-slate-500">
                          · 약칭
                        </span>
                      </th>
                      <th
                        scope="col"
                        className="hidden px-1 py-2.5 text-center text-xs font-semibold text-slate-600 md:table-cell"
                      >
                        법령ID
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-2.5 text-center text-xs font-semibold text-slate-600"
                      >
                        타입
                      </th>
                      <th
                        scope="col"
                        className="hidden px-2 py-2.5 pr-3 text-right text-xs font-semibold text-slate-700 sm:table-cell"
                      >
                        최종수신
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {apiList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-slate-500"
                        >
                          {isLoading
                            ? "불러오는 중…"
                            : "등록된 API가 없습니다. 오른쪽에서 신규를 눌러 추가하세요."}
                        </td>
                      </tr>
                    ) : filteredList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-slate-500"
                        >
                          검색어와 일치하는 항목이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredList.map((item) => {
                        const isSelected = item.id === selectedId;
                        const lastRx = item.updatedAt.trim()
                          ? formatLastReceivedForDisplay(item.updatedAt)
                          : "";

                        return (
                          <tr
                            key={item.id}
                            onClick={() => handleRowClick(item)}
                            className={`cursor-pointer align-middle transition-colors ${
                              isSelected
                                ? "bg-sky-50 ring-1 ring-inset ring-sky-200/80"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td
                              className="min-w-0 max-w-0 px-2 py-2 pl-3 text-slate-800"
                              title={item.division || undefined}
                            >
                              <span className="block truncate text-xs sm:text-sm">
                                {item.division || "—"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-800 sm:text-sm">
                              {item.category || "—"}
                            </td>
                            <td className="whitespace-nowrap px-1 py-2 text-center font-mono text-xs tabular-nums text-slate-600">
                              {item.uploadOrder > 0 ? item.uploadOrder : "—"}
                            </td>
                            <td className="min-w-0 max-w-0 px-2 py-2 pr-1">
                              <div
                                className={`min-h-10 border-l-4 pl-2 sm:min-h-11 ${
                                  isSelected
                                    ? "border-sky-600"
                                    : "border-transparent"
                                }`}
                              >
                                <div
                                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                                  title={
                                    item.lawShortName.trim()
                                      ? `${item.apiName} · ${item.lawShortName}`
                                      : item.apiName
                                  }
                                >
                                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-900 sm:text-sm">
                                    {item.apiName}
                                  </span>
                                  {item.lawShortName.trim() ? (
                                    <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-100">
                                      {item.lawShortName}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td
                              className="hidden whitespace-nowrap px-1 py-2 text-center font-mono text-xs tabular-nums text-slate-800 md:table-cell"
                              title={item.lawId || undefined}
                            >
                              {item.lawId
                                ? formatLawIdForDisplay(item.lawId)
                                : "—"}
                            </td>
                            <td className="px-0.5 py-2 text-center">
                              <FileTypeBadge type={item.fileType} />
                            </td>
                            <td
                              className="hidden whitespace-nowrap px-2 py-2 pr-3 text-right text-xs tabular-nums text-slate-500 sm:table-cell"
                              title={lastRx || undefined}
                            >
                              {lastRx || "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 상세 */}
          <section className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-y-auto">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">
                    {mode === "new"
                      ? "새 API 등록"
                      : isEditMode && selectedItem
                        ? "API 수정"
                        : "API 상세"}
                  </h2>
                  {!(isEditMode && selectedItem) && mode !== "new" ? (
                    <p className="mt-0.5 text-sm text-slate-500">
                      목록에서 항목을 선택하거나 신규를 눌러 등록하세요.
                    </p>
                  ) : mode === "new" ? (
                    <p className="mt-0.5 text-sm text-slate-500">
                      필수 항목을 입력한 뒤 저장하세요.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <CasPrimaryButton
                    type="button"
                    icon="plus"
                    onClick={handleNew}
                    disabled={isLoading}
                  >
                    신규
                  </CasPrimaryButton>
                  <CasSaveButton
                    type="button"
                    onClick={handleSave}
                    disabled={!canSave || isLoading}
                  />
                  <CasDangerButton
                    type="button"
                    onClick={handleDelete}
                    disabled={!canDelete || isLoading}
                  >
                    삭제
                  </CasDangerButton>
                  <CasAccentButton
                    type="button"
                    onClick={() => void handleFetchLawId()}
                    disabled={
                      isFormDisabled ||
                      fetchingLawId ||
                      !form.apiName.trim()
                    }
                  >
                    {fetchingLawId ? "조회 중…" : "법령ID가져오기"}
                  </CasAccentButton>
                  <CasResetButton
                    type="button"
                    onClick={handleResetToView}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      label="구분"
                      value={form.division}
                      disabled={isFormDisabled || isLoading}
                      onChange={(value) => handleChange("division", value)}
                      options={optionConfig.divisions}
                    />

                    <FormField
                      label="분류"
                      value={form.category}
                      disabled={isFormDisabled || isLoading}
                      onChange={(value) => handleChange("category", value)}
                      options={optionConfig.categories}
                    />

                    <div className="sm:col-span-2">
                      <FormField
                        label="제공API명"
                        value={form.apiName}
                        disabled={isFormDisabled || isLoading}
                        onChange={(value) => handleChange("apiName", value)}
                        placeholder="예: 현행법령(시행일) 목록 조회"
                      />
                    </div>

                    <FormField
                      label="파일타입"
                      value={form.fileType}
                      disabled={isFormDisabled || isLoading}
                      onChange={(value) => handleChange("fileType", value as FileType)}
                      options={FILE_TYPE_OPTIONS}
                    />

                    <FormField
                      label="법령약칭명"
                      value={form.lawShortName}
                      disabled={isFormDisabled || isLoading}
                      onChange={(value) => handleChange("lawShortName", value)}
                      placeholder="예: 중견기업법 (없으면 비움)"
                    />

                    <FormField
                      label="법령ID"
                      value={form.lawId}
                      disabled={isFormDisabled || isLoading}
                      onChange={(value) => handleChange("lawId", value)}
                      placeholder="법령ID가져오기 또는 직접 입력"
                    />

                    <div className="sm:col-span-2">
                      <FormField
                        label="최종수신일 (선택, API 관리용)"
                        value={form.updatedAt}
                        disabled={isFormDisabled || isLoading}
                        onChange={(value) => handleChange("updatedAt", value)}
                        placeholder="YYYY/MM/DD HH:MM — 조항호목·행정규칙 본문 호출 일시와 별개"
                      />
                    </div>

                    {isEditMode && selectedItem ? (
                      <>
                        <div className="sm:col-span-2">
                          <FormField
                            label="조항호목 API 최종수신 (자동)"
                            value={
                              selectedItem.lastReceivedEflawJosub.trim()
                                ? formatLastReceivedForDisplay(
                                    selectedItem.lastReceivedEflawJosub,
                                  )
                                : "—"
                            }
                            disabled
                            onChange={() => {}}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FormField
                            label="행정규칙 본문 API 최종수신 (자동)"
                            value={
                              selectedItem.lastReceivedAdmrulBody.trim()
                                ? formatLastReceivedForDisplay(
                                    selectedItem.lastReceivedAdmrulBody,
                                  )
                                : "—"
                            }
                            disabled
                            onChange={() => {}}
                          />
                        </div>
                      </>
                    ) : null}
                  </div>

                  <details className="group rounded-xl border border-slate-200 bg-slate-50/50 text-sm open:bg-slate-50">
                    <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-700 marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-2">
                        동작 요약
                        <span className="text-xs font-normal text-slate-400">(클릭하여 펼치기)</span>
                      </span>
                    </summary>
                    <ul className="space-y-1.5 border-t border-slate-200 px-4 pb-4 pt-2 text-slate-600">
                      <li>요청 URL·서비스명은 저장하지 않습니다.</li>
                      <li>호출 URL은 환경변수(LAW_*SERVICE_URL)로 구성됩니다.</li>
                      <li>
                        파일타입·법령약칭명·법령ID는 gwanselaw_list(DB)에 저장됩니다. 법령ID가져오기는
                        국가법령정보 eflaw 검색 후 결과를 DB에 바로 저장합니다.
                      </li>
                      <li>
                        위 최종수신일은 수동 메모용입니다. 조항호목·행정규칙 본문 화면의 API
                        호출 시각은 각각 별도 필드에만 기록됩니다.
                      </li>
                    </ul>
                  </details>
              </div>

              {message ? (
                <div
                  className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                  role="status"
                >
                  {message}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FileTypeBadge({ type }: { type: FileType }) {
  const styles: Record<FileType, string> = {
    XML: "bg-slate-100 text-slate-800 ring-slate-200/80",
    JSON: "bg-amber-50 text-amber-900 ring-amber-200/80",
    CSV: "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
  };
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${styles[type]}`}
    >
      {type}
    </span>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  options?: string[];
  onChange: (value: string) => void;
};

function FormField({
  label,
  value,
  placeholder,
  disabled = false,
  options,
  onChange,
}: FormFieldProps) {
  if (options && options.length > 0) {
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          {label}
        </span>
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
            disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
          }`}
        >
          <option value="">선택하세요</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            : "border-slate-300 bg-white text-slate-900 focus:border-blue-500"
        }`}
      />
    </label>
  );
}