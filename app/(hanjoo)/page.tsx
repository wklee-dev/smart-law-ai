import Link from "next/link";
import { AppShell } from "@/hanjoo/components/app-shell";
import { HomeHeroSearch } from "@/hanjoo/components/home/HomeHeroSearch";
import { listLatestDomesticCases, openSmartLawDb } from "@/hanjoo/lib/domestic-cases";
import { getWeeklyExchangeRates } from "@/hanjoo/lib/exchange-rates";
import { listLatestLaws } from "@/hanjoo/lib/latest-laws";
import { listClipAdminNotices } from "@/hanjoo/lib/clip-admin-notices";
import { listHomeNlcNotices } from "@/hanjoo/lib/nlc-home";
import { listLatestPrecedents } from "@/hanjoo/lib/precedents";

const NOTICES = [
  "관세율표 2026년 개정 반영",
  "FTA 협정관세 조회 안내",
  "HSK 통합검색 이용 방법",
];

const LAWS = ["관세법", "FTA 특례법", "대외무역법", "관세환급특례법"];

const SHORTCUTS = [
  { href: "/tariff", label: "관세율표" },
  { href: "/tariff/item?hs=0101299000", label: "HS별세율" },
  { href: "/rates/fta", label: "FTA 협정관세" },
  { href: "/tariff/compare", label: "HS 비교" },
];

const WORLD_TARIFF = [
  { href: "/tariff/foreign?country=CN", label: "중국" },
  { href: "/tariff/foreign?country=US", label: "미국" },
  { href: "/tariff/foreign?country=EU", label: "EU" },
  { href: "/tariff/foreign?country=JP", label: "일본" },
  { href: "/tariff/foreign?country=VN", label: "베트남" },
  { href: "/tariff/foreign?country=IN", label: "인도" },
];

