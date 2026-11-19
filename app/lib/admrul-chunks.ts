/**
 * 행정규칙 Open API JSON(AdmRulService) → DB 청크 행
 */

export type AdmrulChunkInsert = {
  source_type: string;
  source_key: string;
  source_title: string;
  chunk_text: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function getAdmRulRoot(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const svc = p.AdmRulService;
  if (svc && typeof svc === "object") {
    return svc as Record<string, unknown>;
  }
  return p;
}

export function extractAdmrulBasicFields(parsed: unknown): {
  adm_serial_id: string;
  adm_lid: string;
  rule_name_kr: string;
  ministry_name: string;
  enforcement_date: string;
  promulgation_date: string;
} {
  const root = getAdmRulRoot(parsed) ?? {};
  const basic = root["행정규칙기본정보"];
  const b =
    basic && typeof basic === "object"
      ? (basic as Record<string, unknown>)
      : {};
  return {
    adm_serial_id: str(b["행정규칙일련번호"]),
    adm_lid: str(b["행정규칙ID"]),
    rule_name_kr: str(b["행정규칙명"]),
    ministry_name: str(b["소관부처명"]),
    enforcement_date: str(b["시행일자"]),
    promulgation_date: str(b["발령일자"]),
  };
}

function flattenTextBlocks(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    const t = node.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) flattenTextBlocks(x, out);
  }
}

function normalizeBylPyegae(
  node: unknown,
): Array<Record<string, unknown>> {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }
  return [node as Record<string, unknown>];
}

/**
 * Open API 응답에서 검색·임베딩용 청크 목록 생성
 */
export function buildAdmrulChunksFromParsed(
  parsed: unknown,
  fallbackSerialId: string,
): AdmrulChunkInsert[] {
  const basic = extractAdmrulBasicFields(parsed);
  const admSerial = basic.adm_serial_id || fallbackSerialId.trim();
  const baseMeta: Record<string, unknown> = {
    adm_serial_id: admSerial || null,
    adm_lid: basic.adm_lid || null,
    rule_name_kr: basic.rule_name_kr || null,
    ministry_name: basic.ministry_name || null,
    enforcement_date: basic.enforcement_date || null,
    promulgation_date: basic.promulgation_date || null,
    source: "admrul",
  };

  const root = getAdmRulRoot(parsed) ?? {};
  const rows: AdmrulChunkInsert[] = [];
  let idx = 0;

  const push = (
    source_type: string,
    source_key: string,
    source_title: string,
    chunk_text: string,
  ) => {
    const t = chunk_text.trim();
    if (!t) return;
    rows.push({
      source_type,
      source_key,
      source_title: source_title.slice(0, 2000),
      chunk_text: t,
      chunk_index: idx++,
      metadata: { ...baseMeta },
    });
  };

  if (basic.rule_name_kr || admSerial) {
    const header = [
      basic.rule_name_kr && `행정규칙명: ${basic.rule_name_kr}`,
      admSerial && `행정규칙일련번호: ${admSerial}`,
      basic.adm_lid && `행정규칙ID: ${basic.adm_lid}`,
      basic.ministry_name && `소관부처: ${basic.ministry_name}`,
      basic.enforcement_date && `시행일자: ${basic.enforcement_date}`,
      basic.promulgation_date && `발령일자: ${basic.promulgation_date}`,
    ]
      .filter(Boolean)
      .join("\n");
    if (header) {
      push("meta", "header", basic.rule_name_kr || "행정규칙", header);
    }
  }

  const jo = root["조문"];
  if (jo && typeof jo === "object") {
    const j = jo as Record<string, unknown>;
    const jno = str(j["조문번호"]) || "0000";
    const jtitle = str(j["조문제목"]);
    const jbody = str(j["조문내용"]);
    const title =
      jtitle && jtitle !== "null"
        ? `조문 ${jno} (${jtitle})`
        : `조문 ${jno}`;
    push("jo", jno, title, jbody);
  }

  const byl = root["부칙"];
  if (byl && typeof byl === "object") {
    const b = byl as Record<string, unknown>;
    const lines: string[] = [];
    const contents = b["부칙내용"];
    if (Array.isArray(contents)) {
      for (const c of contents) {
        const s = str(c);
        if (s) lines.push(s);
      }
    } else {
      const s = str(contents);
      if (s) lines.push(s);
    }
    if (lines.length) {
      push("byl", "byl", "부칙", lines.join("\n\n"));
    }
  }

  const pyegae = root["별표"];
  if (pyegae && typeof pyegae === "object") {
    const units = normalizeBylPyegae(
      (pyegae as Record<string, unknown>)["별표단위"],
    );
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      const pno = str(u["별표번호"]) || String(i);
      const ptitle = str(u["별표제목"]) || `별표 ${pno}`;
      const blocks: string[] = [];
      flattenTextBlocks(u["별표내용"], blocks);
      const body = blocks.join("\n").trim();
      if (body) {
        push("schedule", pno, ptitle, body);
      }
    }
  }

  const gwajeong = root["개정문"];
  if (gwajeong && typeof gwajeong === "object") {
    const g = gwajeong as Record<string, unknown>;
    const inner = g["개정문내용"];
    const blocks: string[] = [];
    flattenTextBlocks(inner, blocks);
    const body = blocks.join("\n").trim();
    if (body) push("gwajeong", "gwajeong", "개정문", body);
  }

  const reason = root["제개정이유"];
  if (reason && typeof reason === "object") {
    const r = reason as Record<string, unknown>;
    const inner = r["제개정이유내용"];
    const blocks: string[] = [];
    flattenTextBlocks(inner, blocks);
    const body = blocks.join("\n").trim();
    if (body) push("reason", "reason", "제개정이유", body);
  }

  const attach = root["첨부파일"];
  if (attach && typeof attach === "object") {
    const a = attach as Record<string, unknown>;
    const name = str(a["첨부파일명"]);
    const link = str(a["첨부파일링크"]);
    if (name || link) {
      push("attach", "attach", "첨부파일", [name, link].filter(Boolean).join("\n"));
    }
  }

  if (rows.length === 0) {
    push(
      "raw",
      "fallback",
      basic.rule_name_kr || "행정규칙",
      JSON.stringify(parsed).slice(0, 50000),
    );
  }

  return rows;
}
