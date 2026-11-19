export type CasGridColumn = {
  id: string;
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  mono?: boolean;
  /** 연한 노란 배경(편집 가능 영역 표시) */
  highlight?: boolean;
  /** 법령코드/법령명처럼 링크 스타일 */
  linkStyle?: boolean;
  /** Y/N·체크값을 체크박스로 표시 */
  asCheckbox?: boolean;
};

/** CAS Guide V1.4 하위 행 (TP / 수출입요령 / 유의사항) */
export type CasItemMasterChildRow = Record<string, string>;

export type CasItemMasterRow = Record<string, string> & {
  tpList?: CasItemMasterChildRow[];
  lawList?: CasItemMasterChildRow[];
  dutyList?: CasItemMasterChildRow[];
};

function col(
  key: string,
  label: string,
  width?: string,
  align?: CasGridColumn["align"],
): CasGridColumn {
  const w =
    width ??
    (label.length >= 10 ? "140px" : label.length >= 6 ? "100px" : "80px");
  return {
    id: key,
    key,
    label,
    width: w,
    align,
  };
}

function colsFromGuide(
  defs: readonly (readonly [string, string])[],
): CasGridColumn[] {
  return defs.map(([key, label]) => {
    const center =
      key.endsWith("Yn") ||
      key.endsWith("Cd") ||
      key === "hscode" ||
      key === "qntyUnt" ||
      key === "org" ||
      key === "lCl" ||
      key === "mCl" ||
      key === "sCl";
    const wide =
      label.includes("내용") ||
      label.includes("품명") ||
      label.includes("경로") ||
      label.includes("Description") ||
      label.includes("사유");
    return col(
      key,
      label,
      wide ? "160px" : undefined,
      center ? "center" : "left",
    );
  });
}

/** CAS_수입품목마스터_API_Guide V1.1 — 5.1 응답 항목 전체 (XML 요소명 순) */
const IMPORT_ITEM_MASTER_DEFS = [
  ["cstmUniq", "거래처 통관고유부호"],
  ["mstCd", "품목마스터코드"],
  ["custCd", "거래처코드"],
  ["lCl", "대분류"],
  ["mCl", "중분류"],
  ["sCl", "소분류"],
  ["hscode", "HSCODE"],
  ["stdrdGodsNm", "표준품명"],
  ["dlGodsNm", "거래품명"],
  ["mdlStdrd1", "모델규격1"],
  ["mdlStdrd2", "모델규격2"],
  ["mdlStdrd3", "모델규격3"],
  ["qntyUnt", "수량단위"],
  ["orgExprObj", "원산지표시대상"],
  ["orgExprMth", "원산지표시방법"],
  ["rylt", "Royalty"],
  ["prErrScp", "가격오차범위"],
  ["workDt", "작업일자"],
  ["tdmkNm", "상표명"],
  ["org", "원산지"],
  ["refUnt", "환급단위"],
  ["igdt1", "성분1"],
  ["igdt2", "성분2"],
  ["igdt3", "성분3"],
  ["erp", "ERP Description"],
  ["exmtnCl", "감면관세번호"],
  ["assgnTartObj", "할당관세대상"],
  ["intrmNotiObj", "중간통지대상"],
  ["addMonyComptCl", "가산금계산구분"],
  ["addRt", "가산율"],
  ["exntPic", "검사자"],
  ["tspTp", "수송방법"],
  ["tmprtStr", "온도범위_시작온도"],
  ["tmprtEnd", "온도범위_종료온도"],
  ["cifDcsMth", "과세가격결정방법"],
  ["reprWorkYn", "재작업여부"],
  ["exntr", "EXNTR"],
  ["exntRslt", "검사결과"],
  ["sortRsnCd", "분류사유코드번호"],
  ["sortRsn", "분류사유내용"],
  ["exntAtcFile", "검사관련첨부파일경로"],
  ["factor", "Conversion Factor"],
  ["exmtnFileCd", "감면관련서류파일코드"],
  ["erpCd", "ERP CD"],
  ["godsCl", "물품구분"],
  ["surtaxExmtnCd", "부가세감면번호"],
  ["delYn", "삭제여부"],
  ["regSrcId", "REG_SRC_ID"],
  ["regDt", "등록일시"],
  ["regMan", "등록자"],
  ["updDt", "수정일시"],
  ["updMan", "수정자"],
  ["notFtaAppTg", "FTA미적용대상"],
  ["intaxCd", "개별소비세코드"],
  ["pstpYn", "사전판정여부"],
  ["seyulGubun", "세율구분"],
  ["gwanSeyula", "관세율"],
  ["gbHsCheckYn", "GB HS검증여부"],
  ["certiYn", "증명서여부"],
  ["sbYn", "SB대상여부"],
  ["mstType", "제품코드 대상여부"],
  ["stdrdGodsCd", "표준품명코드"],
  ["rqmntMngSeq", "요건인가번호"],
  ["rqmntExceptReson", "요건제외사유"],
  ["rqmntExceptResonCd", "요건제외사유코드"],
  ["rqmntDutyMatter", "요건의무사항"],
  ["rqmntDeptCd", "요건부서코드"],
  ["idtcYn", "식별품여부"],
  ["mirequmExceptYn", "미요건 의무사항 제외"],
  ["addMony", "가산금"],
  ["addMonyUnt", "가산금통화단위"],
  ["keyword", "키워드"],
  ["categoryCd", "카테고리코드"],
  ["ftaAppTgYn", "FTA 적용 대상여부"],
  ["attachPosition", "부착작업관련 표시위치"],
  ["newMstYn", "신품확인대상"],
  ["intrmNotiObjSauCd", "중간통보대상사유코드"],
  ["setBasis", "설정근거"],
  ["orgExprSetCd", "원산지표시설정"],
  ["orgExprFreeCd", "원산지표시면제"],
  ["orgToDt", "원산지증명서류 유효기간"],
  ["orgDt", "원산지증명서류 발급일자"],
  ["mayagMstYn", "마약류여부(Y/N)"],
  ["indoJogun", "인도조건"],
  ["bseYn", "BSE대상여부"],
  ["pstpRsn", "사전판정사유내용"],
  ["tpValidCd", "TP 유효기간 코드"],
  ["attachPosTxt", "부착작업관련 표시위치 Text"],
  ["netWhtCoft", "순중량계수"],
] as const;

