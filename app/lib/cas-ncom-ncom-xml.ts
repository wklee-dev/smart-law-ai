type XmlNode = {
  name: string;
  text: string;
  children: XmlNode[];
};

function normalizeXml(xml: string): string {
  return xml.replace(/^\uFEFF/, "").trim();
}

function skipWs(xml: string, index: number): number {
  while (index < xml.length && /\s/.test(xml[index]!)) index++;
  return index;
}

function parseXmlDocument(raw: string): XmlNode | null {
  const xml = normalizeXml(raw);
  if (!xml.startsWith("<")) return null;

  function parseAt(start: number): { node: XmlNode; next: number } | null {
    let index = skipWs(xml, start);
    if (index >= xml.length || xml[index] !== "<") return null;

    const closeTag = xml.indexOf(">", index);
    if (closeTag < 0) return null;

    const open = xml.slice(index + 1, closeTag).trim();
    if (open.startsWith("?") || open.startsWith("!")) {
      return parseAt(closeTag + 1);
    }

    if (open.endsWith("/")) {
      const name = open.slice(0, -1).trim();
      return {
        node: { name, text: "", children: [] },
        next: closeTag + 1,
      };
    }

    const name = open;
    const endTag = `</${name}>`;
    let cursor = closeTag + 1;
    const children: XmlNode[] = [];
    let text = "";

    while (cursor < xml.length) {
      cursor = skipWs(xml, cursor);
      if (cursor >= xml.length) return null;

      if (xml.startsWith(endTag, cursor)) {
        cursor += endTag.length;
        break;
      }

      if (xml[cursor] === "<") {
        if (xml[cursor + 1] === "/") {
          if (xml.startsWith(endTag, cursor)) {
            cursor += endTag.length;
            break;
          }
          return null;
        }
        const child = parseAt(cursor);
        if (!child) return null;
        children.push(child.node);
        cursor = child.next;
        continue;
      }

      const nextClose = xml.indexOf(endTag, cursor);
      if (nextClose < 0) return null;
      text += xml.slice(cursor, nextClose);
      cursor = nextClose + endTag.length;
      break;
    }

    return {
      node: { name, text: text.trim(), children },
      next: cursor,
    };
  }

  const root = parseAt(0);
  return root?.node ?? null;
}

import {
  normalizeExportFieldMap,
  normalizeImportFieldMap,
} from "@/app/lib/cas-ncom-field-map";

function fieldMap(node: XmlNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const child of node.children) {
    if (child.name.startsWith("ncomSearch")) continue;
    if (child.children.length === 0) {
      out[child.name] = child.text;
    }
  }
  return out;
}

/** impo3 / 가이드 한글 노드명(ncomSearch모델규격Vo) */
function impo3Nodes(impo2: XmlNode): XmlNode[] {
  return impo2.children.filter(
    (c) =>
      c.name === "ncomSearchImpo3Vo" || c.name === "ncomSearch모델규격Vo",
  );
}

function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

export type NcomFlatRow = Record<string, string>;

export type NcomParseResult = {
  tCnt: number;
  ntceInfo: string;
  rows: NcomFlatRow[];
};

/** ncomSearchQry XML → impo1+impo2+impo3 flatten 행 */
export function parseNcomSearchXml(xml: string): NcomParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "ncomSearchQryRtnVo") {
    throw new Error("NCOM XML 응답 형식이 올바르지 않습니다.");
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: NcomFlatRow[] = [];

  for (const impo1 of childrenNamed(root, "ncomSearchQryVo")) {
    const impo1Fields = normalizeImportFieldMap(fieldMap(impo1));
    for (const impo2 of childrenNamed(impo1, "ncomSearchImpo2Vo")) {
      const impo2Fields = normalizeImportFieldMap(fieldMap(impo2));
      const impo3List = impo3Nodes(impo2);
      if (impo3List.length === 0) {
        rows.push({ ...impo1Fields, ...impo2Fields });
        continue;
      }
      for (const impo3 of impo3List) {
        rows.push({
          ...impo1Fields,
          ...impo2Fields,
          ...normalizeImportFieldMap(fieldMap(impo3)),
        });
      }
    }
  }

  return { tCnt, ntceInfo, rows };
}

/** ncomSearchExpoQry XML → expo1+expo2+expo3 flatten 행 */
export function parseNcomExpoSearchXml(xml: string): NcomParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "ncomSearchExpoQryRtnVo") {
    throw new Error("NCOM XML 응답 형식이 올바르지 않습니다.");
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: NcomFlatRow[] = [];

  for (const expo1 of childrenNamed(root, "ncomSearchExpoQryVo")) {
    const expo1Fields = normalizeExportFieldMap(fieldMap(expo1));
    for (const expo2 of childrenNamed(expo1, "ncomSearchExpo2Vo")) {
      const expo2Fields = normalizeExportFieldMap(fieldMap(expo2));
      const expo3List = childrenNamed(expo2, "ncomSearchExpo3Vo");
      if (expo3List.length === 0) {
        rows.push({ ...expo1Fields, ...expo2Fields });
        continue;
      }
      for (const expo3 of expo3List) {
        rows.push({
          ...expo1Fields,
          ...expo2Fields,
          ...normalizeExportFieldMap(fieldMap(expo3)),
        });
      }
    }
  }

  return { tCnt, ntceInfo, rows };
}

function expoCertiRowFields(raw: Record<string, string>): NcomFlatRow {
  const out = normalizeExportFieldMap(raw);
  for (const [name, value] of Object.entries(raw)) {
    if (name === "otherCountryYn") {
      out.epoGumaejaCode = value;
      continue;
    }
    if (!name.toLowerCase().startsWith("ehanjoo")) {
      out[name] = value;
    }
  }
  return out;
}

