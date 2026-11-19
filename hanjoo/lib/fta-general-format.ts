const ENUM = "가나다라마바사아자차카타파하";

export type LawRow = { name: string; cite: string };

export type PrincipleItem = {
  level: number;
  marker: string;
  text: string;
  cites: string[];
  tags: string[];
  notes: { text: string; tags: string[] }[];
  stamp: { body: string; sign: string } | null;
  children: PrincipleItem[];
};

export type GeneralView =
  | { kind: "laws"; no: string; title: string; rows: LawRow[] }
  | { kind: "contact"; no: string; title: string; org: string; phone: string }
  | { kind: "articles"; no: string; title: string; basis: string; items: PrincipleItem[] };

const MARKER =
  /(?:^|(?<=\s))(?:([가나다라마바사아자차카타파하])\.|\((\d+)\)|\(([가나다라마바사아자차카타파하])\)|※)(?=\s)/g;

export function formatFtaGeneral(heading: string, content: string): GeneralView {
  const { no, title } = splitHeading(heading);
  const text = content.replace(/\s+/g, " ").trim();
  const laws = parseLaws(text);
  if (laws) return { kind: "laws", no, title, rows: laws };
  const contact = parseContact(text);
  if (contact) return { kind: "contact", no, title, org: contact.org, phone: contact.phone };
  const { basis, rest } = takeBasis(text);
  return { kind: "articles", no, title, basis, items: nest(splitMarked(rest)) };
}

function splitHeading(heading: string): { no: string; title: string } {
  const m = heading.trim().match(/^(\d+)\.\s*(.+)$/);
  if (!m) return { no: "", title: heading.trim() };
  return { no: m[1], title: m[2].trim() };
}

function parseLaws(content: string): LawRow[] | null {
  const rows: LawRow[] = [];
  for (const m of content.matchAll(/([^[\]]+?)\s*\[([^\]]+)\]/g)) {
    const name = m[1].trim();
    if (name) rows.push({ name, cite: m[2].trim() });
  }
  if (rows.length < 2) return null;
  const rebuilt = rows.map((r) => `${r.name} [${r.cite}]`).join(" ");
  if (content.replace(/\s+/g, "") !== rebuilt.replace(/\s+/g, "")) return null;
  return rows;
}

function parseContact(content: string): { org: string; phone: string } | null {
  const t = content.replace(/^:\s*/, "");
  const m = t.match(/^(.+?),\s*(\d{2,4}-\d{3,4}-\d{4})$/);
  if (!m) return null;
  return { org: m[1].trim(), phone: m[2] };
}

function takeBasis(text: string): { basis: string; rest: string } {
  const m = text.match(/^\(([^)]+)\)\s*/);
  if (!m || !/(법|시행|고시|규칙|령)/.test(m[1])) return { basis: "", rest: text };
  return { basis: m[1].trim(), rest: text.slice(m[0].length) };
}

type Raw = { level: number; marker: string; body: string };

function splitMarked(text: string): Raw[] {
  const marks: { index: number; len: number; level: number; marker: string }[] = [];
  for (const m of text.matchAll(MARKER)) {
    let level = 9;
    let marker = "※";
    if (m[1] && ENUM.includes(m[1])) {
      level = 1;
      marker = m[1];
    } else if (m[2]) {
      level = 2;
      marker = m[2];
    } else if (m[3] && ENUM.includes(m[3])) {
      level = 3;
      marker = m[3];
    }
    marks.push({ index: m.index, len: m[0].length, level, marker });
  }
  if (marks.length === 0) {
    const body = text.trim();
    return body ? [{ level: 1, marker: "", body }] : [];
  }
  const out: Raw[] = [];
  const pre = text.slice(0, marks[0].index).trim();
  if (pre) out.push({ level: 1, marker: "", body: pre });
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i].len;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    out.push({ level: marks[i].level, marker: marks[i].marker, body: text.slice(start, end).trim() });
  }
  return out;
}

function nest(parts: Raw[]): PrincipleItem[] {
  const roots: PrincipleItem[] = [];
  const stack: PrincipleItem[] = [];
  for (const part of parts) {
    if (part.level === 9) {
      const parent = stack[stack.length - 1];
      const note = peelTags(part.body);
      if (parent) parent.notes.push(note);
      continue;
    }
    const item = toItem(part);
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) stack.pop();
    if (stack.length === 0) roots.push(item);
    else stack[stack.length - 1].children.push(item);
    stack.push(item);
  }
  return roots;
}

function toItem(part: Raw): PrincipleItem {
  const peeled = peelStamp(part.body);
  const tagged = peelTags(peeled.text);
  const cites: string[] = [];
  const text = tagged.text
    .replace(/\((법|시행령|시행규칙|고시)\s[^)]+\)/g, (all) => {
      cites.push(all.slice(1, -1));
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    level: part.level,
    marker: part.marker,
    text,
    cites,
    tags: tagged.tags,
    notes: [],
    stamp: peeled.stamp,
    children: [],
  };
}

function peelTags(body: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = body
    .replace(/<([^>]+)>/g, (_, inner: string) => {
      const tag = inner.trim();
      if (tag) tags.push(tag);
      return " ";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, tags };
}

function peelStamp(text: string): { text: string; stamp: { body: string; sign: string } | null } {
  const at = text.indexOf("본 사본이");
  if (at < 0) return { text, stamp: null };
  let raw = text.slice(at).trim();
  const sign = raw.match(/수입자\s*OOO\s*서명\s*$/);
  let signText = "";
  if (sign && sign.index !== undefined) {
    signText = sign[0].replace(/\s+/g, " ").trim();
    raw = raw.slice(0, sign.index).trim();
  }
  return { text: text.slice(0, at).trim(), stamp: { body: raw, sign: signText } };
}

export function markerLabel(item: PrincipleItem): string {
  if (!item.marker) return "";
  if (item.level === 2) return `(${item.marker})`;
  if (item.level === 3) return `(${item.marker})`;
  return `${item.marker}.`;
}
