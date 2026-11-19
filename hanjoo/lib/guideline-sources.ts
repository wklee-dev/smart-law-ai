import {
  smartLawTableExists,
  withSmartLawDb,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

export type GuideSource = {
  name: string;
  url: string;
  db: "있음" | "없음" | "참고";
  detail: string;
};

const CIEL = "https://www.cnhs.co.kr/";

const MENUS: Record<
  string,
  { title: string; sources: (count: (table: string) => number) => GuideSource[] }
> = {
  imex: {
    title: "수출입공고",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령. 로그인 화면은 이 환경에서 다시 열지 못함" },
      {
        name: "UNI-PASS 수출입공고",
        url: "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0205003Q.do",
        db: count("imex_notice_item") > 0 ? "있음" : "없음",
        detail: `imex_notice_item ${count("imex_notice_item")}건, imex_notice_master ${count("imex_notice_master")}건`,
      },
      {
        name: "수출입공고 최신본",
        url: "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0205003Q.do",
        db: "없음",
        detail:
          "저장된 공고는 제2022-153호(2022-09-07), 제2022-55호(2022-03-25), 제2014-161호(2014-09-02). 그 이후 공고 행은 없음",
      },
    ],
  },
  integrated: {
    title: "통합공고",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 통합공고",
        url: "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0205002Q.do",
        db: count("clip_integrated_notice_items") > 0 ? "있음" : "없음",
        detail: `clip_integrated_notice_items ${count("clip_integrated_notice_items")}건`,
      },
      {
        name: "통합공고 총칙",
        url: "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0205002Q.do",
        db: count("clip_integrated_notice_general_info") > 0 ? "있음" : "없음",
        detail:
          count("clip_integrated_notice_general_info") > 0
            ? `clip_integrated_notice_general_info ${count("clip_integrated_notice_general_info")}건`
            : "clip_integrated_notice_general_info 0건. 품목 행만 있고 총칙 본문은 없음",
      },
    ],
  },
  "customs-chief": {
    title: "세관장확인",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 세관장확인",
        url: "https://unipass.customs.go.kr/clip/hsinfosrch/openULS0205001Q.do",
        db: count("clip_cc_item_requirement") > 0 ? "있음" : "없음",
        detail: `clip_cc_item_requirement ${count("clip_cc_item_requirement")}건. 화면의 품목 요건 목록`,
      },
      {
        name: "UNI-PASS 세관장확인 안내",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402001Q.do?opnMod=D",
        db: count("clip_cc_integrated_info") > 0 ? "있음" : "없음",
        detail:
          count("clip_cc_integrated_info") > 0
            ? `clip_cc_integrated_info ${count("clip_cc_integrated_info")}건. 관련법령, 세관장확인대상, 생략물품, 생략 비대상, 자율확인우수기업, 관련기관. 현재 화면 목록에는 연결하지 않음`
            : "clip_cc_integrated_info 0건",
      },
    ],
  },
  origin: {
    title: "원산지",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 원산지표시",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402004Q.do",
        db: count("origin_general_sections") > 0 ? "있음" : "없음",
        detail: `origin_general_sections ${count("origin_general_sections")}건`,
      },
    ],
  },
  ipr: {
    title: "지식재산권",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 지식재산권",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402005Q.do",
        db: count("clip_ipr_content") > 0 ? "있음" : "없음",
        detail: `clip_ipr_content ${count("clip_ipr_content")}건. 안내 본문`,
      },
    ],
  },
  "inter-korean": {
    title: "남북한교역",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 남북교역",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402006Q.do",
        db: count("clip_nk_trade_content") > 0 ? "있음" : "없음",
        detail: `clip_nk_trade_content ${count("clip_nk_trade_content")}건. 안내 본문`,
      },
    ],
  },
  strategic: {
    title: "전략물자",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 전략물자",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402007Q.do",
        db: count("clip_strategic_material_content") > 0 ? "있음" : "없음",
        detail: `clip_strategic_material_content ${count("clip_strategic_material_content")}건. 안내 본문`,
      },
      {
        name: "KITA 전략물자 품목",
        url: "https://www.kita.net/tradeNavi/strategicMaterial/strategicMaterialList.do",
        db: count("kita_strategic_material_hs") > 0 ? "있음" : "없음",
        detail:
          count("kita_strategic_material_hs") > 0
            ? `kita_strategic_material_hs ${count("kita_strategic_material_hs")}건, kita_strategic_material_control ${count("kita_strategic_material_control")}건, kita_strategic_material_mapping ${count("kita_strategic_material_mapping")}건. 화면에는 안내 본문만 표시. 수집 실행 상태는 failed라 목록이 일부일 수 있음`
            : "품목 통제목록 없음. KITA 전략물자 목록에서 받으면 된다",
      },
    ],
  },
  "hs-spec": {
    title: "HS별 품명·규격",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 수입신고 가이드",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402009Q.do",
        db: count("hs_import_declaration_guide") > 0 ? "있음" : "없음",
        detail: `hs_import_declaration_guide ${count("hs_import_declaration_guide")}건`,
      },
    ],
  },
  "std-code": {
    title: "표준품명/규격코드",
    sources: (count) => [
      { name: "CIEL 화면", url: CIEL, db: "참고", detail: "수출입요령" },
      {
        name: "UNI-PASS 표준품명",
        url: "https://unipass.customs.go.kr/clip/ctensrch/openULS0402010Q.do",
        db: count("clip_standard_product_code") > 0 ? "있음" : "없음",
        detail: `clip_standard_product_code ${count("clip_standard_product_code")}건`,
      },
      {
        name: "공공데이터 표준품명",
        url: "https://www.data.go.kr/data/15049721/fileData.do",
        db: "참고",
        detail: "갱신 파일 받는 곳. DB 원본 파일명은 로컬 엑셀",
      },
    ],
  },
};

async function countOf(db: SmartLawDb, table: string): Promise<number> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || /^cl_/i.test(table)) return 0;
  if (!(await smartLawTableExists(db, table))) return 0;
  return Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0);
}

export async function getGuidelineSources(
  code: string,
): Promise<{ title: string; sources: GuideSource[] } | null> {
  const menu = MENUS[code];
  if (!menu) return null;
  return withSmartLawDb(async (db) => {
    const cache = new Map<string, number>();
    const count = (table: string): number => {
      if (cache.has(table)) return cache.get(table)!;
      // sync wrapper — pre-fill below
      return 0;
    };
    const tables = new Set<string>();
    // Probe known tables referenced in this menu by building with a counting stub after preload
    const preloadCandidates = [
      "imex_notice_item",
      "imex_notice_master",
      "clip_integrated_notice_items",
      "clip_integrated_notice_general_info",
      "clip_cc_item_requirement",
      "clip_cc_integrated_info",
      "origin_general_sections",
      "clip_ipr_content",
      "clip_nk_trade_content",
      "clip_strategic_material_content",
      "kita_strategic_material_hs",
      "kita_strategic_material_control",
      "kita_strategic_material_mapping",
      "hs_import_declaration_guide",
      "clip_standard_product_code",
    ];
    for (const t of preloadCandidates) {
      cache.set(t, await countOf(db, t));
      tables.add(t);
    }
    void tables;
    return {
      title: menu.title,
      sources: menu.sources((table) => cache.get(table) ?? 0),
    };
  });
}

export function guidelineSourceCodes(): string[] {
  return Object.keys(MENUS);
}
