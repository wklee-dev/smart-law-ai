"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasPrimaryButton, CasResetButton } from "@/app/components/search-action-buttons";
import { useEffect, useMemo, useState } from "react";
import {
  buildEflawJosubSearchParams,
} from "@/app/lib/law-eflaw-josub";
import {
  prepareApiManagementList,
  type ApiManagementFileType,
  type ApiManagementListItem,
} from "@/app/shared/api-management-list";
import {
  formatLawIdForDisplay,
  normalizeLawIdForStorage,
} from "@/app/shared/law-id";
import {
  formatLastReceivedAt,
  formatLastReceivedForDisplay,
} from "@/app/shared/last-received-date";

type FileType = ApiManagementFileType;
type ApiConfig = ApiManagementListItem;

type LawConfigResponse = {
  ok: boolean;
  lawApiOc?: string;
  lawXmlServiceUrl?: string;
  lawJsonServiceUrl?: string;
  error?: string;
};

type FetchJson = {
  ok: boolean;
  requestedUrl?: string;
  parsedJson?: unknown;
  rawText?: string;
  error?: string;
  status?: number;
};

function normalizePreviewBaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "www.law.go.kr") u.hostname = "law.go.kr";
    return u.toString();
  } catch {
    return raw;
  }
}

export default function LawEflawJosubApiPage() {
  const [apiList, setApiList] = useState<ApiConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [lawApiOc, setLawApiOc] = useState("");
  const [lawJsonServiceUrl, setLawJsonServiceUrl] = useState("");
  const [lawId, setLawId] = useState("");
  const [lawApiId, setLawApiId] = useState("");
  const [mst, setMst] = useState("");
  const [efYd, setEfYd] = useState("");
  const [jo, setJo] = useState("");
  const [hang, setHang] = useState("");
  const [ho, setHo] = useState("");
  const [mok, setMok] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info",
  );
  const [lastFetch, setLastFetch] = useState<FetchJson | null>(null);

  const persistLastReceivedAt = (apiId: string) => {
    const receivedAt = formatLastReceivedAt(new Date());
    setApiList((prev) => {
      const next = prev.map((item) =>
        item.id === apiId
          ? { ...item, lastReceivedEflawJosub: receivedAt }
          : item,
      );
      void (async () => {
        try {
          const response = await fetch("/api/api-management/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiList: next }),
          });
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`최종수신일 저장 실패: ${response.status} ${text}`);
          }
          const data = JSON.parse(text) as { ok: boolean; error?: string };
          if (!data.ok) {
            throw new Error(data.error || "최종수신일 DB 저장 실패");
          }
        } catch (e) {
          console.error(e);
        }
      })();
      return next;
    });
  };

  useEffect(() => {
    const loadApiListFromFile = async () => {
      try {
        const response = await fetch("/api/api-management/save", {
          method: "GET",
          cache: "no-store",
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`API 목록 조회 실패: ${response.status} ${text}`);
        }
        const data = JSON.parse(text) as {
          ok: boolean;
          data?: Partial<ApiConfig>[];
          error?: string;
        };
        if (!data.ok) {
          throw new Error(data.error || "API 목록 조회 실패");
        }
        if (Array.isArray(data.data)) {
          setApiList(prepareApiManagementList(data.data));
        } else {
          setApiList([]);
        }
      } catch (error) {
        console.error(error);
        setApiList([]);
        setMessageTone("error");
        setMessage("오류: API 관리 DB(gwanselaw_list)를 불러오지 못했습니다.");
      }
    };

    const loadLawConfig = async () => {
      try {
        const response = await fetch("/api/law-config", {
          method: "GET",
          cache: "no-store",
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`환경변수 조회 실패: ${response.status} ${text}`);
        }
        const data = JSON.parse(text) as LawConfigResponse;
        if (!data.ok) {
          throw new Error(data.error || "환경변수 조회 실패");
        }
        setLawApiOc(data.lawApiOc ?? "");
        setLawJsonServiceUrl(data.lawJsonServiceUrl ?? "");
      } catch (error) {
        console.error(error);
        setLawApiOc("");
        setLawJsonServiceUrl("");
        setMessageTone("error");
        setMessage("오류: LAW 설정을 불러오지 못했습니다.");
      }
    };

    void loadApiListFromFile();
    void loadLawConfig();
  }, []);

  const selectedApi = useMemo(
    () => apiList.find((item) => item.id === selectedId) ?? null,
    [apiList, selectedId],
  );

  useEffect(() => {
    if (!selectedApi) return;
    setLawId(formatLawIdForDisplay(selectedApi.lawId ?? ""));
    setLawApiId("");
    setLastFetch(null);
    setMessage("");
    setMessageTone("info");
  }, [selectedApi]);

  const previewRequestUrl = useMemo(() => {
    if (!lawJsonServiceUrl.trim()) {
      return "";
    }
    const apiId = lawApiId.trim() || lawId.trim();
    const mstVal = mst.trim();
    if (!apiId && !mstVal) {
      return "";
    }
    try {
      const base = normalizePreviewBaseUrl(lawJsonServiceUrl);
      const url = new URL(base);
      if (lawApiOc.trim()) {
        url.searchParams.set("OC", maskOcValue(lawApiOc.trim()));
      }
      const params = buildEflawJosubSearchParams({
        lawApiId: apiId || undefined,
        mst: mstVal || undefined,
        efYd: efYd.trim() ? efYd : undefined,
        jo: jo.trim() ? jo : undefined,
        hang: hang.trim() || undefined,
        ho: ho.trim() || undefined,
        mok: mok.trim() || undefined,
      });
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
      return url.toString();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg || "호출 예정 URL 생성 중 오류가 발생했습니다.";
    }
  }, [
    lawJsonServiceUrl,
    lawApiOc,
    lawApiId,
    lawId,
    mst,
    efYd,
    jo,
    hang,
    ho,
    mok,
  ]);

  const effectiveLawApiId = lawApiId.trim() || lawId.trim() || undefined;

  const handleCallApi = async () => {
    if (!selectedApi) {
      setMessageTone("error");
      setMessage("왼쪽 목록에서 API를 선택해 주세요.");
      return;
    }
    const lid = normalizeLawIdForStorage(lawId.trim());
    if (!lid) {
      setMessageTone("error");
      setMessage("저장 법령 ID(laws.law_id)를 입력하세요.");
      return;
    }
    if (!lawApiOc.trim()) {
      setMessageTone("error");
      setMessage(".env.local에 LAW_API_OC 값이 없습니다.");
      return;
    }
    if (!lawJsonServiceUrl.trim()) {
      setMessageTone("error");
      setMessage(".env.local에 LAW_JSONSERVICE_URL 값이 없습니다.");
      return;
    }
    if (efYd.trim()) {
      const efDigits = efYd.replace(/\D/g, "");
      if (efDigits.length !== 8) {
        setMessageTone("error");
        setMessage("efYd를 입력하는 경우 YYYYMMDD 8자리여야 합니다.");
        return;
      }
    }

    setIsLoading(true);
    setProgressPercent(8);
    setProgressLabel("조항호목 Open API를 호출하는 중입니다...");
    setMessage("");
    setMessageTone("info");

    try {
      const fetchRes = await fetch("/api/law-eflaw-josub/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawApiId: effectiveLawApiId,
          mst: mst.trim() || undefined,
          efYd: efYd.trim() || undefined,
          jo: jo.trim() || undefined,
          hang: hang.trim() || undefined,
          ho: ho.trim() || undefined,
          mok: mok.trim() || undefined,
        }),
      });
      const fetchData = (await fetchRes.json()) as FetchJson;
      setLastFetch(fetchData);
      if (!fetchRes.ok || !fetchData.ok) {
        throw new Error(
          fetchData.error || `조회 실패 (${fetchData.status ?? fetchRes.status})`,
        );
      }

      setProgressPercent(48);
      setProgressLabel("law_chunks 저장 및 벡터 임베딩을 진행하는 중입니다...");

      const saveRes = await fetch("/api/law-eflaw-josub/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawId: lid,
          lawApiId: lawApiId.trim()
            ? normalizeLawIdForStorage(lawApiId.trim())
            : lid,
          mst: mst.trim() || undefined,
          efYd: efYd.trim() || undefined,
          jo: jo.trim() || undefined,
          hang: hang.trim() || undefined,
          ho: ho.trim() || undefined,
          mok: mok.trim() || undefined,
          embed: true,
          parsedJson: fetchData.parsedJson,
          rawText: fetchData.rawText,
          requestedUrl: fetchData.requestedUrl,
        }),
      });
      const saveData = (await saveRes.json()) as {
        ok: boolean;
        error?: string;
        chunkId?: number;
        embeddedCount?: number;
        sourceTitle?: string;
      };
      if (!saveRes.ok || !saveData.ok) {
        throw new Error(saveData.error || "저장 실패");
      }

      setProgressPercent(100);
      setProgressLabel("처리가 완료되었습니다.");
      setMessageTone("success");
      setMessage(
        [
          "정상적으로 처리되었습니다.",
          `청크 ID ${saveData.chunkId ?? "—"}, 임베딩 ${saveData.embeddedCount ?? 0}건`,
          saveData.sourceTitle?.trim()
            ? `발췌 제목: ${saveData.sourceTitle.trim()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
      persistLastReceivedAt(selectedApi.id);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
      setMessageTone("error");
      setMessage(`오류: ${errorMessage}`);
      setProgressLabel("");
    } finally {
      setIsLoading(false);
      setProgressPercent(0);
      setProgressLabel("");
    }
  };

  const handleReset = () => {
    setSelectedId("");
    setLawId("");
    setLawApiId("");
    setMst("");
    setEfYd("");
    setJo("");
    setHang("");
    setHo("");
    setMok("");
    setLastFetch(null);
    setMessage("");
    setMessageTone("info");
    setProgressPercent(0);
    setProgressLabel("");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CasPageHeader
              title="현행법령(시행일) 본문 조항호목 조회 API"
              className="min-w-0 flex-1"
            />
            <div className="text-sm text-slate-500">
              등록 건수:{" "}
              <span className="font-semibold">{apiList.length}</span>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-4 space-y-2">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#1e2f4f] transition-[width] duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-sm font-medium text-slate-700">
                {progressLabel || "처리 중입니다..."}
              </p>
            </div>
          ) : null}

          {message ? (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm whitespace-pre-line ${
                messageTone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : messageTone === "error"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {message}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:grid-cols-[1.6fr_1fr]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                API 목록
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
                API 관리에 등록된 항목입니다. 행을 클릭하면 저장 법령 ID가 채워집니다.
              </p>
            </div>

            <div className="h-[min(58vh,560px)] min-h-[260px] overflow-auto border-slate-100">
              <div className="min-w-[900px]">
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <colgroup>
                    <col className="min-w-0" style={{ width: "64%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col className="min-w-0" style={{ width: "21%" }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                    <tr>
                      <th
                        scope="col"
                        className="px-3 py-2.5 pl-4 text-xs font-semibold text-slate-700 sm:pl-5"
                      >
                        제공API명
                      </th>
                      <th
                        scope="col"
                        className="px-1.5 py-2.5 text-center text-xs font-semibold text-slate-600"
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
                        className="px-2 py-2.5 pr-4 text-right text-xs font-semibold text-slate-700 sm:pr-5"
                      >
                        조항호목 최종수신
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {apiList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-14 text-center text-sm text-slate-500"
                        >
                          API 관리 DB에 저장된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      apiList.map((item) => {
                        const isSelected = item.id === selectedId;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedId(item.id)}
                            className={`cursor-pointer align-middle transition-colors ${
                              isSelected
                                ? "bg-sky-50 ring-1 ring-inset ring-sky-200/80"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="min-w-0 max-w-0 p-0">
                              <div
                                className={`flex min-h-11 items-center border-l-4 py-1 pl-3 pr-2 sm:min-h-12 sm:pl-4 ${
                                  isSelected
                                    ? "border-sky-600"
                                    : "border-transparent"
                                }`}
                              >
                                <span
                                  className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-slate-900 sm:text-sm"
                                  title={item.apiName}
                                >
                                  {item.apiName}
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-1.5 py-2 text-center font-mono text-xs tabular-nums text-slate-800 sm:py-2.5 sm:text-sm">
                              <span title={item.lawId?.trim() || undefined}>
                                {item.lawId?.trim()
                                  ? formatLawIdForDisplay(item.lawId)
                                  : "—"}
                              </span>
                            </td>
                            <td className="px-0.5 py-2 text-center sm:py-2.5">
                              <ApiListFileTypeBadge type={item.fileType} />
                            </td>
                            <td className="min-w-0 max-w-0 whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums text-slate-500 sm:py-2.5 sm:pr-4 sm:text-[13px]">
                              <span
                                className="inline-block max-w-full truncate pl-1"
                                title={
                                  item.lastReceivedEflawJosub?.trim()
                                    ? formatLastReceivedForDisplay(
                                        item.lastReceivedEflawJosub,
                                      )
                                    : undefined
                                }
                              >
                                {item.lastReceivedEflawJosub?.trim()
                                  ? formatLastReceivedForDisplay(
                                      item.lastReceivedEflawJosub,
                                    )
                                  : "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">조항호목 조회</h2>
              <div className="flex flex-wrap gap-2">
                <CasPrimaryButton
                  type="button"
                  disabled={isLoading}
                  icon="play"
                  onClick={() => void handleCallApi()}
                >
                  API 호출
                </CasPrimaryButton>
                <CasResetButton
                  type="button"
                  onClick={handleReset}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="선택된 제공API명"
                value={selectedApi?.apiName ?? ""}
                disabled
                onChange={() => {}}
                placeholder="왼쪽 목록에서 선택"
              />
              <Field
                label="서비스 URL (JSON)"
                value={lawJsonServiceUrl}
                disabled
                onChange={() => {}}
                placeholder=".env.local의 LAW_JSONSERVICE_URL"
              />
              <Field
                label="사용자키값(OC)"
                value={lawApiOc}
                disabled
                onChange={() => {}}
                placeholder=".env.local의 LAW_API_OC"
              />
              <Field
                label="파일타입 (목록)"
                value={selectedApi?.fileType ?? ""}
                disabled
                onChange={() => {}}
                placeholder="API 관리 값"
              />
              <Field
                label="조항호목 API 최종수신"
                value={
                  selectedApi?.lastReceivedEflawJosub?.trim()
                    ? formatLastReceivedForDisplay(
                        selectedApi.lastReceivedEflawJosub,
                      )
                    : "—"
                }
                disabled
                onChange={() => {}}
                placeholder="이 화면에서 API 호출 성공 시 갱신"
              />
              <Field
                label="저장 법령 ID (laws.law_id)"
                value={lawId}
                onChange={setLawId}
                placeholder="예: 1556"
              />
              <Field
                label="법령 ID (API ID, 선택)"
                value={lawApiId}
                onChange={setLawApiId}
                placeholder="비우면 저장 법령 ID와 동일"
              />
              <Field
                label="MST (lsi_seq)"
                value={mst}
                onChange={setMst}
                placeholder="ID 대신 MST 사용 시"
              />
              <Field
                label="efYd (시행일자 YYYYMMDD)"
                value={efYd}
                onChange={setEfYd}
                placeholder="20250101"
              />
              <Field label="JO (조)" value={jo} onChange={setJo} placeholder="예: 9" />
              <Field label="HANG (항)" value={hang} onChange={setHang} placeholder="예: 1" />
              <Field label="HO (호)" value={ho} onChange={setHo} placeholder="예: 2" />
              <Field
                label="MOK (목)"
                value={mok}
                onChange={setMok}
                placeholder="가 / 나 / da 등"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-medium text-slate-700">
                호출 예정 URL
              </div>
              <div className="break-all rounded-lg bg-white px-3 py-3 text-sm text-slate-800">
                {previewRequestUrl ||
                  "법령 ID(또는 MST)를 입력하거나 목록에서 선택하면 호출 예정 URL이 표시됩니다."}
              </div>
            </div>

            {lastFetch?.requestedUrl ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500">실제 요청 URL</p>
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-2 text-xs text-slate-700">
                  {lastFetch.requestedUrl}
                </pre>
              </div>
            ) : null}

            {lastFetch?.rawText ? (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500">응답 본문 (일부)</p>
                <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 p-3 text-xs text-slate-800">
                  {lastFetch.rawText.slice(0, 12000)}
                  {lastFetch.rawText.length > 12000 ? "…" : ""}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApiListFileTypeBadge({ type }: { type: FileType }) {
  const styles: Record<FileType, string> = {
    XML: "bg-slate-100 text-slate-800 ring-slate-200/80",
    JSON: "bg-amber-50 text-amber-900 ring-amber-200/80",
    CSV: "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
  };
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset sm:text-xs ${styles[type]}`}
    >
      {type}
    </span>
  );
}

type FieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function Field({
  label,
  value,
  placeholder,
  disabled = false,
  onChange,
}: FieldProps) {
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

function maskOcValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }

  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`;
}
