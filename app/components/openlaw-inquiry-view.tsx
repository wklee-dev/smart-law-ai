"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatLawIdForDisplay } from "@/app/shared/law-id";

type OpenlawLawSummary = {
  lawId: string;
  lawName: string;
  lawAbbr: string;
  enforceDt: number;
  promulDt: number;
  deptNm: string;
  lawType: string;
  counts: {
    efydList: number;
    efydJo: number;
    nwList: number;
    nwJo: number;
    hstList: number;
    admrulList: number;
    oldnewList: number;
  };
  hasBody: boolean;
  crawlTargetOnly?: boolean;
  crawlTargetFlag?: string | null;
  crawlDocumentType?: string | null;
};

type OpenlawCrawlTargetsMeta = {
  excelPath: string | null;
  sheet: string;
  totalRows: number;
  allowedRows: number;
  excludedLawStatuteRows: number;
  loadedAt: string;
  filterMode?: "onlyStatutes" | "excludeStatutes";
};

type TabId = "efyd" | "nw" | "hst" | "admrul" | "oldnew";

const TABS: { id: TabId; label: string }[] = [
  { id: "efyd", label: "시행일" },
  { id: "nw", label: "공포일" },
  { id: "hst", label: "연혁" },
  { id: "admrul", label: "행정규칙" },
  { id: "oldnew", label: "신구법" },
];

type ListRow = Record<string, unknown>;

/** API 행에서 camelCase / snake_case 모두 허용 */
function rowVal(row: ListRow | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null) {
      return row[key];
    }
  }
  return undefined;
}

function rowStr(row: ListRow | null | undefined, ...keys: string[]): string {
  const v = rowVal(row, ...keys);
  if (v == null) return "";
  return String(v);
}

function rowNum(row: ListRow | null | undefined, ...keys: string[]): number {
  const v = rowVal(row, ...keys);
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\D/g, "") || 0);
  return Number.isFinite(n) ? n : 0;
}

/** 목록 행을 UI에서 쓰기 쉬운 형태로 정규화 */
function normalizeClientListRow(row: ListRow): ListRow {
  const enforceDt = rowNum(row, "enforceDt", "enforce_dt");
  const promulDt = rowNum(row, "promulDt", "promul_dt");
  const enforceDtLabel =
    rowStr(row, "enforceDtLabel", "enforce_dt_label") ||
    (enforceDt ? formatYmd(enforceDt) : "");
  const promulDtLabel =
    rowStr(row, "promulDtLabel", "promul_dt_label") ||
    (promulDt ? formatYmd(promulDt) : "");
  return {
    ...row,
    lawSeq: rowNum(row, "lawSeq", "law_seq"),
    historyCode: rowStr(row, "historyCode", "history_code"),
    lawNm: rowStr(row, "lawNm", "law_nm", "lawNmKo", "law_nm_ko"),
    lawAbbr: rowStr(row, "lawAbbr", "law_abbr"),
    lawId: rowStr(row, "lawId", "law_id"),
    promulDt,
    promulDtLabel,
    promulNo: rowNum(row, "promulNo", "promul_no"),
    enactType: rowStr(row, "enactType", "enact_type"),
    deptNm: rowStr(row, "deptNm", "dept_nm"),
    lawType: rowStr(row, "lawType", "law_type"),
    enforceDt,
    enforceDtLabel,
    admrulSeq: rowNum(row, "admrulSeq", "admrul_seq"),
    admrulNm: rowStr(row, "admrulNm", "admrul_nm"),
    oldnewSeq: rowNum(row, "oldnewSeq", "oldnew_seq", "admrulSeq", "admrul_seq"),
    issueDtLabel: rowStr(row, "issueDtLabel", "issue_dt_label"),
    admrulType: rowStr(row, "admrulType", "admrul_type"),
    newIssueDtLabel: rowStr(row, "newIssueDtLabel", "new_issue_dt_label"),
    oldIssueDtLabel: rowStr(row, "oldIssueDtLabel", "old_issue_dt_label"),
  };
}