/** CAS_수출품목마스터_API_Guide V1.1 — 5.1 응답 항목 전체 */
const EXPORT_ITEM_MASTER_DEFS = [
  ["custCd", "거래처코드"],
  ["mstCd", "품목마스터코드"],
  ["cstmUniq", "거래처 통관고유부호"],
  ["lCl", "대분류"],
  ["mCl", "중분류"],
  ["sCl", "소분류"],
  ["erpCd", "ERP CD"],
  ["erp", "ERP Description"],
  ["mdlStdrd1", "모델규격1"],
  ["mdlStdrd2", "모델규격2"],
  ["mdlStdrd3", "모델규격3"],
  ["mdlStdrd4", "모델규격4"],
  ["mdlStdrd5", "모델규격5"],
  ["mdlStdrd6", "모델규격6"],
  ["mdlStdrd7", "모델규격7"],
  ["mdlStdrd8", "모델규격8"],
  ["igdt1", "성분1"],
  ["igdt2", "성분2"],
  ["tdmkNm", "상표명"],
  ["qntyUnt", "수량단위"],
  ["factor", "FACTOR"],
  ["purWht", "순중량"],
  ["hscode", "HSCODE"],
  ["stdrdGodsCd", "표준품명코드"],
  ["stdrdGodsNm", "표준품명"],
  ["dlGodsNm", "거래품명"],
  ["org", "원산지"],
  ["orgExprSetCd", "원산지표시설정"],
  ["orgExprObj", "원산지표시대상"],
  ["strategicMstYn", "전략물자대상여부"],
  ["setTpCd", "설정유형"],
  ["setNo", "설정번호"],
  ["setDt", "설정일"],
  ["strategicAtcFileCd", "전략물자첨부관리"],
  ["rerEaseMstYn", "환급간이환급대상여부"],
  ["makeYn", "제조여부"],
  ["prErrScp", "가격오차범위"],
  ["pstpYn", "사전판정대상여부"],
  ["pstpReasonCd", "사전판정사유코드"],
  ["pstpEtcReason", "사전판정기타사유"],
  ["sortRsnCd", "분류사유코드번호"],
  ["sortRsn", "분류사유내용"],
  ["exntPic", "검사자"],
  ["exntr", "EXNTR"],
  ["exntRslt", "검사결과"],
  ["workDt", "작업일자"],
  ["rqmntMngSeq", "요건인가번호"],
  ["rqmntExceptReson", "요건제외사유"],
  ["rqmntExceptResonCd", "요건제외사유코드"],
  ["keyword", "키워드"],
  ["categoryCd", "카테고리코드"],
  ["setBasis", "설정근거"],
  ["delYn", "삭제여부"],
  ["regDt", "등록일시"],
  ["regMan", "등록자"],
  ["updDt", "수정일시"],
  ["updMan", "수정자"],
  ["strategicGubun", "전략물자구분"],
  ["mstCdYn", "수입품목코드표기여부"],
  ["sameMstCdYn", "동일코드대상여부"],
  ["seyulGubun", "세율구분"],
  ["exntAtcFile", "검사관련첨부파일경로"],
  ["prErrScpMinus", "가격오차범위2"],
  ["mayagMstYn", "마약류여부"],
  ["cntrlNo", "관리번호"],
  ["mokjukChkYn", "목적국 체크 여부"],
  ["expireMon", "환급유효개월"],
] as const;

