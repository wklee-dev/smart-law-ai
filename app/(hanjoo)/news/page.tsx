import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { Button } from "@/hanjoo/components/ui/Button";
import { getClipAdminNotice, listClipAdminNotices } from "@/hanjoo/lib/clip-admin-notices";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const id = (params.id ?? "").trim();
  const view = await listClipAdminNotices(15, page);
  const pages = Math.max(1, Math.ceil(view.total / view.pageSize));
  const detail = id ? await getClipAdminNotice(id) : null;

  function pageHref(p: number): string {
    const sp = new URLSearchParams();
    if (p > 1) sp.set("page", String(p));
    if (id) sp.set("id", id);
    const q = sp.toString();
    return `/news${q ? `?${q}` : ""}`;
  }

  return (
    <AppShellClient>
      <div className="panel">
        <div className="panel-hd">News</div>
        <div className="panel-bd case-page">
          <p className="muted" style={{ marginTop: 0 }}>
            씨엘HS News(
            <a href="https://www.clhs.co.kr/inform.asp" target="_blank" rel="noreferrer">
              inform.asp
            </a>
            ) 전용 테이블은 아직 없습니다. 현재는 DB의{" "}
            <strong>clip_admin_notices</strong>(관세청 CLIP 행정예고·공고)를 표시합니다.
          </p>

          <div className="table-scroll">
            <table className="answer-table case-table">
              <thead>
                <tr>
                  <th>작성일</th>
                  <th>제목</th>
                  <th>부서</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.length ? (
                  view.rows.map((row) => (
                    <tr key={row.noticeId} className={id === row.noticeId ? "on" : undefined}>
                      <td>{row.writtenDate || "—"}</td>
                      <td className="wrap">
                        <Link href={`/news?id=${encodeURIComponent(row.noticeId)}&page=${view.page}`}>
                          {row.title}
                        </Link>
                      </td>
                      <td>{row.departmentName || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="muted">
                      표시할 뉴스가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="case-pager">
              {view.page > 1 ? (
                <Link href={pageHref(view.page - 1)}>
                  <Button type="button" action="prev" size="small" />
                </Link>
              ) : (
                <Button type="button" action="prev" size="small" disabled />
              )}
              <span>
                {view.page} / {pages} ({view.total.toLocaleString()}건)
              </span>
              {view.page < pages ? (
                <Link href={pageHref(view.page + 1)}>
                  <Button type="button" action="next" size="small" />
                </Link>
              ) : (
                <Button type="button" action="next" size="small" disabled />
              )}
            </div>
          ) : view.total > 0 ? (
            <p className="muted">{view.total.toLocaleString()}건</p>
          ) : null}

          {detail ? (
            <section className="fta-card" style={{ marginTop: 16 }}>
              <header>
                <h3>{detail.title}</h3>
                <Link href={pageHref(view.page)}>
                  <Button type="button" action="close" size="small" />
                </Link>
              </header>
              <ul className="fta-laws pairs">
                <li>
                  <span>작성일</span>
                  <em>{detail.writtenDate || "—"}</em>
                </li>
                <li>
                  <span>부서</span>
                  <em>{detail.departmentName || "—"}</em>
                </li>
                {detail.publicationYear || detail.publicationNumber ? (
                  <li>
                    <span>고시번호</span>
                    <em>
                      {detail.publicationYear}
                      {detail.publicationNumber ? `-${detail.publicationNumber}` : ""}
                    </em>
                  </li>
                ) : null}
                {detail.sourceUrl ? (
                  <li>
                    <span>원문</span>
                    <em>
                      <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                        CLIP 원문
                      </a>
                    </em>
                  </li>
                ) : null}
              </ul>
              <pre
                style={{
                  marginTop: 14,
                  whiteSpace: "pre-wrap",
                  wordBreak: "keep-all",
                  font: "inherit",
                  lineHeight: 1.6,
                }}
              >
                {detail.contentText?.trim() || "본문이 없습니다."}
              </pre>
            </section>
          ) : null}
        </div>
      </div>
    </AppShellClient>
  );
}
