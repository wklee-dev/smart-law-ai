"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasResetButton, casActionFillClass } from "@/app/components/search-action-buttons";
import {
  SlIconBatch,
  SlIconCollect,
  SlIconImport,
  SlIconPlay,
} from "@/app/components/sl-icons";
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  filterApiCallList,
  prepareApiManagementList,
  type ApiManagementFileType,
  type ApiManagementListItem,
} from "../shared/api-management-list";
import {
  formatLawIdForDisplay,
  lawIdForStatuteOpenApi,
} from "../shared/law-id";
import {
  formatLastReceivedAt,
  formatLastReceivedForDisplay,
} from "../shared/last-received-date";

type FileType = ApiManagementFileType;
type ApiConfig = ApiManagementListItem;

type ResponseState = {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  requestedUrl: string;
  rawText: string;
  parsedJson: unknown | null;
};

type LawConfigResponse = {
  ok: boolean;
  lawApiOc?: string;
  lawXmlServiceUrl?: string;
  lawJsonServiceUrl?: string;
  error?: string;
};

type SearchMeta = {
  target: string;
  keyword: string;
  section: string;
  totalCnt: number;
  page: number;
  numOfRows: number;
  resultCode: string;
  resultMsg: string;
  requestedUrl: string;
};

type LawListItem = {
  itemNo: number;
  lawSerialNo: string;
  historyStatusCode: string;
  lawNameKr: string;
  lawNameShort: string;
  lawId: string;
  promulgationDate: string;
  promulgationNo: string;
  revisionTypeName: string;
  ministryCode: string;
  ministryName: string;
  lawTypeName: string;
  enforcementDate: string;
  detailLink: string;
};

type ParsedLawSearch = {
  meta: SearchMeta;
  items: LawListItem[];
};

type OpenlawStatusRow = {
  gwanselawId: string;
  lawId: string;
  inLawList: boolean;
  bodySaved: boolean;
  lawListName: string;
  enfDate: string;
};

export type ApiCallViewProps = {
  lawDetailSaveUrl: string;
  lawSearchSaveUrl: string;
  /** false면 벡터 임베딩(law_chunks) 호출을 하지 않습니다 */
  enableVectorEmbedding: boolean;
  storageHint?: string;
};

