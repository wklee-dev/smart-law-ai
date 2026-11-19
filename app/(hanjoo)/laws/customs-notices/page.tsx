import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { searchCustomsNotices, type CustomsNoticeRow } from "@/hanjoo/lib/customs-notices";
import Link from "next/link";

function noticeHref(row: CustomsNoticeRow): string {
  const sp = new URLSearchParams({ name: row.linkName || row.name, tab: "admrul" });
  if (row.seq) sp.set("k", `a:${row.seq}`);
  return `/laws/general/customs/read?${sp.toString()}`;
}

export const dynamic = "force-dynamic";

export default async function CustomsNoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const view = await searchCustomsNotices(q, Number(params.page ?? "1"));
  const pages = Math.max(1, Math.ceil(view.total / view.pageSize));
  const rows = [...view.featured, ...view.rows];

  function pageHref(page: number): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (page > 1) sp.set("page", String(page));
    const query = sp.toString();
    return `/laws/customs-notices${query ? `?${query}` : ""}`;
  }

  return (
    <AppShellClient>
      <div className="panel">
        <div className="panel-hd">관세청고시</div>
        <div className="panel-bd case-page">
          <SearchToolbar variant="panel" method="get" onSubmit={() => undefined}>
            <label>
              법령명
              <input name="q" defaultValue={q} />
            </label>
            <Button type="submit" action="lookup" />
          </SearchToolbar>
          <div className="table-scroll">
            <table className="answer-table case-table customs-notice-table">
              <thead>
                <tr>
                  <th>법령</th>
                  <th>종류/번호</th>
                  <th>개정일</th>
                  <th>시행일</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={`${row.linkName}-${row.seq || row.name}`} className={view.featured.includes(row) ? "pin" : undefined}>
                      <td className="wrap">
                        <Link href={noticeHref(row)}>{row.name}</Link>
                      </td>
                      <td>
                        {row.type} {row.number ? `제${row.number.replace(/^제|호$/g, "")}호` : ""}
                      </td>
                      <td>{row.issueDate}</td>
                      <td>{row.enforceDate}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted">
                      등록된 관세청 고시가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="case-pager">
              {view.page > 1 ? <Link href={pageHref(view.page - 1)}>이전</Link> : <span />}
              <span>
                {view.page} / {pages}
              </span>
              {view.page < pages ? <Link href={pageHref(view.page + 1)}>다음</Link> : <span />}
            </div>
          ) : null}
        </div>
      </div>
    </AppShellClient>
  );
}
