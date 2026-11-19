"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasPrimaryButton, CasResetButton } from "@/app/components/search-action-buttons";
import { useEffect, useMemo, useState } from "react";
import {
  prepareApiManagementList,
  type ApiManagementFileType,
  type ApiManagementListItem,
} from "@/app/shared/api-management-list";
import { formatLawIdForDisplay } from "@/app/shared/law-id";
import {
  formatLastReceivedAt,
  formatLastReceivedForDisplay,
} from "@/app/shared/last-received-date";

type FileType = ApiManagementFileType;
type ApiConfig = ApiManagementListItem;

type LawConfigResponse = {
  ok: boolean;
  lawApiOc?: string;
  lawJsonServiceUrl?: string;
  error?: string;
};

type ResponseState = {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  requestedUrl: string;
  rawText: string;
  parsedJson: unknown | null;
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

function toLawSearchUrl(serviceUrl: string): string {
  return normalizePreviewBaseUrl(serviceUrl).replace(/lawService\.do/gi, "lawSearch.do");
}

/** 행정규칙 목록 조회 lawSearch.do · AdmRulSearch → admrul_search_runs / admrul_list_items + 임베딩 */
export default function LawAdmrulSearchPage() {
  const [apiList, setApiList] = useState<ApiConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [lawApiOc, setLawApiOc] = useState("");
  const [lawJsonServiceUrl, setLawJsonServiceUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [pageNum, setPageNum] = useState("1");
  const [displayNum, setDisplayNum] = useState("20");
  const [nw, setNw] = useState("");
  const [searchScope, setSearchScope] = useState("");
  const [org, setOrg] = useState("");
  const [knd, setKnd] = useState("");
  const [sort, setSort] = useState("");
  const [prmlYd, setPrmlYd] = useState("");
  const [modYd, setModYd] = useState("");
  const [nb, setNb] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info",
  );
  const [responseData, setResponseData] = useState<ResponseState | null>(null);

  const persistLastReceivedAt = (apiId: string) => {
    const receivedAt = formatLastReceivedAt(new Date());
    setApiList((prev) => {
      const next = prev.map((item) =>
        item.id === apiId ? { ...item, updatedAt: receivedAt } : item,
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
    setResponseData(null);
    setMessage("");
    setMessageTone("info");
  }, [selectedApi]);

  const proxyParams = useMemo(() => {
    const p: Record<string, string> = {
      target: "admrul",
      type: "JSON",
      page: pageNum.trim() || "1",
      display: displayNum.trim() || "20",
    };
    const q = searchQuery.trim();
    if (q) p.query = q;
    const d = searchDate.replace(/\D/g, "");
    if (d) p.date = d;
    if (nw.trim()) p.nw = nw.trim();
    if (searchScope.trim()) p.search = searchScope.trim();
    if (org.trim()) p.org = org.trim();
    if (knd.trim()) p.knd = knd.trim();
    if (sort.trim()) p.sort = sort.trim();
    if (prmlYd.trim()) p.prmlYd = prmlYd.trim();
    if (modYd.trim()) p.modYd = modYd.trim();
    if (nb.trim()) p.nb = nb.trim();
    return p;
  }, [
    searchQuery,
    searchDate,
    pageNum,
    displayNum,
    nw,
    searchScope,
    org,
    knd,
    sort,
    prmlYd,
    modYd,
    nb,
  ]);

  const previewRequestUrl = useMemo(() => {
    if (!lawJsonServiceUrl.trim()) return "";
    const hasCriterion =
      searchQuery.trim() ||
      searchDate.replace(/\D/g, "") ||
      prmlYd.trim() ||
      modYd.trim() ||
      nb.trim() ||
      org.trim() ||
      knd.trim();
    if (!hasCriterion) {
      return "";
    }
    try {
      const url = new URL(toLawSearchUrl(lawJsonServiceUrl));
      if (lawApiOc.trim()) {
        url.searchParams.set("OC", maskOcValue(lawApiOc.trim()));
      }
      for (const [k, v] of Object.entries(proxyParams)) {
        url.searchParams.set(k, v);
      }
      return url.toString();
    } catch {
      return "호출 예정 URL 생성 중 오류가 발생했습니다.";
    }
  }, [lawJsonServiceUrl, lawApiOc, proxyParams, searchQuery, searchDate, prmlYd, modYd, nb, org, knd]);

  const handleCallApi = async () => {
    if (!selectedApi) {
      setMessageTone("error");
      setMessage("왼쪽 목록에서 API를 선택해 주세요.");
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
    const hasCriterion =
      searchQuery.trim() ||
      searchDate.replace(/\D/g, "") ||
      prmlYd.trim() ||
      modYd.trim() ||
      nb.trim() ||
      org.trim() ||
      knd.trim();
    if (!hasCriterion) {
      setMessageTone("error");
      setMessage(
        "검색어(query)·발령일자(date)·기간(prmlYd/modYd)·발령번호(nb)·부처(org)·종류(knd) 중 하나 이상을 입력하세요.",
      );
      return;
    }

    setIsLoading(true);
    setProgressPercent(8);
    setProgressLabel("행정규칙 목록 API를 호출하는 중입니다...");
    setMessage("");
    setMessageTone("info");
    setResponseData(null);

    try {
      const response = await fetch("/api/law-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useLawSearchEndpoint: true,
          params: proxyParams,
        }),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status} ${text}`);
      }

      const data = JSON.parse(text) as ResponseState;
      setResponseData(data);

      if (!data.ok) {
        setMessageTone("error");
        setMessage("호출은 완료되었으나 HTTP/응답 상태를 확인해 주세요.");
        return;
      }

      setProgressPercent(38);
      setProgressLabel("Supabase에 목록을 저장하고 임베딩하는 중입니다...");

      const saveRes = await fetch("/api/law-admrul-search/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedJson: data.parsedJson ?? undefined,
          rawText: data.parsedJson ? undefined : data.rawText,
          requestedUrl: data.requestedUrl,
          embed: true,
          searchContext: {
            query: searchQuery,
            date: searchDate.replace(/\D/g, ""),
            page: pageNum,
            display: displayNum,
            nw,
            search: searchScope,
            org,
            knd,
            sort,
            prmlYd,
            modYd,
            nb,
          },
        }),
      });
      const saveData = (await saveRes.json()) as {
        ok: boolean;
        error?: string;
        searchRunId?: number;
        itemCount?: number;
        embeddedCount?: number;
        totalCnt?: number;
      };
      if (!saveRes.ok || !saveData.ok) {
        throw new Error(saveData.error || "목록 저장·임베딩 실패");
      }

      setProgressPercent(100);
      setProgressLabel("처리가 완료되었습니다.");
      setMessageTone("success");
      setMessage(
        [
          "정상적으로 처리되었습니다.",
          `검색 실행 ID ${saveData.searchRunId ?? "—"}, 응답 totalCnt ${saveData.totalCnt ?? "—"}, 저장 행 ${saveData.itemCount ?? 0}건, 임베딩 ${saveData.embeddedCount ?? 0}건`,
        ].join("\n"),
      );
      persistLastReceivedAt(selectedApi.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
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
    setSearchQuery("");
    setSearchDate("");
    setPageNum("1");
    setDisplayNum("20");
    setNw("");
    setSearchScope("");
    setOrg("");
    setKnd("");
    setSort("");
    setPrmlYd("");
    setModYd("");
    setNb("");
    setResponseData(null);
    setMessage("");
    setMessageTone("info");
    setProgressPercent(0);
    setProgressLabel("");
  };

  const jsonPreview =
    responseData?.parsedJson != null
      ? JSON.stringify(responseData.parsedJson, null, 2)
      : responseData?.rawText?.trim() ?? "";

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CasPageHeader title="행정규칙 목록 조회 API" className="min-w-0 flex-1" />
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
                최종수신일 갱신용으로 API 관리 항목을 선택합니다. 검색 조건은 오른쪽 폼에
                입력합니다.
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
                        ID
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
                        최종수신일
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
                                  item.updatedAt?.trim()
                                    ? formatLastReceivedForDisplay(item.updatedAt)
                                    : undefined
                                }
                              >
                                {item.updatedAt?.trim()
                                  ? formatLastReceivedForDisplay(item.updatedAt)
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
              <h2 className="text-lg font-semibold text-slate-900">검색 조건</h2>
              <div className="flex flex-wrap gap-2">
                <CasPrimaryButton
                  type="button"
                  onClick={() => void handleCallApi()}
                  disabled={isLoading}
                  icon="play"
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
                label="목록 URL 베이스 (JSON)"
                value={toLawSearchUrl(lawJsonServiceUrl || "")}
                disabled
                onChange={() => {}}
                placeholder="lawService URL이 lawSearch.do로 치환됩니다"
              />
              <Field
                label="사용자키값(OC)"
                value={lawApiOc}
                disabled
                onChange={() => {}}
                placeholder=".env.local의 LAW_API_OC"
              />
              <Field
                label="최종수신일"
                value={
                  selectedApi?.updatedAt?.trim()
                    ? formatLastReceivedForDisplay(selectedApi.updatedAt)
                    : "—"
                }
                disabled
                onChange={() => {}}
                placeholder="API 호출 성공 시 갱신"
              />
              <Field
                label="검색어 (query)"
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="예: 자동차"
              />
              <Field
                label="발령일자 (date, YYYYMMDD)"
                value={searchDate}
                onChange={setSearchDate}
                placeholder="예: 20250501"
              />
              <Field label="페이지 (page)" value={pageNum} onChange={setPageNum} placeholder="1" />
              <Field
                label="페이지당 건수 (display)"
                value={displayNum}
                onChange={setDisplayNum}
                placeholder="20"
              />
              <Field
                label="nw (1:현행 2:연혁)"
                value={nw}
                onChange={setNw}
                placeholder="선택"
              />
              <Field
                label="search (1:명칭 2:본문)"
                value={searchScope}
                onChange={setSearchScope}
                placeholder="선택"
              />
              <Field label="org (부처코드)" value={org} onChange={setOrg} placeholder="선택" />
              <Field label="knd (규칙종류)" value={knd} onChange={setKnd} placeholder="선택" />
              <Field label="sort" value={sort} onChange={setSort} placeholder="lasc, ddes …" />
              <Field
                label="prmlYd (발령기간)"
                value={prmlYd}
                onChange={setPrmlYd}
                placeholder="YYYYMMDD~YYYYMMDD"
              />
              <Field
                label="modYd (수정기간)"
                value={modYd}
                onChange={setModYd}
                placeholder="YYYYMMDD~YYYYMMDD"
              />
              <Field label="nb (발령번호)" value={nb} onChange={setNb} placeholder="선택" />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-medium text-slate-700">
                호출 예정 URL
              </div>
              <div className="break-all rounded-lg bg-white px-3 py-3 text-sm text-slate-800">
                {previewRequestUrl ||
                  "검색어·발령일자·기간 등 조건을 입력하면 표시됩니다."}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">호출 결과</h2>

          {!responseData ? (
            <div className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
              아직 호출 결과가 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoBox
                  label="상태코드"
                  value={`${responseData.status} ${responseData.statusText}`}
                />
                <InfoBox
                  label="Content-Type"
                  value={responseData.contentType || "알 수 없음"}
                />
                <InfoBox
                  label="호출 결과"
                  value={responseData.ok ? "성공" : "실패"}
                />
                <InfoBox label="실제 요청 URL" value={responseData.requestedUrl} />
              </div>

              <div
                className={`rounded-xl p-6 text-sm ${
                  responseData.ok
                    ? "border border-emerald-100 bg-emerald-50 text-emerald-900"
                    : "bg-slate-50 text-slate-500"
                }`}
              >
                {responseData.ok
                  ? "정상적으로 처리되었습니다."
                  : "호출은 완료되었으나 결과를 확인해 주세요."}
              </div>

              {jsonPreview ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    응답 본문 (JSON)
                  </p>
                  <pre className="max-h-[min(70vh,560px)] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
                    {jsonPreview.length > 120000
                      ? `${jsonPreview.slice(0, 120000)}\n… (생략)`
                      : jsonPreview}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <div className="break-all text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}

function maskOcValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "*".repeat(trimmed.length);
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`;
}
