"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import {
  defaultNlcDateRange,
  formatNlcDisplayDate,
  formatNlcPeriod,
  nlcRemainingDays,
  NLC_LIST_PAGE_SIZE,
} from "@/hanjoo/lib/nlc-notice-format";
import {
  NLC_NOTICE_TABS,
  nlcNoticePageTitle,
  type NlcListResponse,
  type NlcNoticeDetail,
  type NlcNoticeKind,
} from "@/hanjoo/lib/nlc-notice-types";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";

function parseKind(raw: string | null): NlcNoticeKind {
  if (
    raw === "ministry-administrative" ||
    raw === "local-legislation" ||
    raw === "ministry-legislation"
  ) {
    return raw;
  }
  return "ministry-legislation";
}

export default function LegislationNoticePage() {
  return (
    <AppShellClient>
      <Suspense fallback={<div className="panel"><div className="panel-hd">통합입법예고</div><div className="panel-bd muted">불러오는 중…</div></div>}>
        <LegislationNoticeClient />
      </Suspense>
    </AppShellClient>
  );
}

function LegislationNoticeClient() {
  const searchParams = useSearchParams();
  const initialRange = useMemo(() => defaultNlcDateRange(), []);
  const [kind, setKind] = useState<NlcNoticeKind>(() => parseKind(searchParams.get("kind")));
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<NlcListResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<NlcNoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(
    async (nextPage: number, nextKind = kind) => {
      setLoading(true);
      setErr(null);
      setSelected(null);
      setDetail(null);
      const sp = new URLSearchParams({
        kind: nextKind,
        page: String(nextPage),
        pageSize: String(NLC_LIST_PAGE_SIZE),
        sort: "date_desc",
      });
      if (q.trim()) sp.set("q", q.trim());
      if (dateFrom) sp.set("dateFrom", dateFrom);
      if (dateTo) sp.set("dateTo", dateTo);
      if (includeFinished) sp.set("includeFinished", "1");
      try {
        const res = await fetch(`/api/hj/nlc-notices?${sp}`);
        const data = (await res.json()) as NlcListResponse & {
          ok?: boolean;
          message?: string;
        };
        if (!data.ok) throw new Error(data.message || "조회에 실패했습니다.");
        setPayload(data);
        setPage(data.page ?? nextPage);
      } catch (e) {
        setPayload(null);
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [kind, q, dateFrom, dateTo, includeFinished],
  );

  useEffect(() => {
    void loadList(1, kind);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps -- tab change only

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("kind", kind);
    window.history.replaceState({}, "", url.toString());
  }, [kind]);

  async function openDetail(sequence: string) {
    setSelected(sequence);
    setDetailLoading(true);
    setDetail(null);
    try {
      const sp = new URLSearchParams({ detailKind: kind, sequence });
      const res = await fetch(`/api/hj/nlc-notices?${sp}`);
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        detail?: NlcNoticeDetail;
      };
      if (!data.ok || !data.detail) throw new Error(data.message || "상세를 불러오지 못했습니다.");
      setDetail(data.detail);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void loadList(1);
  }

  async function onReset() {
    const range = defaultNlcDateRange();
    setQ("");
    setDateFrom(range.from);
    setDateTo(range.to);
    setIncludeFinished(false);
    setLoading(true);
    setErr(null);
    setSelected(null);
    setDetail(null);
    const sp = new URLSearchParams({
      kind,
      page: "1",
      pageSize: String(NLC_LIST_PAGE_SIZE),
      sort: "date_desc",
      dateFrom: range.from,
      dateTo: range.to,
    });
    try {
      const res = await fetch(`/api/hj/nlc-notices?${sp}`);
      const data = (await res.json()) as NlcListResponse & { ok?: boolean; message?: string };
      if (!data.ok) throw new Error(data.message || "조회에 실패했습니다.");
      setPayload(data);
      setPage(data.page ?? 1);
    } catch (e) {
      setPayload(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const total = payload && "total" in payload ? payload.total : 0;
  const pages = Math.max(1, Math.ceil(total / NLC_LIST_PAGE_SIZE));
  const tab = NLC_NOTICE_TABS.find((t) => t.kind === kind);

  return (
    <div className="panel">
      <div className="panel-hd">통합입법예고</div>
      <div className="panel-bd case-page">
        <p className="muted" style={{ marginTop: 0 }}>
          국민참여입법센터 통합입법예고를 조회합니다.
          {tab ? (
            <>
              {" "}
              <a href={tab.originalUrl} target="_blank" rel="noreferrer">
                원문 사이트
              </a>
            </>
          ) : null}
        </p>

        <div className="case-tabs" role="tablist" aria-label="예고 구분">
          {NLC_NOTICE_TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              className={kind === t.kind ? "on" : ""}
              onClick={() => setKind(t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <SearchToolbar variant="panel" onSubmit={onSearch}>
          <label>
            시작일
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            종료일
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label>
            제목
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색어" />
          </label>
          <label className="case-check">
            <input
              type="checkbox"
              checked={includeFinished}
              onChange={(e) => setIncludeFinished(e.target.checked)}
            />
            종료 포함
          </label>
          <Button type="submit" action="lookup" disabled={loading} />
          <Button type="button" action="reset" onClick={onReset} disabled={loading} />
        </SearchToolbar>

        {err ? <p className="case-err">{err}</p> : null}
        {loading ? <p className="muted">조회 중…</p> : null}

        {!loading && payload && "dataAvailable" in payload && payload.dataAvailable === false ? (
          <p className="muted">{"message" in payload ? payload.message : "데이터가 없습니다."}</p>
        ) : null}

        <div className="table-scroll">
          <table className="answer-table case-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>{kind === "local-legislation" ? "자치단체" : "소관"}</th>
                <th>예고기간</th>
                <th>잔여</th>
              </tr>
            </thead>
            <tbody>
              {payload && "items" in payload && payload.items.length > 0 ? (
                payload.items.map((row) => {
                  const seq = row.noticeSequence;
                  const period =
                    "startDate" in row
                      ? formatNlcPeriod(row.startDate, row.endDate)
                      : formatNlcDisplayDate(
                          "announcementDate" in row ? row.announcementDate : "",
                        );
                  const remain =
                    "endDate" in row ? nlcRemainingDays(row.endDate) : "—";
                  const org =
                    "department" in row
                      ? row.department
                      : "institution" in row
                        ? row.institution
                        : "localGovernment" in row
                          ? row.localGovernment
                          : "";
                  return (
                    <tr key={seq} className={selected === seq ? "on" : undefined}>
                      <td className="wrap">
                        <button type="button" className="case-link" onClick={() => void openDetail(seq)}>
                          {row.title || "(제목 없음)"}
                        </button>
                      </td>
                      <td>{org || "—"}</td>
                      <td>{period}</td>
                      <td>{remain}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    {loading ? "…" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <div className="case-pager">
            <Button
              type="button"
              action="prev"
              size="small"
              disabled={page <= 1 || loading}
              onClick={() => void loadList(page - 1)}
            />
            <span>
              {page} / {pages} ({total.toLocaleString()}건)
            </span>
            <Button
              type="button"
              action="next"
              size="small"
              disabled={page >= pages || loading}
              onClick={() => void loadList(page + 1)}
            />
          </div>
        ) : total > 0 ? (
          <p className="muted">{total.toLocaleString()}건</p>
        ) : null}

        <section className="fta-card" style={{ marginTop: 16 }}>
          <header>
            <h3>
              {detail ? detail.title : nlcNoticePageTitle(kind)} 상세
            </h3>
            {detail ? (
              <Button type="button" action="close" size="small" onClick={() => { setDetail(null); setSelected(null); }} />
            ) : null}
          </header>
          {detailLoading ? <p className="muted">상세 불러오는 중…</p> : null}
          {!detailLoading && !detail ? (
            <p className="muted">목록에서 제목을 선택하면 상세 내용을 볼 수 있습니다.</p>
          ) : null}
          {detail ? (
            <div className="nlc-detail">
              <ul className="fta-laws pairs">
                {detail.department ? (
                  <li>
                    <span>소관부처</span>
                    <em>{detail.department}</em>
                  </li>
                ) : null}
                {detail.institution ? (
                  <li>
                    <span>기관</span>
                    <em>{detail.institution}</em>
                  </li>
                ) : null}
                {detail.localGovernment ? (
                  <li>
                    <span>자치단체</span>
                    <em>{detail.localGovernment}</em>
                  </li>
                ) : null}
                {detail.lawType ? (
                  <li>
                    <span>법령종류</span>
                    <em>{detail.lawType}</em>
                  </li>
                ) : null}
                {detail.ruleType ? (
                  <li>
                    <span>규칙종류</span>
                    <em>{detail.ruleType}</em>
                  </li>
                ) : null}
                {detail.startDate || detail.endDate ? (
                  <li>
                    <span>예고기간</span>
                    <em>{formatNlcPeriod(detail.startDate ?? "", detail.endDate ?? "")}</em>
                  </li>
                ) : null}
                {detail.announcementDate ? (
                  <li>
                    <span>공고일</span>
                    <em>{formatNlcDisplayDate(detail.announcementDate)}</em>
                  </li>
                ) : null}
                {detail.noticeNumber ? (
                  <li>
                    <span>번호</span>
                    <em>{detail.noticeNumber}</em>
                  </li>
                ) : null}
                {detail.sourceUrl ? (
                  <li>
                    <span>원문</span>
                    <em>
                      <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                        국민참여입법센터
                      </a>
                    </em>
                  </li>
                ) : null}
              </ul>
              {detail.attachments.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <strong>첨부</strong>
                  <ul className="fta-bullets">
                    {detail.attachments.map((a) => (
                      <li key={a.attachmentId}>
                        {a.hasLocalFile ? (
                          <a href={`/api/hj/nlc-notices/attachment?id=${a.attachmentId}`}>{a.fileName}</a>
                        ) : a.downloadUrl ? (
                          <a href={a.downloadUrl} target="_blank" rel="noreferrer">
                            {a.fileName}
                          </a>
                        ) : (
                          a.fileName
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <pre
                className="nlc-body"
                style={{
                  marginTop: 14,
                  whiteSpace: "pre-wrap",
                  wordBreak: "keep-all",
                  font: "inherit",
                  lineHeight: 1.6,
                }}
              >
                {detail.bodyText?.trim() || "본문이 없습니다."}
              </pre>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