/** selectExpoCertiList XML → 1행 = 1 selectExpoCertiListVo */
export function parseSelectExpoCertiListXml(xml: string): NcomParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "selectExpoCertiListRtnVo") {
    throw new Error("3M 수출증명서 XML 응답 형식이 올바르지 않습니다.");
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: NcomFlatRow[] = [];
  for (const vo of childrenNamed(root, "selectExpoCertiListVo")) {
    rows.push(expoCertiRowFields(fieldMap(vo)));
  }

  return { tCnt, ntceInfo, rows };
}

/** selectExpprooMstFtaList XML → 1행 = 1 selectExpprooMstFtaListVo */
export function parseSelectExpprooMstFtaListXml(xml: string): NcomParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "selectExpprooMstFtaListRtnVo") {
    throw new Error(
      "3M 품목·원산지판정기준 XML 응답 형식이 올바르지 않습니다.",
    );
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: NcomFlatRow[] = [];
  for (const vo of childrenNamed(root, "selectExpprooMstFtaListVo")) {
    rows.push(fieldMap(vo));
  }

  return { tCnt, ntceInfo, rows };
}

/** selectExpprooCoDeciStdiList XML → 1행 = 1 selectExpprooCoDeciStdiListVo */
export function parseSelectExpprooCoDeciStdiListXml(xml: string): NcomParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "selectExpprooCoDeciStdiListRtnVo") {
    throw new Error(
      "3M HS·원산지판정기준 XML 응답 형식이 올바르지 않습니다.",
    );
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: NcomFlatRow[] = [];
  for (const vo of childrenNamed(root, "selectExpprooCoDeciStdiListVo")) {
    rows.push(fieldMap(vo));
  }

  return { tCnt, ntceInfo, rows };
}

function parseCasFlatListXml(
  xml: string,
  rootName: string,
  rowName: string,
  errorLabel: string,
): NcomParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== rootName) {
    throw new Error(`${errorLabel} XML 응답 형식이 올바르지 않습니다.`);
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: NcomFlatRow[] = [];
  for (const vo of childrenNamed(root, rowName)) {
    rows.push(fieldMap(vo));
  }

  return { tCnt, ntceInfo, rows };
}

/** masterSearchQry — 수입품목마스터 (TP·수출입요령·유의사항 하위 포함, Guide V1.4) */
export type MasterSearchQryRow = NcomFlatRow & {
  tpList: NcomFlatRow[];
  lawList: NcomFlatRow[];
  dutyList: NcomFlatRow[];
};

export type MasterSearchQryParseResult = {
  tCnt: number;
  ntceInfo: string;
  rows: MasterSearchQryRow[];
};

export function parseMasterSearchQryXml(xml: string): MasterSearchQryParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "masterSearchQryRtnVo") {
    throw new Error("수입품목마스터 XML 응답 형식이 올바르지 않습니다.");
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const rows: MasterSearchQryRow[] = [];
  for (const vo of childrenNamed(root, "masterSearchQryVo")) {
    rows.push(
      Object.assign(fieldMap(vo), {
        tpList: childrenNamed(vo, "masterSearchTpVo").map((n) => fieldMap(n)),
        lawList: childrenNamed(vo, "masterSearchLawMngVo").map((n) =>
          fieldMap(n),
        ),
        dutyList: childrenNamed(vo, "masterSearchDutyMatrVo").map((n) =>
          fieldMap(n),
        ),
      }) as MasterSearchQryRow,
    );
  }

  return { tCnt, ntceInfo, rows };
}

/** expMasterSearchQry — 수출품목마스터 */
export function parseExpMasterSearchQryXml(xml: string): NcomParseResult {
  return parseCasFlatListXml(
    xml,
    "expMasterSearchQryRtnVo",
    "expMasterSearchQryVo",
    "수출품목마스터",
  );
}

export type NdrawWanjangMasterRow = NcomFlatRow & {
  details: NcomFlatRow[];
};

export type NdrawWanjangParseResult = {
  tCnt: number;
  ntceInfo: string;
  masters: NdrawWanjangMasterRow[];
};

/** ndrawSearchWanjangQry — 환급 수입원장 (원장1 + 원장2) */
export function parseNdrawSearchWanjangQryXml(
  xml: string,
): NdrawWanjangParseResult {
  const root = parseXmlDocument(xml);
  if (!root || root.name !== "ndrawSearchWanjangQryRtnVo") {
    throw new Error("환급 수입원장 XML 응답 형식이 올바르지 않습니다.");
  }

  const tCntNode = root.children.find((c) => c.name === "tCnt");
  const ntceNode = root.children.find((c) => c.name === "ntceInfo");
  const tCnt =
    Number.parseInt(tCntNode?.text ?? "0", 10) ||
    Number.parseInt(tCntNode?.children[0]?.text ?? "0", 10) ||
    0;
  const ntceInfo = ntceNode?.text ?? "";

  const masters: NdrawWanjangMasterRow[] = [];
  for (const vo of childrenNamed(root, "ndrawSearchWanjangQryVo")) {
    const details = childrenNamed(vo, "ndrawSearchWanjang2Vo").map((d) =>
      fieldMap(d),
    );
    masters.push(
      Object.assign(fieldMap(vo), { details }) as NdrawWanjangMasterRow,
    );
  }

  return { tCnt, ntceInfo, masters };
}