export function OpenlawInquiryView() {
  const [laws, setLaws] = useState<OpenlawLawSummary[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedLawId, setSelectedLawId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("efyd");
  const [listItems, setListItems] = useState<ListRow[]>([]);
  const [info, setInfo] = useState<ListRow | null>(null);
  const [joItems, setJoItems] = useState<ListRow[]>([]);
  const [selectedListKey, setSelectedListKey] = useState<string | null>(null);
  const [loadingLaws, setLoadingLaws] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [crawlTargetsMeta, setCrawlTargetsMeta] =
    useState<OpenlawCrawlTargetsMeta | null>(null);
  /** 목록 행 시행일 ≠ 수집 본문 시행일일 때 안내 */
  const [bodyHint, setBodyHint] = useState("");

  const loadLaws = useCallback(async () => {
    setLoadingLaws(true);
    setError("");
    try {
      const res = await fetch("/api/openlaw-inquiry/laws", { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        laws?: OpenlawLawSummary[];
        crawlTargets?: OpenlawCrawlTargetsMeta | null;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `목록 조회 실패 (${res.status})`);
      }
      const next = data.laws ?? [];
      setLaws(next);
      setCrawlTargetsMeta(data.crawlTargets ?? null);
      if (next.length > 0 && !selectedLawId) {
        const firstReady = next.find((l) => l.hasBody) ?? next[0];
        setSelectedLawId(firstReady.lawId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록 조회 오류");
      setLaws([]);
    } finally {
      setLoadingLaws(false);
    }
  }, [selectedLawId]);

  useEffect(() => {
    void loadLaws();
    // 최초 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredLaws = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return laws;
    return laws.filter(
      (l) =>
        l.lawName.toLowerCase().includes(q) ||
        l.lawAbbr.toLowerCase().includes(q) ||
        l.lawId.includes(q) ||
        formatLawIdForDisplay(l.lawId).includes(q),
    );
  }, [laws, keyword]);

  const selectedLaw =
    laws.find((l) => l.lawId === selectedLawId) ?? filteredLaws[0] ?? null;

  /** 목록에 없는 수집 본문 행을 맨 위에 표시 */
  const displayListItems = useMemo(() => {
    if (tab === "efyd" && info?.enforceDt != null) {
      const bodyEnforce = Number(info.enforceDt);
      const has = listItems.some((r) => Number(r.enforceDt) === bodyEnforce);
      if (!has && bodyEnforce) {
        return [
          {
            _collected: true,
            lawSeq: 0,
            historyCode: "수집본문",
            lawNm: String(info.lawNmKo || selectedLaw?.lawName || ""),
            enforceDt: bodyEnforce,
            enforceDtLabel: String(info.enforceDtLabel || formatYmd(bodyEnforce)),
            promulDt: Number(info.promulDt ?? 0),
            promulDtLabel: String(info.promulDtLabel || ""),
            enactType: String(info.enactType || ""),
          } as ListRow,
          ...listItems,
        ];
      }
    }
    if (tab === "nw" && info?.promulDt != null) {
      const bodyPromul = Number(info.promulDt);
      const has = listItems.some((r) => Number(r.promulDt) === bodyPromul);
      if (!has && bodyPromul) {
        return [
          {
            _collected: true,
            lawSeq: 0,
            historyCode: "수집본문",
            lawNm: String(info.lawNmKo || selectedLaw?.lawName || ""),
            enforceDt: Number(info.enforceDt ?? 0),
            enforceDtLabel: String(info.enforceDtLabel || ""),
            promulDt: bodyPromul,
            promulDtLabel: String(info.promulDtLabel || formatYmd(bodyPromul)),
            enactType: String(info.enactType || ""),
          } as ListRow,
          ...listItems,
        ];
      }
    }
    return listItems;
  }, [tab, info, listItems, selectedLaw?.lawName]);

  const loadTabData = useCallback(async () => {
    if (
      selectedLaw &&
      !selectedLaw.hasBody &&
      tab !== "admrul" &&
      tab !== "oldnew"
    ) {
      setListItems([]);
      setInfo(null);
      setJoItems([]);
      setBodyHint("");
      setError("");
      return;
    }

    if (!selectedLaw && tab !== "admrul" && tab !== "oldnew") {
      setListItems([]);
      setInfo(null);
      setJoItems([]);
      return;
    }

    setLoadingDetail(true);
    setError("");
    try {
      if (tab === "efyd" && selectedLaw) {
        setBodyHint("");
        const listRes = await fetch(
          `/api/openlaw-inquiry/efyd/list?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
          { cache: "no-store" },
        );
        const listData = (await listRes.json()) as {
          ok: boolean;
          items?: ListRow[];
          error?: string;
        };
        if (!listRes.ok || !listData.ok) {
          throw new Error(listData.error || "시행일 목록 실패");
        }
        const items = (listData.items ?? []).map(normalizeClientListRow);
        setListItems(items);

        // 조문·본문은 목록 첫 행이 아니라 수집된 info 기준으로 로드
        // (목록에는 연혁만 있고 본문 시행일이 없을 수 있음)
        const infoRes = await fetch(
          `/api/openlaw-inquiry/efyd/info?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
          { cache: "no-store" },
        );
        const infoData = (await infoRes.json()) as {
          ok: boolean;
          info?: ListRow | null;
        };
        const body = infoData.info
          ? normalizeClientListRow(infoData.info)
          : null;
        setInfo(body);
        const bodyEnforce = Number(
          body?.enforceDt ?? selectedLaw.enforceDt ?? 0,
        );

        const match = items.find(
          (r) => Number(r.enforceDt ?? 0) === bodyEnforce,
        );
        if (match) {
          setSelectedListKey(`efyd:${match.lawSeq}:${match.enforceDt}`);
        } else {
          setSelectedListKey(
            bodyEnforce ? `efyd:collected:${bodyEnforce}` : null,
          );
          if (items.length > 0 && bodyEnforce) {
            setBodyHint(
              `수집된 본문 시행일 ${formatYmd(bodyEnforce)} — 목록에는 해당 행이 없어 본문·조문을 직접 표시합니다.`,
            );
          }
        }

        const joRes = await fetch(
          `/api/openlaw-inquiry/efyd/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}${
            bodyEnforce ? `&enforceDt=${bodyEnforce}` : ""
          }`,
          { cache: "no-store" },
        );
        const joData = (await joRes.json()) as { ok: boolean; items?: ListRow[] };
        let jos = joData.items ?? [];
        if (jos.length === 0 && bodyEnforce) {
          const fallback = await fetch(
            `/api/openlaw-inquiry/efyd/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
            { cache: "no-store" },
          );
          const fb = (await fallback.json()) as { ok: boolean; items?: ListRow[] };
          jos = fb.items ?? [];
        }
        setJoItems(jos);
      } else if (tab === "nw" && selectedLaw) {
        setBodyHint("");
        const listRes = await fetch(
          `/api/openlaw-inquiry/nw/list?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
          { cache: "no-store" },
        );
        const listData = (await listRes.json()) as {
          ok: boolean;
          items?: ListRow[];
          error?: string;
        };
        if (!listRes.ok || !listData.ok) {
          throw new Error(listData.error || "공포일 목록 실패");
        }
        const items = (listData.items ?? []).map(normalizeClientListRow);
        setListItems(items);

        const infoRes = await fetch(
          `/api/openlaw-inquiry/nw/info?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
          { cache: "no-store" },
        );
        const infoData = (await infoRes.json()) as {
          ok: boolean;
          info?: ListRow | null;
        };
        const body = infoData.info
          ? normalizeClientListRow(infoData.info)
          : null;
        setInfo(body);
        const bodyPromul = Number(body?.promulDt ?? selectedLaw.promulDt ?? 0);

        const match = items.find((r) => Number(r.promulDt ?? 0) === bodyPromul);
        if (match) {
          setSelectedListKey(`nw:${match.lawSeq}:${match.promulDt}`);
        } else {
          setSelectedListKey(
            bodyPromul ? `nw:collected:${bodyPromul}` : null,
          );
          if (items.length > 0 && bodyPromul) {
            setBodyHint(
              `수집된 본문 공포일 ${formatYmd(bodyPromul)} — 목록에는 해당 행이 없어 본문·조문을 직접 표시합니다.`,
            );
          }
        }

        const joRes = await fetch(
          `/api/openlaw-inquiry/nw/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}${
            bodyPromul ? `&promulDt=${bodyPromul}` : ""
          }`,
          { cache: "no-store" },
        );
        const joData = (await joRes.json()) as { ok: boolean; items?: ListRow[] };
        let jos = joData.items ?? [];
        if (jos.length === 0 && bodyPromul) {
          const fallback = await fetch(
            `/api/openlaw-inquiry/nw/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
            { cache: "no-store" },
          );
          const fb = (await fallback.json()) as { ok: boolean; items?: ListRow[] };
          jos = fb.items ?? [];
        }
        setJoItems(jos);
      } else if (tab === "hst" && selectedLaw) {
        setBodyHint("");
        const listRes = await fetch(
          `/api/openlaw-inquiry/hst/list?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
          { cache: "no-store" },
        );
        const listData = (await listRes.json()) as {
          ok: boolean;
          items?: ListRow[];
          error?: string;
        };
        if (!listRes.ok || !listData.ok) {
          throw new Error(listData.error || "연혁 목록 실패");
        }
        const items = (listData.items ?? []).map(normalizeClientListRow);
        setListItems(items);
        const first = items[0];
        const promulDt = rowNum(first, "promulDt", "promul_dt");
        const lawSeq = rowNum(first, "lawSeq", "law_seq");
        setSelectedListKey(first ? `hst:${lawSeq}:${promulDt}` : null);
        setJoItems([]);
        if (promulDt) {
          const infoRes = await fetch(
            `/api/openlaw-inquiry/hst/info?lawId=${encodeURIComponent(selectedLaw.lawId)}&promulDt=${promulDt}`,
            { cache: "no-store" },
          );
          const infoData = (await infoRes.json()) as {
            ok: boolean;
            info?: ListRow | null;
          };
          setInfo(
            infoData.info ? normalizeClientListRow(infoData.info) : null,
          );
        } else {
          setInfo(null);
        }
      } else if (tab === "admrul") {
        const listRes = await fetch("/api/openlaw-inquiry/admrul/list", {
          cache: "no-store",
        });
        const listData = (await listRes.json()) as {
          ok: boolean;
          items?: ListRow[];
          error?: string;
        };
        if (!listRes.ok || !listData.ok) {
          throw new Error(listData.error || "행정규칙 목록 실패");
        }
        const items = (listData.items ?? []).map(normalizeClientListRow);
        setListItems(items);
        setInfo(null);
        const first = items[0];
        const seq = rowNum(first, "admrulSeq", "admrul_seq");
        setSelectedListKey(seq ? `admrul:${seq}` : null);
        if (seq) {
          const joRes = await fetch(
            `/api/openlaw-inquiry/admrul/info?admrulSeq=${seq}`,
            { cache: "no-store" },
          );
          const joData = (await joRes.json()) as {
            ok: boolean;
            items?: ListRow[];
          };
          setJoItems(joData.items ?? []);
        } else {
          setJoItems([]);
        }
      } else if (tab === "oldnew") {
        const listRes = await fetch("/api/openlaw-inquiry/oldnew/list", {
          cache: "no-store",
        });
        const listData = (await listRes.json()) as {
          ok: boolean;
          items?: ListRow[];
          error?: string;
        };
        if (!listRes.ok || !listData.ok) {
          throw new Error(listData.error || "신구법 목록 실패");
        }
        const items = (listData.items ?? []).map(normalizeClientListRow);
        setListItems(items);
        setInfo(null);
        const first = items[0];
        const seq = rowNum(first, "oldnewSeq", "oldnew_seq", "admrul_seq");
        setSelectedListKey(seq ? `oldnew:${seq}` : null);
        if (seq) {
          const joRes = await fetch(
            `/api/openlaw-inquiry/oldnew/info?admrulSeq=${seq}`,
            { cache: "no-store" },
          );
          const joData = (await joRes.json()) as {
            ok: boolean;
            items?: ListRow[];
          };
          setJoItems(joData.items ?? []);
        } else {
          setJoItems([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조회 오류");
      setListItems([]);
      setInfo(null);
      setJoItems([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedLaw, tab]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  const selectListRow = async (row: ListRow) => {
    if (tab === "efyd" && selectedLaw) {
      if (row._collected) {
        setSelectedListKey(`efyd:collected:${row.enforceDt}`);
        setLoadingDetail(true);
        setBodyHint("");
        try {
          const infoRes = await fetch(
            `/api/openlaw-inquiry/efyd/info?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
            { cache: "no-store" },
          );
          const infoData = (await infoRes.json()) as {
            ok: boolean;
            info?: ListRow | null;
          };
          const body = infoData.info ?? null;
          setInfo(body);
          const bodyEnforce = Number(body?.enforceDt ?? 0);
          const joRes = await fetch(
            `/api/openlaw-inquiry/efyd/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}${
              bodyEnforce ? `&enforceDt=${bodyEnforce}` : ""
            }`,
            { cache: "no-store" },
          );
          const joData = (await joRes.json()) as {
            ok: boolean;
            items?: ListRow[];
          };
          setJoItems(joData.items ?? []);
        } finally {
          setLoadingDetail(false);
        }
        return;
      }

      const enforceDt = Number(row.enforceDt ?? 0);
      setSelectedListKey(`efyd:${row.lawSeq}:${enforceDt}`);
      setLoadingDetail(true);
      try {
        const [infoRes, joRes] = await Promise.all([
          fetch(
            `/api/openlaw-inquiry/efyd/info?lawId=${encodeURIComponent(selectedLaw.lawId)}&enforceDt=${enforceDt}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/openlaw-inquiry/efyd/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}&enforceDt=${enforceDt}`,
            { cache: "no-store" },
          ),
        ]);
        const infoData = (await infoRes.json()) as {
          ok: boolean;
          info?: ListRow | null;
        };
        const joData = (await joRes.json()) as { ok: boolean; items?: ListRow[] };
        let body = infoData.info ?? null;
        let jos = joData.items ?? [];

        if (!body || jos.length === 0) {
          // 연혁 행은 목록만 있고 본문 미수집인 경우가 많음 → 수집 본문으로 폴백
          const fbInfo = await fetch(
            `/api/openlaw-inquiry/efyd/info?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
            { cache: "no-store" },
          );
          const fbInfoData = (await fbInfo.json()) as {
            ok: boolean;
            info?: ListRow | null;
          };
          body = fbInfoData.info ?? null;
          const bodyEnforce = Number(body?.enforceDt ?? 0);
          const fbJo = await fetch(
            `/api/openlaw-inquiry/efyd/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}${
              bodyEnforce ? `&enforceDt=${bodyEnforce}` : ""
            }`,
            { cache: "no-store" },
          );
          const fbJoData = (await fbJo.json()) as {
            ok: boolean;
            items?: ListRow[];
          };
          jos = fbJoData.items ?? [];
          setBodyHint(
            `선택 시행일 ${formatYmd(enforceDt)} 조문은 미수집입니다. 수집된 본문(시행 ${formatYmd(bodyEnforce)})을 표시합니다.`,
          );
          if (bodyEnforce) {
            setSelectedListKey(`efyd:collected:${bodyEnforce}`);
          }
        } else {
          setBodyHint("");
        }
        setInfo(body);
        setJoItems(jos);
      } finally {
        setLoadingDetail(false);
      }
    } else if (tab === "nw" && selectedLaw) {
      if (row._collected) {
        setSelectedListKey(`nw:collected:${row.promulDt}`);
        setLoadingDetail(true);
        setBodyHint("");
        try {
          const infoRes = await fetch(
            `/api/openlaw-inquiry/nw/info?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
            { cache: "no-store" },
          );
          const infoData = (await infoRes.json()) as {
            ok: boolean;
            info?: ListRow | null;
          };
          const body = infoData.info ?? null;
          setInfo(body);
          const bodyPromul = Number(body?.promulDt ?? 0);
          const joRes = await fetch(
            `/api/openlaw-inquiry/nw/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}${
              bodyPromul ? `&promulDt=${bodyPromul}` : ""
            }`,
            { cache: "no-store" },
          );
          const joData = (await joRes.json()) as {
            ok: boolean;
            items?: ListRow[];
          };
          setJoItems(joData.items ?? []);
        } finally {
          setLoadingDetail(false);
        }
        return;
      }

      const promulDt = Number(row.promulDt ?? 0);
      setSelectedListKey(`nw:${row.lawSeq}:${promulDt}`);
      setLoadingDetail(true);
      try {
        const [infoRes, joRes] = await Promise.all([
          fetch(
            `/api/openlaw-inquiry/nw/info?lawId=${encodeURIComponent(selectedLaw.lawId)}&promulDt=${promulDt}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/openlaw-inquiry/nw/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}&promulDt=${promulDt}`,
            { cache: "no-store" },
          ),
        ]);
        const infoData = (await infoRes.json()) as {
          ok: boolean;
          info?: ListRow | null;
        };
        const joData = (await joRes.json()) as { ok: boolean; items?: ListRow[] };
        let body = infoData.info ?? null;
        let jos = joData.items ?? [];
        if (!body || jos.length === 0) {
          const fbInfo = await fetch(
            `/api/openlaw-inquiry/nw/info?lawId=${encodeURIComponent(selectedLaw.lawId)}`,
            { cache: "no-store" },
          );
          const fbInfoData = (await fbInfo.json()) as {
            ok: boolean;
            info?: ListRow | null;
          };
          body = fbInfoData.info ?? null;
          const bodyPromul = Number(body?.promulDt ?? 0);
          const fbJo = await fetch(
            `/api/openlaw-inquiry/nw/jo?lawId=${encodeURIComponent(selectedLaw.lawId)}${
              bodyPromul ? `&promulDt=${bodyPromul}` : ""
            }`,
            { cache: "no-store" },
          );
          const fbJoData = (await fbJo.json()) as {
            ok: boolean;
            items?: ListRow[];
          };
          jos = fbJoData.items ?? [];
          setBodyHint(
            `선택 공포일 ${formatYmd(promulDt)} 조문은 미수집입니다. 수집된 본문(공포 ${formatYmd(bodyPromul)})을 표시합니다.`,
          );
          if (bodyPromul) {
            setSelectedListKey(`nw:collected:${bodyPromul}`);
          }
        } else {
          setBodyHint("");
        }
        setInfo(body);
        setJoItems(jos);
      } finally {
        setLoadingDetail(false);
      }
    } else if (tab === "hst" && selectedLaw) {
      const promulDt = rowNum(row, "promulDt", "promul_dt");
      const lawSeq = rowNum(row, "lawSeq", "law_seq");
      setSelectedListKey(`hst:${lawSeq}:${promulDt}`);
      setLoadingDetail(true);
      try {
        const infoRes = await fetch(
          `/api/openlaw-inquiry/hst/info?lawId=${encodeURIComponent(selectedLaw.lawId)}&promulDt=${promulDt}`,
          { cache: "no-store" },
        );
        const infoData = (await infoRes.json()) as {
          ok: boolean;
          info?: ListRow | null;
        };
        setInfo(infoData.info ? normalizeClientListRow(infoData.info) : null);
        setJoItems([]);
      } finally {
        setLoadingDetail(false);
      }
    } else if (tab === "admrul") {
      const seq = Number(row.admrulSeq ?? 0);
      setSelectedListKey(`admrul:${seq}`);
      setLoadingDetail(true);
      try {
        const joRes = await fetch(
          `/api/openlaw-inquiry/admrul/info?admrulSeq=${seq}`,
          { cache: "no-store" },
        );
        const joData = (await joRes.json()) as { ok: boolean; items?: ListRow[] };
        setJoItems(joData.items ?? []);
      } finally {
        setLoadingDetail(false);
      }
    } else if (tab === "oldnew") {
      const seq = Number(row.oldnewSeq ?? 0);
      setSelectedListKey(`oldnew:${seq}`);
      setLoadingDetail(true);
      try {
        const joRes = await fetch(
          `/api/openlaw-inquiry/oldnew/info?admrulSeq=${seq}`,
          { cache: "no-store" },
        );
        const joData = (await joRes.json()) as { ok: boolean; items?: ListRow[] };
        setJoItems(joData.items ?? []);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const collectedLawCount = useMemo(
    () => laws.filter((l) => l.hasBody).length,
    [laws],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[480px] flex-col bg-slate-100">
      <header className="shrink-0 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CasPageHeader title="법령조회(OPEN API)" className="min-w-0 flex-1" />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {crawlTargetsMeta ? (
                <>
                  목록{" "}
                  <strong className="text-slate-800">{laws.length}</strong>건 ·
                  수집{" "}
                  <strong className="text-slate-800">{collectedLawCount}</strong>
                  건
                </>
              ) : (
                <>
                  수집 법령{" "}
                  <strong className="text-slate-800">{laws.length}</strong>건
                </>
              )}
            </span>
            <Link
              href="/api-call"
              className="rounded-md bg-[#1e2f4f] px-2.5 py-1 font-medium text-white hover:bg-[#162438]"
            >
              API 호출로 수집
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-[#1e2f4f] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 법령 목록 */}
        <aside className="flex max-h-[40vh] w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-100 p-3">
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="법령명·ID 검색"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {loadingLaws ? (
              <li className="px-3 py-6 text-center text-sm text-slate-500">
                불러오는 중…
              </li>
            ) : filteredLaws.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-500">
                openlaw_* 에 저장된 법령이 없습니다.
                <br />
                <Link href="/api-call" className="text-teal-700 underline">
                  OPEN API 법령수집
                </Link>
                을 먼저 실행하세요.
              </li>
            ) : (
              filteredLaws.map((law) => {
                const sel = law.lawId === selectedLaw?.lawId;
                const collected = law.hasBody !== false;
                return (
                  <li key={law.lawId}>
                    <button
                      type="button"
                      onClick={() => setSelectedLawId(law.lawId)}
                      title={
                        collected
                          ? undefined
                          : `크롤링 대상(미수집) · ${law.crawlDocumentType ?? "법령"} · 대상 ${law.crawlTargetFlag ?? "—"}`
                      }
                      className={`w-full border-l-[3px] px-3 py-2.5 text-left transition ${
                        sel
                          ? collected
                            ? "border-l-teal-700 bg-teal-50/80"
                            : "border-l-amber-500 bg-amber-50/80"
                          : collected
                            ? "border-l-transparent hover:bg-slate-50"
                            : "border-l-amber-400/80 bg-amber-50/30 hover:bg-amber-50/60"
                      }`}
                    >
                      <span
                        className={`block text-sm font-medium ${collected ? "text-slate-900" : "text-slate-600"}`}
                      >
                        {law.lawName || "(법령명 없음)"}
                        {!collected ? (
                          <span className="ml-1.5 text-[10px] font-normal text-amber-700">
                            미수집
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        ID {formatLawIdForDisplay(law.lawId)}
                        {law.enforceDt
                          ? ` · 시행 ${formatYmd(law.enforceDt)}`
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* 중간: 목록 행 */}
        <aside className="flex max-h-[35vh] w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 lg:h-full lg:max-h-none lg:min-h-0 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
            {tabLabel(tab)} 목록 ({displayListItems.length})
          </div>
          <ul className="min-h-0 flex-1 list-none overflow-y-auto p-2">
            {loadingDetail && displayListItems.length === 0 ? (
              <li className="py-4 text-center text-sm text-slate-500">
                불러오는 중…
              </li>
            ) : displayListItems.length === 0 ? (
              <li className="px-2 py-4 text-center text-sm leading-relaxed text-slate-500">
                {selectedLaw && selectedLaw.hasBody === false ? (
                  <>
                    「{selectedLaw.lawName}」은(는) Excel 크롤링 대상(법령)이나
                    아직 OPEN API로 수집되지 않았습니다.
                    <br />
                    <Link href="/api-call" className="text-teal-700 underline">
                      API 호출
                    </Link>
                    에서 수집하세요.
                  </>
                ) : (
                  "목록 데이터가 없습니다."
                )}
              </li>
            ) : (
              displayListItems.map((row, idx) => {
                const key = listRowKey(tab, row, idx);
                const sel = key === selectedListKey;
                const collected = Boolean(row._collected);
                return (
                  <li key={key} className="mb-1 list-none">
                    <button
                      type="button"
                      onClick={() => void selectListRow(row)}
                      className={`w-full rounded-md px-2.5 py-2 text-left text-xs text-slate-800 transition ${
                        sel
                          ? "bg-white shadow ring-1 ring-teal-600/40"
                          : collected
                            ? "bg-teal-50/80 ring-1 ring-teal-200/80 hover:bg-teal-50"
                            : "hover:bg-white/80"
                      }`}
                    >
                      {renderListLabel(tab, row)}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* 우측: 본문·조문 */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white p-4 sm:p-6">
          {loadingDetail && !info && joItems.length === 0 ? (
            <p className="text-sm text-slate-500">본문을 불러오는 중…</p>
          ) : (
            <>
              {bodyHint ? (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {bodyHint}
                </p>
              ) : null}
              {info ? (
                <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    {String(info.lawNmKo || info.lawNm || selectedLaw?.lawName || "")}
                  </h2>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <MetaItem label="법령ID" value={String(info.lawId ?? "")} />
                    <MetaItem
                      label="시행일"
                      value={String(info.enforceDtLabel || "")}
                    />
                    <MetaItem
                      label="공포일"
                      value={String(info.promulDtLabel || "")}
                    />
                    <MetaItem
                      label="공포번호"
                      value={String(info.promulNo ?? "")}
                    />
                    <MetaItem label="소관부처" value={String(info.deptNm ?? "")} />
                    <MetaItem label="법종" value={String(info.lawType ?? "")} />
                    <MetaItem
                      label="제개정"
                      value={String(info.enactType ?? "")}
                    />
                    <MetaItem label="연락처" value={String(info.phone ?? "")} />
                  </dl>
                </section>
              ) : tab === "admrul" || tab === "oldnew" ? (
                <section className="mb-4">
                  <h2 className="text-lg font-bold text-slate-900">
                    {tab === "admrul"
                      ? String(
                          listItems.find(
                            (r) => `admrul:${r.admrulSeq}` === selectedListKey,
                          )?.admrulNm ?? "행정규칙",
                        )
                      : String(
                          listItems.find(
                            (r) => `oldnew:${r.oldnewSeq}` === selectedListKey,
                          )?.admrulNm ?? "신구법 비교",
                        )}
                  </h2>
                </section>
              ) : (
                <p className="mb-4 text-sm text-slate-500">
                  본문 메타가 없습니다. 목록에서 항목을 선택하세요.
                </p>
              )}

              {tab === "oldnew" ? (
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700">
                    신·구 조문 ({joItems.length})
                  </h3>
                  {joItems.length === 0 ? (
                    <p className="text-sm text-slate-500">조문 비교 데이터가 없습니다.</p>
                  ) : (
                    joItems.map((row, idx) => (
                      <article
                        key={`oldnew-${row.joNo}-${idx}`}
                        className="overflow-hidden rounded-lg border border-slate-200"
                      >
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                          조문 {String(row.joNo ?? "")}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2">
                          <div className="border-b border-slate-100 p-3 md:border-b-0 md:border-r">
                            <p className="mb-1 text-xs font-bold text-rose-700">
                              구
                            </p>
                            <pre className="whitespace-pre-wrap text-sm text-slate-800">
                              {String(row.oldJoContent || "—")}
                            </pre>
                          </div>
                          <div className="p-3">
                            <p className="mb-1 text-xs font-bold text-teal-700">
                              신
                            </p>
                            <pre className="whitespace-pre-wrap text-sm text-slate-800">
                              {String(row.newJoContent || "—")}
                            </pre>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              ) : tab === "hst" ? (
                <section>
                  <h3 className="mb-2 text-sm font-bold text-slate-700">
                    연혁 본문 메타
                  </h3>
                  {!info ? (
                    <p className="text-sm text-slate-500">
                      연혁 본문(openlaw_hst_info)이 없습니다.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">
                      연혁 본문 메타가 위 카드에 표시됩니다. (조문 단위는 시행일·공포일
                      탭에서 확인)
                    </p>
                  )}
                </section>
              ) : (
                <section className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-700">
                    조문 ({joItems.length})
                  </h3>
                  {joItems.length === 0 ? (
                    <p className="text-sm text-slate-500">조문이 없습니다.</p>
                  ) : (
                    joItems.map((row, idx) => (
                      <article
                        key={`jo-${row.joNo}-${idx}`}
                        className="scroll-mt-4 overflow-hidden rounded-lg border border-slate-200 shadow-sm"
                      >
                        <div className="border-b border-slate-200 bg-gradient-to-r from-teal-50 to-white px-4 py-2.5">
                          <h4 className="text-base font-semibold text-teal-900">
                            {joHeading(row)}
                          </h4>
                        </div>
                        <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-slate-800">
                          {String(row.joContent || "—")}
                        </div>
                      </article>
                    ))
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function tabLabel(tab: TabId): string {
  return TABS.find((t) => t.id === tab)?.label ?? tab;
}

function formatYmd(n: number): string {
  const s = String(n);
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  if (!value || value === "0") return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function listRowKey(tab: TabId, row: ListRow, idx: number): string {
  const lawSeq = rowNum(row, "lawSeq", "law_seq");
  const enforceDt = rowNum(row, "enforceDt", "enforce_dt");
  const promulDt = rowNum(row, "promulDt", "promul_dt");
  const admrulSeq = rowNum(row, "admrulSeq", "admrul_seq");
  const oldnewSeq = rowNum(row, "oldnewSeq", "oldnew_seq", "admrul_seq");
  const seqKey = lawSeq || `i${idx}`;
  if (row._collected && tab === "efyd") {
    return `efyd:collected:${enforceDt}`;
  }
  if (row._collected && tab === "nw") {
    return `nw:collected:${promulDt}`;
  }
  if (tab === "efyd") return `efyd:${seqKey}:${enforceDt}`;
  if (tab === "nw") return `nw:${seqKey}:${promulDt}`;
  if (tab === "hst") return `hst:${seqKey}:${promulDt}`;
  if (tab === "admrul") return `admrul:${admrulSeq || `i${idx}`}`;
  if (tab === "oldnew") return `oldnew:${oldnewSeq || `i${idx}`}`;
  return `row-${idx}`;
}

function renderListLabel(tab: TabId, row: ListRow) {
  if (tab === "admrul") {
    return (
      <>
        <span className="block font-medium text-slate-800">
          {rowStr(row, "admrulNm", "admrul_nm") || "(이름 없음)"}
        </span>
        <span className="text-slate-600">
          {rowStr(row, "issueDtLabel") || "—"} ·{" "}
          {rowStr(row, "admrulType", "admrul_type")}
        </span>
      </>
    );
  }
  if (tab === "oldnew") {
    return (
      <>
        <span className="block font-medium text-slate-800">
          {rowStr(row, "admrulNm", "admrul_nm") || "(이름 없음)"}
        </span>
        <span className="text-slate-600">
          신 {rowStr(row, "newIssueDtLabel") || "—"} / 구{" "}
          {rowStr(row, "oldIssueDtLabel") || "—"}
        </span>
      </>
    );
  }
  if (row._collected) {
    return (
      <>
        <span className="mb-0.5 inline-block rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
          본문 수집
        </span>
        <span className="block font-medium text-teal-900">
          {rowStr(row, "lawNm", "law_nm") || "수집된 본문"}
        </span>
        <span className="text-teal-800/80">
          시행 {rowStr(row, "enforceDtLabel") || "—"} · 공포{" "}
          {rowStr(row, "promulDtLabel") || "—"}
        </span>
      </>
    );
  }
  if (tab === "hst") {
    const historyCode = rowStr(row, "historyCode", "history_code");
    const lawNm = rowStr(row, "lawNm", "law_nm");
    const enactType = rowStr(row, "enactType", "enact_type");
    const enforceLabel = rowStr(row, "enforceDtLabel") || "—";
    const promulLabel = rowStr(row, "promulDtLabel") || "—";
    return (
      <>
        <span className="block font-medium text-slate-900">
          공포 {promulLabel}
          {enactType ? ` · ${enactType}` : ""}
        </span>
        <span className="text-slate-600">
          시행 {enforceLabel}
          {historyCode ? ` · ${historyCode}` : ""}
          {lawNm ? ` · ${lawNm}` : ""}
        </span>
      </>
    );
  }
  const historyCode = rowStr(row, "historyCode", "history_code");
  const lawNm = rowStr(row, "lawNm", "law_nm");
  const enactType = rowStr(row, "enactType", "enact_type");
  return (
    <>
      <span className="block font-medium text-slate-800">
        {historyCode || lawNm || "(항목)"}
        {historyCode && lawNm ? ` · ${lawNm}` : ""}
      </span>
      <span className="text-slate-600">
        시행 {rowStr(row, "enforceDtLabel") || "—"} · 공포{" "}
        {rowStr(row, "promulDtLabel") || "—"}
        {enactType ? ` · ${enactType}` : ""}
      </span>
    </>
  );
}

function joHeading(row: ListRow): string {
  const no = String(row.joNo ?? "").trim();
  const title = String(row.joTitle ?? "").trim();
  if (no && title) return `제${no}조(${title})`;
  if (no) return `제${no}조`;
  if (title) return title;
  return "조문";
}