function PanelActionButton({
  icon: Icon,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: typeof SlIconImport;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ${className}`}
      {...props}
    >
      <Icon />
      {children}
    </button>
  );
}

/** 미사용(일반법령 API) 버튼 — 활성 네이비와 구분되는 연한 톤 */
const unusedPanelActionClass =
  "border border-dashed border-slate-300 bg-slate-50 font-normal text-slate-400 shadow-none hover:bg-slate-100 hover:text-slate-500";
const unusedPanelActionDisabledClass =
  "cursor-not-allowed border border-dashed border-slate-200 bg-slate-50 font-normal text-slate-300 shadow-none";

export function ApiCallView({
  lawDetailSaveUrl,
  lawSearchSaveUrl,
  enableVectorEmbedding,
  storageHint = "Supabase",
}: ApiCallViewProps) {
  const [apiList, setApiList] = useState<ApiConfig[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [lawApiOc, setLawApiOc] = useState("");
  const [lawXmlServiceUrl, setLawXmlServiceUrl] = useState("");
  const [lawJsonServiceUrl, setLawJsonServiceUrl] = useState("");
  const [lawId, setLawId] = useState("");
  const [query, setQuery] = useState("*");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">(
    "info",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchCalling, setIsBatchCalling] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [responseData, setResponseData] = useState<ResponseState | null>(null);
  const [statusByGwanselawId, setStatusByGwanselawId] = useState<
    Record<string, OpenlawStatusRow>
  >({});
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isPythonFetching, setIsPythonFetching] = useState(false);
  const [shutdownAfterComplete, setShutdownAfterComplete] = useState(false);
  const [listKeyword, setListKeyword] = useState("");

  const showProgressBar =
    isLoading ||
    isBatchCalling ||
    isPythonFetching ||
    (messageTone === "success" && progressPercent >= 100);

  const batchPendingItems = useMemo(
    () =>
      apiList.filter(
        (item) =>
          item.lawId.trim() !== "" &&
          !item.updatedAt.trim() &&
          item.fileType === "JSON" &&
          !item.apiName.includes("타법폐지"),
      ),
    [apiList],
  );

  /** 본문(openlaw) 미수집 JSON 항목 — 일괄가져오기 대상 */
  const bodyMissingItems = useMemo(
    () =>
      apiList.filter((item) => {
        if (item.fileType !== "JSON") return false;
        if (!item.lawId.trim()) return false;
        if (item.apiName.includes("타법폐지")) return false;
        const status = statusByGwanselawId[item.id];
        return !(status?.bodySaved ?? false);
      }),
    [apiList, statusByGwanselawId],
  );

  /** API 목록 전체 — 본문 Y / — (테이블 본문 열과 동일) */
  const bodyProcessedCount = useMemo(
    () =>
      apiList.filter(
        (item) => statusByGwanselawId[item.id]?.bodySaved ?? false,
      ).length,
    [apiList, statusByGwanselawId],
  );

  const bodyUnprocessedCount = apiList.length - bodyProcessedCount;

  const bodyProcessPercent =
    apiList.length > 0
      ? Math.round((bodyProcessedCount / apiList.length) * 100)
      : 0;

  /** API 목록 — 법령명(제공API명) 가나다순 + 검색 */
  const displayApiList = useMemo(() => {
    const sorted = [...apiList].sort((a, b) =>
      (a.apiName ?? "").localeCompare(b.apiName ?? "", "ko"),
    );
    const q = listKeyword.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((item) => {
      const apiName = (item.apiName ?? "").toLowerCase();
      const shortName = (item.lawShortName ?? "").toLowerCase();
      const lawId = item.lawId?.trim() ?? "";
      return (
        apiName.includes(q) ||
        shortName.includes(q) ||
        lawId.toLowerCase().includes(q) ||
        formatLawIdForDisplay(lawId).includes(q)
      );
    });
  }, [apiList, listKeyword]);

  const saveApiListToFile = async (next: ApiConfig[]) => {
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
  };

  const applyLastReceivedAt = (list: ApiConfig[], apiId: string) => {
    const receivedAt = formatLastReceivedAt(new Date());
    return list.map((item) =>
      item.id === apiId ? { ...item, updatedAt: receivedAt } : item,
    );
  };

  const persistLastReceivedAt = (apiId: string) => {
    setApiList((prev) => {
      const next = applyLastReceivedAt(prev, apiId);
      void saveApiListToFile(next).catch((e) => console.error(e));
      return next;
    });
  };

  const runLawApiCallForItem = async (
    item: ApiConfig,
    options: { embedChunks: boolean; queryOverride?: string },
  ): Promise<{ ok: true; summary: string } | { ok: false; error: string }> => {
    if (!lawApiOc.trim()) {
      return { ok: false, error: ".env.local에 LAW_API_OC 값이 없습니다." };
    }

    const serviceUrl =
      item.fileType === "JSON" ? lawJsonServiceUrl : lawXmlServiceUrl;

    if (!serviceUrl.trim()) {
      return {
        ok: false,
        error:
          item.fileType === "JSON"
            ? ".env.local에 LAW_JSONSERVICE_URL 값이 없습니다."
            : ".env.local에 LAW_XMLSERVICE_URL 값이 없습니다.",
      };
    }

    if (item.fileType === "JSON" && !item.lawId.trim()) {
      return { ok: false, error: "법령ID가 없습니다." };
    }

    const idParam = item.lawId.trim()
      ? lawIdForStatuteOpenApi(item.lawId.trim())
      : "";
    const queryParam = options.queryOverride?.trim() ?? query.trim();

    const response = await fetch("/api/law-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        params: {
          target: "eflaw",
          ...(idParam
            ? { ID: idParam }
            : queryParam
              ? { query: queryParam }
              : {}),
          type: item.fileType,
        },
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      return { ok: false, error: `API 호출 실패: ${response.status} ${text}` };
    }

    const data = JSON.parse(text) as ResponseState;

    if (item.fileType === "JSON" && data.parsedJson) {
      const saveResponse = await fetch(lawDetailSaveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawJson: data.parsedJson }),
      });

      const saveText = await saveResponse.text();

      if (!saveResponse.ok) {
        return {
          ok: false,
          error: `상세 저장 실패: ${saveResponse.status} ${saveText}`,
        };
      }

      const saveResult = JSON.parse(saveText) as {
        ok: boolean;
        lawId?: string;
        articleCount?: number;
        chunkCount?: number;
        error?: string;
      };

      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error || "상세 저장 실패" };
      }

      let totalEmbedded = 0;
      const chunkTotal = saveResult.chunkCount ?? 0;

      if (enableVectorEmbedding && options.embedChunks && chunkTotal > 0 && saveResult.lawId) {
        const embedLimit = 50;

        for (;;) {
          const embedResponse = await fetch("/api/law-chunks/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lawId: saveResult.lawId,
              limit: embedLimit,
            }),
          });

          const embedText = await embedResponse.text();

          if (!embedResponse.ok) {
            return {
              ok: false,
              error: `임베딩 저장 실패: ${embedResponse.status} ${embedText}`,
            };
          }

          const embedResult = JSON.parse(embedText) as {
            ok: boolean;
            embeddedCount?: number;
            error?: string;
          };

          if (!embedResult.ok) {
            return { ok: false, error: embedResult.error || "임베딩 저장 실패" };
          }

          const n = embedResult.embeddedCount ?? 0;
          totalEmbedded += n;
          if (n === 0) break;
        }
      }

      const summary =
        chunkTotal > 0 &&
        enableVectorEmbedding &&
        options.embedChunks &&
        totalEmbedded > 0
          ? `법령ID ${saveResult.lawId}, 조문 ${saveResult.articleCount ?? 0}건, 청크 ${chunkTotal}건, 벡터 ${totalEmbedded}건`
          : `법령ID ${saveResult.lawId}, 조문 ${saveResult.articleCount ?? 0}건, 청크 ${chunkTotal}건`;

      return { ok: true, summary };
    }

    if (item.fileType === "XML" && data.rawText) {
      const parsed = parseLawSearchXml(data.rawText, data.requestedUrl);

      const saveResponse = await fetch(lawSearchSaveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchMeta: parsed.meta,
          items: parsed.items,
          rawXml: data.rawText,
        }),
      });

      const saveText = await saveResponse.text();

      if (!saveResponse.ok) {
        return {
          ok: false,
          error: `검색 결과 저장 실패: ${saveResponse.status} ${saveText}`,
        };
      }

      const saveResult = JSON.parse(saveText) as {
        ok: boolean;
        savedCount?: number;
        searchHistoryId?: number;
        error?: string;
      };

      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error || "검색 결과 저장 실패" };
      }

      return {
        ok: true,
        summary: `검색이력 ID ${saveResult.searchHistoryId}, 법령 ${saveResult.savedCount ?? 0}건`,
      };
    }

    return { ok: true, summary: "API 호출 완료" };
  };

  const markCallComplete = (
    label: string,
    successMessage: string,
  ) => {
    setProgressPercent(100);
    setProgressLabel(label);
    setMessageTone("success");
    setMessage(successMessage);
  };

  const schedulePcShutdownIfEnabled = async (
    baseMessage: string,
  ) => {
    if (!shutdownAfterComplete) {
      setMessageTone("success");
      setMessage(baseMessage);
      return;
    }

    const confirmed = window.confirm(
      "일괄 작업이 끝났습니다.\n\n60초 후 프로그램이 종료되고 PC 전원이 꺼집니다.\n계속할까요?\n(취소하면 종료를 예약하지 않습니다.\n예약 후 취소: 명령 프롬프트에서 shutdown /a)",
    );
    if (!confirmed) {
      setMessageTone("success");
      setMessage(baseMessage);
      return;
    }

    try {
      const response = await fetch("/api/system/schedule-shutdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: "SHUTDOWN_PC",
          delaySeconds: 60,
        }),
      });
      const text = await response.text();
      let data: { ok?: boolean; error?: string; cancelHint?: string } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        data = {};
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `PC 종료 예약 실패: ${response.status}`);
      }
      setMessageTone("success");
      setMessage(
        `${baseMessage}\n\n60초 후 프로그램·PC가 종료되도록 예약되었습니다.\n${data.cancelHint ?? "취소: shutdown /a"}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "PC 종료 예약에 실패했습니다.";
      setMessageTone("error");
      setMessage(`${baseMessage}\n\nPC 종료 예약 실패: ${errorMessage}`);
    }
  };

  useEffect(() => {
    const loadApiListFromFile = async () => {
      try {
        const response = await fetch(
          "/api/api-management/save?syncLawCrawlTargets=1",
          {
          method: "GET",
          cache: "no-store",
          },
        );

        const text = await response.text();

        if (!response.ok) {
          throw new Error(`API 목록 API 호출  실패: ${response.status} ${text}`);
        }

        const data = JSON.parse(text) as {
          ok: boolean;
          data?: Partial<ApiConfig>[];
          error?: string;
          deduped?: boolean;
          message?: string;
          crawlSync?: {
            added: number;
            updated: number;
            skippedExisting: number;
            skippedNoLawId: number;
            addedNames: string[];
            updatedNames: string[];
          };
          openlawSync?: {
            added: number;
            updated: number;
            skippedExisting: number;
            skippedNoLawId: number;
            addedNames: string[];
            updatedNames: string[];
          };
          clipExcelSync?: {
            excelRows: number;
            excelUnique: number;
            added: number;
            updated: number;
            gwanselawTotal: number;
            addedNames: string[];
          };
        };

        if (!data.ok) {
          throw new Error(data.error || "API 목록 API 호출  실패");
        }

        if (Array.isArray(data.data)) {
          setApiList(filterApiCallList(prepareApiManagementList(data.data)));
        } else {
          setApiList([]);
        }

        const syncParts: string[] = [];
        if (data.clipExcelSync) {
          const cx = data.clipExcelSync;
          syncParts.push(
            `일반법령리스트v5 ${cx.excelRows}행 반영(고유 ${cx.excelUnique}·메뉴중복 별도 행)`,
          );
          if (cx.added > 0) {
            syncParts.push(`엑셀 분류 행 ${cx.added}건 추가`);
          }
        }
        if (data.crawlSync?.added) {
          syncParts.push(`크롤링대상 Excel ${data.crawlSync.added}건 추가`);
        }
        if (data.crawlSync?.updated) {
          syncParts.push(`법령ID Excel 기준 ${data.crawlSync.updated}건 갱신`);
        }
        if (data.openlawSync?.added) {
          syncParts.push(
            `OPEN API 목록 ${data.openlawSync.added}건 반영`,
          );
        }
        if (data.openlawSync?.updated) {
          syncParts.push(
            `OPEN API 기준 ${data.openlawSync.updated}건 갱신`,
          );
        }
        if (syncParts.length > 0) {
          setMessageTone("info");
          setMessage(
            `${syncParts.join(", ")}했습니다.\n「일괄가져오기」 또는 「선택한 법령수집」으로 수집할 수 있습니다.`,
          );
        } else if (data.deduped && data.message) {
          setMessageTone("info");
          setMessage(data.message);
        }
      } catch (error) {
        console.error("API 목록 파일 불러오기 오류:", error);
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
        setLawXmlServiceUrl(data.lawXmlServiceUrl ?? "");
        setLawJsonServiceUrl(data.lawJsonServiceUrl ?? "");
      } catch (error) {
        console.error("LAW 설정 조회 오류:", error);
        setLawApiOc("");
        setLawXmlServiceUrl("");
        setLawJsonServiceUrl("");
        setMessageTone("error");
        setMessage("오류: 환경변수 설정을 불러오지 못했습니다.");
      }
    };

    loadApiListFromFile();
    loadLawConfig();
    void refreshOpenlawStatus();
  }, []);

  const selectedApi = useMemo(
    () => apiList.find((item) => item.id === selectedId) ?? null,
    [apiList, selectedId],
  );

  useEffect(() => {
    if (!selectedApi) return;
    setLawId(formatLawIdForDisplay(selectedApi.lawId ?? ""));
    setResponseData(null);
    setMessage("");
    setMessageTone("info");
  }, [selectedApi]);

  const previewRequestUrl = useMemo(() => {
    if (!selectedApi) return "";

    const serviceUrl =
      selectedApi.fileType === "JSON" ? lawJsonServiceUrl : lawXmlServiceUrl;

    if (!serviceUrl.trim()) return "";

    try {
      const url = new URL(serviceUrl);

      if (lawApiOc.trim()) {
        url.searchParams.set("OC", maskOcValue(lawApiOc.trim()));
      }

      url.searchParams.set("target", "eflaw");

      if (lawId.trim()) {
        url.searchParams.set("ID", lawIdForStatuteOpenApi(lawId.trim()));
      } else if (query.trim()) {
        url.searchParams.set("query", query.trim());
      }

      url.searchParams.set("type", selectedApi.fileType);

      return url.toString();
    } catch {
      return "호출 예정 URL 생성 중 오류가 발생했습니다.";
    }
  }, [selectedApi, lawXmlServiceUrl, lawJsonServiceUrl, lawApiOc, query, lawId]);

  const handleCallApi = async () => {
    let api = selectedApi;
    if (!api && checkedIds.size === 1) {
      const onlyId = [...checkedIds][0];
      api = apiList.find((item) => item.id === onlyId) ?? null;
      if (api) setSelectedId(api.id);
    }

    if (!api) {
      alert(
        "왼쪽 목록에서 행을 클릭해 API를 선택해 주세요.\n(체크만으로는 호출 조건에 반영되지 않았습니다. 이제 체크 시 자동 선택됩니다.)",
      );
      return;
    }

    if (!lawApiOc.trim()) {
      alert(".env.local에 LAW_API_OC 값이 없습니다.");
      return;
    }

    const serviceUrl =
      api.fileType === "JSON" ? lawJsonServiceUrl : lawXmlServiceUrl;

    if (!serviceUrl.trim()) {
      alert(
        api.fileType === "JSON"
          ? ".env.local에 LAW_JSONSERVICE_URL 값이 없습니다."
          : ".env.local에 LAW_XMLSERVICE_URL 값이 없습니다.",
      );
      return;
    }

    const effectiveLawId = (lawId.trim() || api.lawId || "").trim();
    if (api.fileType === "JSON" && !effectiveLawId) {
      alert(
        `「${api.apiName}」은(는) 법령ID가 없어 JSON Open API를 호출할 수 없습니다.\n\n` +
          "법령ID가 있는 다른 행(예: 11540)을 선택하거나, API 관리에서 법령ID를 등록한 뒤 다시 시도해 주세요.",
      );
      return;
    }

    setIsLoading(true);
    setProgressPercent(8);
    setProgressLabel("법령 API를 호출하는 중입니다...");
    setMessage("");
    setMessageTone("info");
    setResponseData(null);

    let completedOk = false;

    try {
      const itemForCall: ApiConfig = {
        ...api,
        lawId: effectiveLawId || api.lawId,
      };

      setProgressPercent(42);
      setProgressLabel("응답을 받았습니다.");

      let embedChunks = false;
      if (api.fileType === "JSON") {
        const probe = await fetch("/api/law-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            params: {
              target: "eflaw",
              ...(effectiveLawId
                ? { ID: lawIdForStatuteOpenApi(effectiveLawId) }
                : query.trim()
                  ? { query: query.trim() }
                  : {}),
              type: api.fileType,
            },
          }),
        });
        const probeText = await probe.text();
        if (!probe.ok) {
          throw new Error(`API 호출 실패: ${probe.status} ${probeText}`);
        }
        const probeData = JSON.parse(probeText) as ResponseState;
        setResponseData(probeData);

        setProgressPercent(55);
        setProgressLabel("상세 JSON을 저장하는 중입니다...");

        const saveResponse = await fetch(lawDetailSaveUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawJson: probeData.parsedJson }),
        });
        const saveText = await saveResponse.text();
        if (!saveResponse.ok) {
          throw new Error(`상세 저장 실패: ${saveResponse.status} ${saveText}`);
        }
        const saveResult = JSON.parse(saveText) as {
          ok: boolean;
          lawId?: string;
          articleCount?: number;
          chunkCount?: number;
          error?: string;
        };
        if (!saveResult.ok) {
          throw new Error(saveResult.error || "상세 저장 실패");
        }

        const chunkTotal = saveResult.chunkCount ?? 0;
        if (
          enableVectorEmbedding &&
          chunkTotal > 0 &&
          saveResult.lawId
        ) {
          embedChunks = window.confirm("벡터화를 진행하시겠습니까?");
        }

        let totalEmbedded = 0;
        if (
          enableVectorEmbedding &&
          embedChunks &&
          chunkTotal > 0 &&
          saveResult.lawId
        ) {
          setProgressPercent(68);
          setProgressLabel("law_chunks 벡터 임베딩을 생성하는 중입니다...");
          const embedLimit = 50;
          for (;;) {
            const embedResponse = await fetch("/api/law-chunks/embed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lawId: saveResult.lawId,
                limit: embedLimit,
              }),
            });
            const embedText = await embedResponse.text();
            if (!embedResponse.ok) {
              throw new Error(
                `임베딩 저장 실패: ${embedResponse.status} ${embedText}`,
              );
            }
            const embedResult = JSON.parse(embedText) as {
              ok: boolean;
              embeddedCount?: number;
              error?: string;
            };
            if (!embedResult.ok) {
              throw new Error(embedResult.error || "임베딩 저장 실패");
            }
            const n = embedResult.embeddedCount ?? 0;
            totalEmbedded += n;
            if (n === 0) break;
            setProgressPercent(
              Math.min(95, 68 + Math.floor((totalEmbedded / chunkTotal) * 27)),
            );
            setProgressLabel(
              `law_chunks 벡터 임베딩 저장 중... (${totalEmbedded}건 처리)`,
            );
          }
        } else if (enableVectorEmbedding && chunkTotal > 0) {
          setProgressPercent(85);
          setProgressLabel("벡터 임베딩을 건너뜁니다...");
        }

        markCallComplete(
          "처리가 완료되었습니다.",
          enableVectorEmbedding && chunkTotal > 0
            ? totalEmbedded > 0
              ? `정상적으로 처리되었습니다.\n조회 및 저장 완료: 법령ID ${saveResult.lawId}, 조문 ${saveResult.articleCount ?? 0}건, 청크 ${chunkTotal}건 저장, 벡터 임베딩 ${totalEmbedded}건 반영`
              : `정상적으로 처리되었습니다.\n조회 및 저장 완료: 법령ID ${saveResult.lawId}, 조문 ${saveResult.articleCount ?? 0}건, 청크 ${chunkTotal}건 저장\n※ 벡터화는 생략되었습니다.`
            : `정상적으로 처리되었습니다.\n조회 및 저장 완료(${storageHint}): 법령ID ${saveResult.lawId}, 조문 ${saveResult.articleCount ?? 0}건`,
        );
        persistLastReceivedAt(api.id);
        completedOk = true;
      } else {
        const result = await runLawApiCallForItem(itemForCall, {
          embedChunks: false,
          queryOverride: query,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        markCallComplete(
          "처리가 완료되었습니다.",
          `정상적으로 처리되었습니다.\n조회 및 저장 완료: ${result.summary}`,
        );
        persistLastReceivedAt(api.id);
        completedOk = true;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setMessageTone("error");
      setMessage(`오류: ${errorMessage}`);
      setProgressPercent(0);
      setProgressLabel("");
    } finally {
      setIsLoading(false);
      if (!completedOk) {
        setProgressPercent(0);
        setProgressLabel("");
      }
    }
  };

  const handleReset = () => {
    setSelectedId("");
    setLawId("");
    setQuery("*");
    setMessage("");
    setMessageTone("info");
    setProgressPercent(0);
    setProgressLabel("");
    setResponseData(null);
  };

  const handleBatchCallApi = async () => {
    const targets = batchPendingItems;
    if (targets.length === 0) {
      alert(
        "법령ID가 있고 최종수신일이 없는 DB 항목이 없습니다. (제공API명에「타법폐지」가 포함된 항목은 일괄 호출 대상에서 제외됩니다.)",
      );
      return;
    }

    if (!lawApiOc.trim()) {
      alert(".env.local에 LAW_API_OC 값이 없습니다.");
      return;
    }

    if (!lawJsonServiceUrl.trim()) {
      alert(".env.local에 LAW_JSONSERVICE_URL 값이 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `법령ID 있음 · 최종수신일 없음: ${targets.length}건\n(제공API명에「타법폐지」포함 항목은 제외)\n\n일괄 API 호출 후 저장합니다. 벡터화는 하지 않습니다. 계속할까요?`,
    );
    if (!confirmed) return;

    setIsBatchCalling(true);
    setMessage("");
    setMessageTone("info");
    setResponseData(null);
    setProgressPercent(4);
    setProgressLabel(`일괄 API 호출 준비 중… (0/${targets.length})`);

    let successCount = 0;
    let failCount = 0;
    const failures: string[] = [];
    let workingList = apiList;

    try {
      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setProgressPercent(Math.min(95, 5 + Math.floor((i / targets.length) * 90)));
        setProgressLabel(
          `일괄 API 호출 중… (${i + 1}/${targets.length}) ${item.apiName}`,
        );

        const result = await runLawApiCallForItem(item, { embedChunks: false });

        if (!result.ok) {
          failCount++;
          failures.push(`· ${item.apiName}: ${result.error}`);
          continue;
        }

        successCount++;
        workingList = applyLastReceivedAt(workingList, item.id);
        setApiList(workingList);
        await saveApiListToFile(workingList);

        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }

      markCallComplete(
        "일괄 처리가 완료되었습니다.",
        `일괄 API 호출 완료 — 성공 ${successCount}건, 실패 ${failCount}건 (대상 ${targets.length}건)\n※ 벡터화는 수행하지 않았습니다.${
          failures.length > 0
            ? `\n\n실패 ${Math.min(failures.length, 5)}건:\n${failures.slice(0, 5).join("\n")}`
            : ""
        }`,
      );
      await schedulePcShutdownIfEnabled(
        `일괄 API 호출 완료 — 성공 ${successCount}건, 실패 ${failCount}건 (대상 ${targets.length}건)\n※ 벡터화는 수행하지 않았습니다.${
          failures.length > 0
            ? `\n\n실패 ${Math.min(failures.length, 5)}건:\n${failures.slice(0, 5).join("\n")}`
            : ""
        }`,
      );

      if (failures.length > 0) {
        console.warn("일괄 API 호출 실패 목록:\n", failures.join("\n"));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setMessageTone("error");
      setMessage(`오류: ${errorMessage}`);
      setProgressPercent(0);
      setProgressLabel("");
    } finally {
      setIsBatchCalling(false);
    }
  };

  const isBusy = isLoading || isBatchCalling || isPythonFetching;

  const pythonFetchTargets = useMemo(
    () =>
      apiList.filter((item) => {
        if (!checkedIds.has(item.id)) return false;
        const lawId = item.lawId?.trim();
        if (!lawId) return false;
        if (item.fileType !== "JSON") return false;
        if (item.apiName.includes("타법폐지")) return false;
        return true;
      }),
    [apiList, checkedIds],
  );

  const refreshOpenlawStatus = async () => {
    try {
      const response = await fetch("/api/openlawapi/status", {
        method: "GET",
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`상태 조회 실패: ${response.status} ${text}`);
      }
      const data = JSON.parse(text) as {
        ok: boolean;
        items?: OpenlawStatusRow[];
        error?: string;
      };
      if (!data.ok || !Array.isArray(data.items)) {
        throw new Error(data.error || "상태 조회 실패");
      }
      const next: Record<string, OpenlawStatusRow> = {};
      for (const row of data.items) {
        next[row.gwanselawId] = row;
      }
      setStatusByGwanselawId(next);
    } catch (error) {
      console.error("openlawapi 상태 조회 오류:", error);
    }
  };

  const toggleCheckedId = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        // 체크하면 호출 조건 폼에도 반영되도록 행 선택
        setSelectedId(id);
      }
      return next;
    });
  };

  const handlePythonFetch = async () => {
    const checked = apiList.filter((item) => checkedIds.has(item.id));
    const targets = pythonFetchTargets;
    if (targets.length === 0) {
      const noLawId = checked.filter(
        (item) =>
          item.fileType === "JSON" &&
          !item.lawId?.trim() &&
          !item.apiName.includes("타법폐지"),
      );
      if (checked.length === 0) {
        alert(
          "선택한 법령수집 대상이 없습니다.\n왼쪽 목록에서 법령ID가 있는 JSON 항목을 체크해 주세요.",
        );
      } else if (noLawId.length > 0) {
        alert(
          `체크한 ${checked.length}건 중 법령ID가 있는 대상이 없습니다.\n` +
            `법령ID가 비어 있는 항목: ${noLawId.length}건\n` +
            `(예: ${noLawId[0]?.apiName})\n\n` +
            "법령ID가 있는 행을 체크하거나, API 관리에서 법령ID를 등록한 뒤 다시 시도해 주세요.",
        );
      } else {
        alert(
          "체크한 항목 중 JSON·법령ID 있음·타법폐지 제외 대상이 없습니다.",
        );
      }
      return;
    }

    const confirmed = window.confirm(
      `Python openlawapi(law_crawler.py)로 본문을 수집합니다.\n대상 ${targets.length}건\n· 12개 OPEN API (시행일/공포일/연혁/조항호목/행정규칙/신구법)\n· openlaw_* 테이블에 저장\n계속할까요?`,
    );
    if (!confirmed) return;

    await runOpenlawBodyFetch(targets, {
      progressTitle: "Python 본문 수집",
    });
  };

  const handleBatchImportBodies = async () => {
    const targets = bodyMissingItems;
    if (targets.length === 0) {
      alert(
        "본문이 없는(—) JSON·법령ID 항목이 없습니다. (타법폐지 제외)",
      );
      return;
    }

    const confirmed = window.confirm(
      `본문이 아직 없는 법령을 일괄 가져옵니다.\n대상 ${targets.length}건\n· Python openlawapi(law_crawler.py)\n· 12개 OPEN API 수집 → openlaw_* 저장\n· 체크 여부와 무관하게 본문 미수집 항목 전체\n계속할까요?`,
    );
    if (!confirmed) return;

    await runOpenlawBodyFetch(targets, {
      progressTitle: "일괄가져오기",
    });
  };

  const runOpenlawBodyFetch = async (
    targets: ApiConfig[],
    options: { progressTitle: string },
  ) => {
    setIsPythonFetching(true);
    setProgressPercent(2);
    setProgressLabel(`${options.progressTitle} 준비 중...`);
    setMessage("");
    setMessageTone("info");

    try {
      const lawIds = targets.map((item) => item.lawId.trim());
      const gwanselawIds = targets.map((item) => item.id);

      const response = await fetch("/api/openlawapi/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawIds,
          gwanselawIds,
          noAttach: false,
          includeAdmrul: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `${options.progressTitle} 실패: ${response.status} ${text}`,
        );
      }

      if (!response.body) {
        throw new Error("진행 스트림을 받지 못했습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let successCount = 0;
      let failCount = 0;
      let streamError: string | null = null;

      const lawTotal = Math.max(targets.length, 1);
      const stepTotal = 12;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          let event: {
            type: string;
            lawId?: string;
            lawIndex?: number;
            lawTotal?: number;
            step?: number;
            stepTotal?: number;
            label?: string;
            target?: string;
            endpoint?: string;
            count?: number;
            ok?: boolean;
            error?: string;
            successLawIds?: string[];
            failedLawIds?: string[];
          };
          try {
            event = JSON.parse(line) as typeof event;
          } catch {
            continue;
          }

          if (event.type === "start") {
            const laws = event.lawTotal ?? lawTotal;
            const steps = event.stepTotal ?? stepTotal;
            setProgressPercent(4);
            setProgressLabel(
              `${options.progressTitle} 시작 — 대상 ${laws}건 × API ${steps}종`,
            );
            continue;
          }

          if (event.type === "law_start") {
            const idx = event.lawIndex ?? 0;
            const total = event.lawTotal ?? lawTotal;
            setProgressPercent(
              Math.min(92, 5 + Math.floor(((idx - 1) / Math.max(total, 1)) * 85)),
            );
            setProgressLabel(
              `${options.progressTitle} 중… (${idx}/${total}) 법령ID ${event.lawId ?? ""}`,
            );
            continue;
          }

          if (event.type === "step") {
            const apiLabel = event.label ?? "OPEN API";
            const idx = event.lawIndex ?? 0;
            const total = event.lawTotal ?? lawTotal;
            const step = event.step ?? 0;
            const steps = event.stepTotal ?? stepTotal;
            const lawProgress = (idx - 1) / Math.max(total, 1);
            const stepProgress = step / Math.max(steps, 1) / Math.max(total, 1);
            setProgressPercent(
              Math.min(95, 5 + Math.floor((lawProgress + stepProgress) * 90)),
            );
            setProgressLabel(
              `${options.progressTitle} (${idx}/${total}) · ${apiLabel}`,
            );
            continue;
          }

          if (event.type === "result") {
            successCount = event.successLawIds?.length ?? successCount;
            failCount = event.failedLawIds?.length ?? failCount;
            continue;
          }

          if (event.type === "error") {
            streamError = event.error || `${options.progressTitle} 오류`;
            if (event.successLawIds?.length) {
              successCount = event.successLawIds.length;
            }
            if (event.failedLawIds?.length) {
              failCount = event.failedLawIds.length;
            }
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      const listResponse = await fetch("/api/api-management/save", {
        method: "GET",
        cache: "no-store",
      });
      const listText = await listResponse.text();
      if (listResponse.ok) {
        const listData = JSON.parse(listText) as {
          ok: boolean;
          data?: Partial<ApiConfig>[];
        };
        if (listData.ok && Array.isArray(listData.data)) {
          setApiList(filterApiCallList(prepareApiManagementList(listData.data)));
        }
      }

      await refreshOpenlawStatus();
      setCheckedIds(new Set());

      const doneMessage = `${options.progressTitle} 완료 — 성공 ${successCount}건, 실패 ${failCount}건 (대상 ${targets.length}건)`;
      markCallComplete(`${options.progressTitle}이(가) 완료되었습니다.`, doneMessage);
      await schedulePcShutdownIfEnabled(doneMessage);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setMessageTone("error");
      setMessage(`오류: ${errorMessage}`);
      setProgressPercent(0);
      setProgressLabel("");
    } finally {
      setIsPythonFetching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <CasPageHeader title="API 호출" />

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-8">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    등록
                  </span>
                  <span className="text-2xl font-bold tabular-nums leading-none text-slate-900">
                    {apiList.length}
                  </span>
                  <span className="text-xs text-slate-400">API 목록</span>
                </div>

                <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />

                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    처리
                  </span>
                  <span className="text-2xl font-bold tabular-nums leading-none text-emerald-700">
                    {bodyProcessedCount}
                  </span>
                  <span className="text-xs text-slate-400">
                    본문 Y · {apiList.length}건 중
                  </span>
                </div>

                <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />

                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    미처리
                  </span>
                  <span className="text-2xl font-bold tabular-nums leading-none text-amber-700">
                    {bodyUnprocessedCount}
                  </span>
                  <span className="text-xs text-slate-400">본문 —</span>
                </div>
              </div>

              {apiList.length > 0 ? (
                <div className="mt-3 space-y-1.5 border-t border-slate-200/80 pt-3">
                  <div className="flex items-center justify-between gap-3 text-[11px] tabular-nums text-slate-500">
                    <span>본문 수집 진행률</span>
                    <span className="font-medium text-slate-700">
                      {bodyProcessPercent}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-[#1e2f4f] transition-[width] duration-300"
                      style={{ width: `${bodyProcessPercent}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {showProgressBar ? (
            <div className="mt-4 space-y-2">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                    messageTone === "success" && !isLoading && !isPythonFetching
                      ? "bg-emerald-500"
                      : isPythonFetching
                        ? "bg-[#1e2f4f]"
                        : "bg-[#1e2f4f]"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-sm font-medium text-slate-700">
                {progressLabel || "처리 중입니다..."}
              </p>
              {isPythonFetching ? (
                <p className="text-xs text-violet-700">
                  openlawapi 12개 API를 순차 호출 중입니다. 상단 문구에 현재
                  target·단계가 표시됩니다.
                </p>
              ) : null}
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
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                  API 목록
                </h2>
                {listKeyword.trim() ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    검색 {displayApiList.length}건 / 전체 {apiList.length}건
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
                목록은 DB <code className="text-[11px]">gwanselaw_list</code>
                (smart_law_ai.db)에서 불러옵니다. 로드 시 일반법령리스트v5 엑셀
                행(메뉴 중복 포함)과 크롤링 대상이 자동 반영됩니다.
                「일괄가져오기」는 본문(—) 미수집 항목을 일괄 수집하고, 체크
                후「선택한 법령수집」은 openlawapi law_crawler.py(12개 API)로
                실행합니다.
              </p>
              <div className="mt-3">
                <label className="sr-only" htmlFor="api-list-keyword">
                  법령명 검색
                </label>
                <input
                  id="api-list-keyword"
                  type="search"
                  value={listKeyword}
                  onChange={(e) => setListKeyword(e.target.value)}
                  placeholder="법령명·약칭·법령ID 검색"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div className="h-[min(58vh,560px)] min-h-[260px] overflow-auto border-slate-100">
              <div className="min-w-[1040px]">
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <colgroup>
                    <col style={{ width: "3%" }} />
                    <col className="min-w-0" style={{ width: "48%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "5%" }} />
                    <col className="min-w-0" style={{ width: "17%" }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                    <tr>
                      <th
                        scope="col"
                        className="px-1 py-2.5 text-center text-xs font-semibold text-slate-600"
                      >
                        ✓
                      </th>
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
                        className="px-1 py-2.5 text-center text-xs font-semibold text-slate-600"
                      >
                        목록
                      </th>
                      <th
                        scope="col"
                        className="px-1 py-2.5 text-center text-xs font-semibold text-slate-600"
                      >
                        본문
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
                          colSpan={7}
                          className="px-4 py-14 text-center text-sm text-slate-500"
                        >
                          API 관리 DB에 저장된 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : displayApiList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-14 text-center text-sm text-slate-500"
                        >
                          「{listKeyword.trim()}」에 맞는 법령이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      displayApiList.map((item) => {
                        const isSelected = item.id === selectedId;
                        const status = statusByGwanselawId[item.id];
                        const inLawList = status?.inLawList ?? false;
                        const bodySaved = status?.bodySaved ?? false;
                        const isChecked = checkedIds.has(item.id);
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
                            <td className="px-1 py-2 text-center sm:py-2.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleCheckedId(item.id)}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600"
                                aria-label={`${item.apiName} 선택`}
                              />
                            </td>
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
                                  {item.id.startsWith("crawl-statute-") && !bodySaved ? (
                                    <span className="ml-1.5 text-[10px] font-normal text-amber-700">
                                      크롤링대상
                                    </span>
                                  ) : null}
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
                            <td className="px-1 py-2 text-center text-xs sm:py-2.5">
                              <OpenlawStatusBadge ok={inLawList} label={inLawList ? "Y" : "—"} />
                            </td>
                            <td className="px-1 py-2 text-center text-xs sm:py-2.5">
                              <OpenlawStatusBadge ok={bodySaved} label={bodySaved ? "Y" : "—"} />
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
            <div className="mb-5 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">호출 조건</h2>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                <div className="space-y-3">
                  {/* 1행: 주요 OPEN API 액션 + 초기화 */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-emerald-800/80">
                        OPEN API
                      </span>
                      <PanelActionButton
                        icon={SlIconImport}
                        onClick={handleBatchImportBodies}
                        disabled={isBusy || bodyMissingItems.length === 0}
                        title={
                          bodyMissingItems.length === 0
                            ? "본문 열이 — 인 JSON·법령ID 항목이 없습니다. (타법폐지 제외)"
                            : `본문 미수집 ${bodyMissingItems.length}건을 Python openlawapi로 일괄 가져오기`
                        }
                        className={
                          isBusy || bodyMissingItems.length === 0
                            ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                            : `${casActionFillClass} shadow-sm`
                        }
                      >
                        일괄가져오기
                        {bodyMissingItems.length > 0
                          ? ` (${bodyMissingItems.length})`
                          : ""}
                      </PanelActionButton>

                      <PanelActionButton
                        icon={SlIconCollect}
                        onClick={handlePythonFetch}
                        disabled={isBusy || checkedIds.size === 0}
                        title={
                          checkedIds.size === 0
                            ? "체크한 JSON·법령ID 항목이 없습니다."
                            : pythonFetchTargets.length === 0
                              ? "체크한 항목에 법령ID가 없습니다. 클릭하면 안내가 표시됩니다."
                              : `Python law_crawler.py — ${pythonFetchTargets.length}건`
                        }
                        className={
                          isBusy || checkedIds.size === 0
                            ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                            : `${casActionFillClass} shadow-sm`
                        }
                      >
                        선택한 법령수집
                        {pythonFetchTargets.length > 0
                          ? ` (${pythonFetchTargets.length})`
                          : checkedIds.size > 0
                            ? " (법령ID 필요)"
                            : ""}
                      </PanelActionButton>
                    </div>

                    <CasResetButton
                      type="button"
                      onClick={handleReset}
                      disabled={isBusy}
                    />
                  </div>

                  {/* 2행: 미사용(일반법령 API) */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3 sm:gap-3">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      미사용
                    </span>
                    <PanelActionButton
                      icon={SlIconBatch}
                      onClick={handleBatchCallApi}
                      disabled={isBusy || batchPendingItems.length === 0}
                      title={
                        batchPendingItems.length === 0
                          ? "법령ID 있음·최종수신일 없음 항목이 없습니다. 타법폐지 법령은 제외됩니다."
                          : `대상 ${batchPendingItems.length}건 — 벡터화 없이 저장 (타법폐지 제외)`
                      }
                      className={
                        isBusy || batchPendingItems.length === 0
                          ? unusedPanelActionDisabledClass
                          : unusedPanelActionClass
                      }
                    >
                      일괄API호출(미사용)
                      {batchPendingItems.length > 0
                        ? ` (${batchPendingItems.length})`
                        : ""}
                    </PanelActionButton>

                    <PanelActionButton
                      icon={SlIconPlay}
                      onClick={handleCallApi}
                      disabled={isBusy}
                      title="일반법령 DB(law_*) 저장 — 현재 미사용"
                      className={
                        isBusy
                          ? unusedPanelActionDisabledClass
                          : unusedPanelActionClass
                      }
                    >
                      API 호출(미사용)
                    </PanelActionButton>
                  </div>
                </div>

                <label
                  className={`mt-3 flex cursor-pointer items-start gap-2 border-t border-slate-200/80 pt-3 text-left text-xs ${
                    isBusy ? "cursor-not-allowed opacity-60" : "text-slate-600"
                  }`}
                  title="일괄가져오기·선택한 법령수집·일괄API호출 완료 후 적용. localhost·Windows만 지원."
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    checked={shutdownAfterComplete}
                    disabled={isBusy}
                    onChange={(e) => setShutdownAfterComplete(e.target.checked)}
                  />
                  <span>
                    완료 후 60초 뒤 프로그램 종료 · PC 전원 끄기
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      예약 취소: 명령 프롬프트에서{" "}
                      <code className="rounded bg-slate-100 px-1">shutdown /a</code>
                    </span>
                  </span>
                </label>
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
                label="서비스 URL"
                value={
                  selectedApi?.fileType === "JSON"
                    ? lawJsonServiceUrl
                    : lawXmlServiceUrl
                }
                disabled
                onChange={() => {}}
                placeholder={
                  selectedApi?.fileType === "JSON"
                    ? ".env.local의 LAW_JSONSERVICE_URL"
                    : ".env.local의 LAW_XMLSERVICE_URL"
                }
              />

              <Field
                label="사용자키값(OC)"
                value={lawApiOc}
                disabled
                onChange={() => {}}
                placeholder=".env.local의 LAW_API_OC"
              />

              <Field
                label="파일타입"
                value={selectedApi?.fileType ?? ""}
                disabled
                onChange={() => {}}
                placeholder="API 관리 DB 값"
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
                placeholder="API 호출 완료 시 갱신"
              />

              <Field
                label="법령ID(ID)"
                value={lawId}
                onChange={setLawId}
                placeholder="값이 있으면 ID 파라미터로 호출"
              />

              <Field
                label="검색어(query)"
                value={query}
                onChange={setQuery}
                placeholder="예: * 또는 관세법"
              />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-medium text-slate-700">
                호출 예정 URL
              </div>
              <div className="break-all rounded-lg bg-white px-3 py-3 text-sm text-slate-800">
                {previewRequestUrl ||
                  "왼쪽 목록에서 API를 선택하면 API 호출 요청 URL이 표시됩니다."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpenlawStatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex min-w-[1.5rem] justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:text-xs ${
        ok
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
          : "bg-slate-50 text-slate-400 ring-slate-200/80"
      }`}
    >
      {label}
    </span>
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

function parseLawSearchXml(xmlText: string, requestedUrl: string): ParsedLawSearch {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");

  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML 파싱에 실패했습니다.");
  }

  const meta: SearchMeta = {
    target: getText(xml, "target"),
    keyword: getText(xml, "키워드"),
    section: getText(xml, "section"),
    totalCnt: parseNumber(getText(xml, "totalCnt")),
    page: parseNumber(getText(xml, "page")),
    numOfRows: parseNumber(getText(xml, "numOfRows")),
    resultCode: getText(xml, "resultCode"),
    resultMsg: getText(xml, "resultMsg"),
    requestedUrl,
  };

  const lawNodes = Array.from(xml.getElementsByTagName("law"));

  const items: LawListItem[] = lawNodes.map((lawNode, index) => ({
    itemNo: index + 1,
    lawSerialNo: getText(lawNode, "법령일련번호"),
    historyStatusCode: getText(lawNode, "현행연혁코드"),
    lawNameKr: getText(lawNode, "법령명한글"),
    lawNameShort: getText(lawNode, "법령약칭명"),
    lawId: getText(lawNode, "법령ID"),
    promulgationDate: getText(lawNode, "공포일자"),
    promulgationNo: getText(lawNode, "공포번호"),
    revisionTypeName: getText(lawNode, "제개정구분명"),
    ministryCode: getText(lawNode, "소관부처코드"),
    ministryName: getText(lawNode, "소관부처명"),
    lawTypeName: getText(lawNode, "법령구분명"),
    enforcementDate: getText(lawNode, "시행일자"),
    detailLink: getText(lawNode, "법령상세링크"),
  }));

  return {
    meta,
    items,
  };
}

function getText(root: ParentNode, tagName: string) {
  const node = root.querySelector(tagName);
  return node?.textContent?.trim() ?? "";
}

function parseNumber(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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

