import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";

/** 관리자 메뉴 「최신소식」 중 최신법령·행정예고를 제외한 출처 */
type NewsSourceDef = {
  key: string;
  label: string;
  table: string;
  id: string;
  title: string;
  date: string;
  url: string | null;
  where?: string;
};

const SOURCES: NewsSourceDef[] = [
  { key: "kctdi", label: "관세무역개발원[무역동향]", table: "kctdi_trade_articles", id: "article_no", title: "title", date: "registered_date", url: "detail_url" },
  { key: "clip-annex", label: "관세법령정보포털[별표/서식]", table: "clip_annex_forms", id: "form_key", title: "form_title", date: "effective_date", url: null },
  { key: "clip-treaty", label: "관세법령정보포털[조약/협정]", table: "clip_treaties", id: "trty_srno", title: "treaty_name", date: "effective_date", url: "source_url" },
  { key: "kcs-press", label: "관세청[보도자료]", table: "kcs_press_release_v1", id: "ntt_sn", title: "title", date: "published_date", url: "detail_url" },
  { key: "nlc-legislation", label: "국민참여입법센터[(부처)입법예고]", table: "nlc_ministry_legislation_notice", id: "notice_sequence", title: "title", date: "start_date", url: "source_url" },
  { key: "qia-notice", label: "농림축산검역본부[공지사항]", table: "qia_notice_posts", id: "post_id", title: "title", date: "posted_date", url: "url", where: "board_type = '7_depart'" },
  { key: "gwanbo", label: "대한민국 전자관보[기본검색]", table: "TB_GWANBO_NOTICE", id: "notice_id", title: "title", date: "reg_date", url: "viewer_url" },
  { key: "motie", label: "산업통상부[통상뉴스]", table: "fta_trade_news_articles", id: "article_id", title: "title", date: "registered_date", url: "source_url" },
  { key: "mfds", label: "식품의약품안전처[보도자료]", table: "mfds_press_articles", id: "seq", title: "title", date: "published_date", url: "url" },
  { key: "tt-press", label: "조세심판원[보도자료]", table: "tt_press_posts", id: "post_key", title: "title", date: "published_date", url: "source_url" },
  { key: "tt-case", label: "조세심판원[조세심판사례]", table: "tb_tt_case", id: "dem_no", title: "title", date: "decision_date", url: "source_url" },
  { key: "kotra-us", label: "KOTRA[미국통상정책]", table: "kotra_us_trade_articles", id: "article_id", title: "title", date: "published_date", url: "url" },
  { key: "kotra-trade", label: "KOTRA[통상규제]", table: "kotra_trade_articles", id: "source_id", title: "title", date: "published_date", url: "original_url" },
];

export type HomeNewsItem = {
  id: string;
  title: string;
  date: string;
  url: string | null;
};

export type HomeNewsGroup = {
  key: string;
  label: string;
  items: HomeNewsItem[];
};

function normalizeDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
}

async function loadSource(
  db: SmartLawDb,
  src: NewsSourceDef,
  limit: number,
): Promise<HomeNewsItem[]> {
  if (!(await smartLawTableExists(db, src.table))) return [];
  const urlCol = src.url ? `${src.url} AS url` : "NULL AS url";
  const conds = [`COALESCE(${src.title}, '') <> ''`];
  if (src.where) conds.push(src.where);
  const rows = await db.all(
    `SELECT ${src.id} AS id, ${src.title} AS title, ${src.date} AS dt, ${urlCol}
       FROM "${src.table}"
      WHERE ${conds.join(" AND ")}
      ORDER BY COALESCE(${src.date}, '') DESC, ${src.id} DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => {
    const url = String(r.url ?? "").trim();
    return {
      id: String(r.id ?? ""),
      title: String(r.title ?? "").trim(),
      date: normalizeDate(r.dt),
      url: /^https?:\/\//i.test(url) ? url : null,
    };
  });
}

export async function listHomeNews(perSource = 5): Promise<HomeNewsGroup[]> {
  const db = await openSmartLawDb(true);
  try {
    const out: HomeNewsGroup[] = [];
    for (const src of SOURCES) {
      try {
        const items = await loadSource(db, src, perSource);
        if (items.length) out.push({ key: src.key, label: src.label, items });
      } catch {
        // 출처별 테이블/컬럼 차이는 해당 출처만 생략
      }
    }
    return out;
  } finally {
    await db.close();
  }
}