export const IMPORT_ITEM_MASTER_COLUMNS: CasGridColumn[] =
  colsFromGuide(IMPORT_ITEM_MASTER_DEFS);

export const EXPORT_ITEM_MASTER_COLUMNS: CasGridColumn[] =
  colsFromGuide(EXPORT_ITEM_MASTER_DEFS);

export function cellValue(row: CasItemMasterRow, key: string): string {
  const v = row[key];
  if (typeof v !== "string") return "";
  return v;
}

/** CAS_수입품목마스터_API_Guide V1.4 — 5.2 TP (화면 폭 맞춤) */
export const ITEM_MASTER_TP_COLUMNS: CasGridColumn[] = [
  col("yr", "년도", "72px", "center"),
  col("monyUnt", "단위", "72px", "center"),
  col("untPr", "단가", "100px", "right"),
  col("startDt", "시작일", "100px", "center"),
  col("endDt", "종료일", "100px", "center"),
  { id: "remark", key: "remark", label: "비고", align: "left" },
  col("tpChangeGubun", "정기/비정기변동", "120px", "center"),
];

/**
 * CAS 수입품목마스터 화면 기준 수출입요령 그리드.
 * API 미반환 항목(인증허가번호 등)은 빈 칸으로 표시.
 */
export const ITEM_MASTER_LAW_COLUMNS: CasGridColumn[] = [
  col("schGubunNm", "구분", "88px", "center"),
  {
    id: "lawCd",
    key: "lawCd",
    label: "법령코드",
    width: "80px",
    align: "center",
    linkStyle: true,
  },
  {
    id: "lawNm",
    key: "lawNm",
    label: "법령명",
    width: "180px",
    align: "left",
    linkStyle: true,
  },
  col("eximptRqmntOrgan", "기관", "110px", "left"),
  col("eximptRqmntDoc", "구비서류", "180px", "left"),
  {
    id: "lawClNm",
    key: "lawClNm",
    label: "요령설명",
    width: "100px",
    align: "left",
    highlight: true,
  },
  {
    id: "appLawChkYn",
    key: "appLawChkYn",
    label: "적용구분",
    width: "72px",
    align: "center",
    highlight: true,
    asCheckbox: true,
  },
  col("certiPermitNo", "인증허가번호", "110px", "left"),
  {
    id: "rqmntGodsCd",
    key: "rqmntGodsCd",
    label: "품목코드(요건)",
    width: "110px",
    align: "left",
    highlight: true,
  },
  col("exceptRsn", "비대상사유", "100px", "left"),
  col("exceptDtlCd", "비대상상세코드", "110px", "center"),
  col("exceptDtl", "비대상내역", "120px", "left"),
];

/** CAS_수입품목마스터_API_Guide V1.4 — 5.4 품목유의사항 */
export const ITEM_MASTER_DUTY_COLUMNS: CasGridColumn[] = [
  col("seqNo", "순번", "52px", "center"),
  { id: "dutyMatr", key: "dutyMatr", label: "유의사항", align: "left" },
];