function CardHead({
  title,
  href,
  moreLabel = "더보기",
}: {
  title: string;
  href?: string;
  moreLabel?: string;
}) {
  return (
    <div className="home-card-hd">
      <h3>{title}</h3>
      {href ? (
        <Link href={href} className="home-more">
          {moreLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default async function HomePage() {
  let fx: Awaited<ReturnType<typeof getWeeklyExchangeRates>> = null;
  let fxError = false;
  try {
    fx = await getWeeklyExchangeRates();
  } catch {
    fxError = true;
  }

  let latestLaws: Awaited<ReturnType<typeof listLatestLaws>> = [];
  let latestLawError = false;
  try {
    latestLaws = await listLatestLaws(4);
  } catch {
    latestLawError = true;
  }

  let precedents: Awaited<ReturnType<typeof listLatestPrecedents>> = [];
  let precedentError = false;
  try {
    precedents = await listLatestPrecedents(4);
  } catch {
    precedentError = true;
  }

  let domesticCases: Awaited<ReturnType<typeof listLatestDomesticCases>> = [];
  let domesticError = false;
  try {
    const db = await openSmartLawDb();
    try {
      domesticCases = await listLatestDomesticCases(db, 4);
    } finally {
      await db.close();
    }
  } catch {
    domesticError = true;
  }

  let nlcRows: Awaited<ReturnType<typeof listHomeNlcNotices>> = [];
  let nlcError = false;
  try {
    nlcRows = await listHomeNlcNotices(4);
  } catch {
    nlcError = true;
  }

  let newsRows: Awaited<ReturnType<typeof listClipAdminNotices>>["rows"] = [];
  let newsError = false;
  try {
    newsRows = (await listClipAdminNotices(4, 1)).rows;
  } catch {
    newsError = true;
  }

  return (
    <AppShell>
      <div className="home-portal">
        <section className="home-hero">
          <p className="home-hero-kicker">Smart Law</p>
          <h1>한주 HS 및 법령정보포털</h1>
          <p className="home-hero-desc">
            관세율표 · 세율 · 수출입요건을 한 화면에서 빠르게 조회합니다.
          </p>
          <HomeHeroSearch />
          <div className="home-shortcuts" aria-label="주요 업무 바로가기">
            {SHORTCUTS.map((s) => (
              <Link key={s.href} href={s.href} className="home-shortcut">
                {s.label}
              </Link>
            ))}
          </div>
        </section>

        <div className="home-layout">
          <div className="home-main">
            <section className="home-card" id="board">
              <CardHead title="공지사항" />
              <div className="home-card-bd">
                <ul className="home-list home-list-compact">
                  {NOTICES.map((t) => (
                    <li key={t}>
                      <span className="home-list-title" title={t}>
                        {t}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="home-card">
              <CardHead title="주요법령" href="/laws/latest" />
              <div className="home-card-bd">
                <ul className="home-list home-list-compact">
                  {LAWS.map((t) => (
                    <li key={t}>
                      <Link href="/laws/latest" className="home-list-title" title={t}>
                        {t}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="home-card" id="news">
              <CardHead title="뉴스" href="/news" />
              <div className="home-card-bd">
                {newsError ? (
                  <p className="muted">뉴스를 불러오지 못했습니다.</p>
                ) : newsRows.length === 0 ? (
                  <p className="muted">표시할 뉴스가 없습니다.</p>
                ) : (
                  <ul className="home-list">
                    {newsRows.map((n) => (
                      <li key={n.noticeId}>
                        <span className="home-list-date">{n.writtenDate || "날짜 없음"}</span>
                        <span className="home-list-title" title={n.title}>
                          <Link href={`/news?id=${encodeURIComponent(n.noticeId)}`}>{n.title}</Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="home-card" id="cases">
              <CardHead title="품목분류 (HSK)" href="/cases/domestic" />
              <div className="home-card-bd">
                {domesticError ? (
                  <p className="muted">국내사례를 불러오지 못했습니다.</p>
                ) : domesticCases.length === 0 ? (
                  <p className="muted">표시할 국내사례가 없습니다.</p>
                ) : (
                  <ul className="home-list">
                    {domesticCases.map((row) => {
                      const label = `${row.dtrm_hs_sgn} ${row.cmdt_nm}`.trim();
                      return (
                        <li key={row.id}>
                          <span className="home-list-date">{row.enfr_dt || "날짜 없음"}</span>
                          <span className="home-list-title" title={label}>
                            <Link href={`/tariff/item?hs=${row.dtrm_hs_sgn.replace(/\D/g, "")}`}>
                              {row.dtrm_hs_sgn}
                            </Link>{" "}
                            {row.cmdt_nm}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="home-card" id="laws">
              <CardHead title="제정/개정" href="/laws/latest" />
              <div className="home-card-bd">
                {latestLawError ? (
                  <p className="muted">최신법령을 불러오지 못했습니다.</p>
                ) : latestLaws.length === 0 ? (
                  <p className="muted">표시할 최신법령이 없습니다.</p>
                ) : (
                  <ul className="home-list">
                    {latestLaws.map((row) => {
                      const label = `${row.name} ${row.typeName}${row.revision ? ` ${row.revision}` : ""}`.trim();
                      return (
                        <li key={row.id}>
                          <span className="home-list-date">
                            {row.promulgationDate || "날짜 없음"}
                          </span>
                          <span className="home-list-title" title={label}>
                            <Link href="/laws/latest">{row.name}</Link> {row.typeName}
                            {row.revision ? ` ${row.revision}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="home-card" id="cases-board">
              <CardHead title="질의·회신 · 판례·예규" href="/precedents" />
              <div className="home-card-bd">
                {precedentError ? (
                  <p className="muted">판례·예규를 불러오지 못했습니다.</p>
                ) : precedents.length === 0 ? (
                  <p className="muted">표시할 판례·예규가 없습니다.</p>
                ) : (
                  <ul className="home-list">
                    {precedents.map((row) => {
                      const label = `${row.caseNo} ${row.title}`.trim();
                      return (
                        <li key={row.id}>
                          <span className="home-list-date">
                            {row.decisionDate || "날짜 없음"}
                          </span>
                          <span className="home-list-title" title={label}>
                            <Link href="/precedents">{row.caseNo}</Link> {row.title}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="home-card" id="legislation-notice">
              <CardHead title="통합입법예고" href="/laws/legislation-notice" />
              <div className="home-card-bd">
                {nlcError ? (
                  <p className="muted">통합입법예고를 불러오지 못했습니다.</p>
                ) : nlcRows.length === 0 ? (
                  <p className="muted">표시할 입법예고가 없습니다.</p>
                ) : (
                  <ul className="home-list">
                    {nlcRows.map((row) => {
                      const label = `${row.title}${row.department ? ` · ${row.department}` : ""}`;
                      return (
                        <li key={row.noticeSequence}>
                          <span className="home-list-date">{row.startDateLabel || "날짜 없음"}</span>
                          <span className="home-list-title" title={label}>
                            <Link
                              href={`/laws/legislation-notice?kind=ministry-legislation`}
                            >
                              {row.title}
                            </Link>
                            {row.department ? ` · ${row.department}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          <aside className="home-aside">
            <section className="home-card home-card-soft">
              <div className="home-card-hd">
                <h3>로그인</h3>
              </div>
              <div className="home-card-bd muted">
                세션 로그인 상태입니다. 상단에서 로그아웃할 수 있습니다.
              </div>
            </section>

            <section className="home-card">
              <div className="home-card-hd">
                <h3>환율</h3>
              </div>
              <div className="home-card-bd">
                <table className="fx-table">
                  <thead>
                    <tr>
                      <th>국가</th>
                      <th>환율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fx ? (
                      fx.rates.map((row) => (
                        <tr key={row.code}>
                          <td>{row.code}</td>
                          <td>{row.rate}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="muted">
                          {fxError ? "환율을 불러오지 못했습니다." : "이번 주 환율이 없습니다."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {fx ? <p className="muted fx-note">적용일 {fx.appliedOn}</p> : null}
              </div>
            </section>

            <section className="home-card" id="rates">
              <div className="home-card-hd">
                <h3>연도별 관세율표</h3>
              </div>
              <div className="home-card-bd">
                <ul className="home-list home-list-compact">
                  {[2026, 2025, 2024].map((y) => (
                    <li key={y}>
                      <Link href={`/tariff?year=${y}`} className="home-list-title">
                        {y}년 관세율표
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="home-card">
              <CardHead title="World Tariff" href="/tariff/foreign" />
              <div className="home-card-bd">
                <ul className="home-chip-list">
                  {WORLD_TARIFF.map((w) => (
                    <li key={w.href}>
                      <Link href={w.href}>{w.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="home-card" id="tools">
              <div className="home-card-hd">
                <h3>도구</h3>
              </div>
              <div className="home-card-bd">
                <ul className="home-list home-list-compact">
                  <li>
                    <Link href="/tools/stat-codes" className="home-list-title">
                      통계부호
                    </Link>
                  </li>
                  <li>
                    <Link href="/tools/jangchi" className="home-list-title">
                      장치장부호
                    </Link>
                  </li>
                  <li>
                    <Link href="/tariff/compare" className="home-list-title">
                      HS 비교
                    </Link>
                  </li>
                </ul>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
