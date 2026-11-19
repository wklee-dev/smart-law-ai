import {
  formatSystemDevProgress,
  type SystemDevStatusItem,
} from "@/app/shared/system-dev-status-types";

export type SystemDevStatusGridColumn = {
  key: keyof SystemDevStatusItem;
  label: string;
  /** Tailwind min-width (가로 스크롤) */
  minWidth?: string;
  wrap?: boolean;
};

/** 등록 폼과 동일한 관리 항목 전체 */
export const SYSTEM_DEV_STATUS_GRID_COLUMNS: SystemDevStatusGridColumn[] = [
  { key: "year", label: "년도", minWidth: "min-w-[4.5rem]" },
  { key: "taskNo", label: "NO", minWidth: "min-w-[5.5rem]" },
  { key: "systemName", label: "SYSTEM", minWidth: "min-w-[5rem]" },
  { key: "workArea", label: "업무", minWidth: "min-w-[5rem]" },
  { key: "featureType", label: "기능구분", minWidth: "min-w-[5.5rem]" },
  { key: "menuName", label: "메뉴", minWidth: "min-w-[8rem]" },
  { key: "featureName", label: "기능", minWidth: "min-w-[10rem]" },
  {
    key: "featureDetail",
    label: "기능상세",
    minWidth: "min-w-[14rem]",
    wrap: true,
  },
  { key: "requestDept", label: "요청부서", minWidth: "min-w-[6rem]" },
  { key: "requester", label: "요청자", minWidth: "min-w-[5rem]" },
  { key: "devOwner", label: "개발담당", minWidth: "min-w-[5.5rem]" },
  { key: "workFrequency", label: "업무빈도수", minWidth: "min-w-[5.5rem]" },
  { key: "risk", label: "RISK", minWidth: "min-w-[4rem]" },
  { key: "customerRequestLevel", label: "고객요청수준", minWidth: "min-w-[6rem]" },
  { key: "evalScore", label: "평가점수", minWidth: "min-w-[5rem]" },
  { key: "devDifficulty", label: "개발난이도", minWidth: "min-w-[5.5rem]" },
  { key: "priority", label: "우선순위", minWidth: "min-w-[4.5rem]" },
  { key: "requestDate", label: "요청일", minWidth: "min-w-[6.5rem]" },
  { key: "expectedDevDays", label: "예상개발일수", minWidth: "min-w-[5.5rem]" },
  { key: "planStartDate", label: "개발시작예정", minWidth: "min-w-[6.5rem]" },
  { key: "planEndDate", label: "개발종료예정", minWidth: "min-w-[6.5rem]" },
  { key: "actualStartDate", label: "실제개발시작", minWidth: "min-w-[6.5rem]" },
  { key: "actualEndDate", label: "실제개발완료", minWidth: "min-w-[6.5rem]" },
  { key: "testDate", label: "테스트일", minWidth: "min-w-[6.5rem]" },
  { key: "testCompleteDate", label: "테스트완료일", minWidth: "min-w-[6.5rem]" },
  { key: "productionApplyDate", label: "운영적용일", minWidth: "min-w-[6.5rem]" },
  { key: "progress", label: "진척율", minWidth: "min-w-[4.5rem]" },
  { key: "sortOrder", label: "정렬순서", minWidth: "min-w-[4.5rem]" },
  {
    key: "delayReason",
    label: "지연/기타사유",
    minWidth: "min-w-[12rem]",
    wrap: true,
  },
];

export function systemDevStatusCellDisplay(
  item: SystemDevStatusItem,
  key: keyof SystemDevStatusItem,
): string {
  if (key === "progress") return formatSystemDevProgress(item.progress);
  const v = item[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

export function systemDevStatusExportTitle(year: number): string {
  return `${year}년 시스템일정관리`;
}

const EXCEL_FONT_NAME = "맑은 고딕";
const EXCEL_FONT_SIZE = 10;

const EXCEL_COL_MIN_WIDTH: Partial<Record<keyof SystemDevStatusItem, number>> = {
  year: 6,
  taskNo: 9,
  systemName: 7,
  workArea: 9,
  featureType: 9,
  menuName: 14,
  featureName: 20,
  featureDetail: 32,
  requestDept: 10,
  requester: 8,
  devOwner: 9,
  workFrequency: 9,
  risk: 6,
  customerRequestLevel: 10,
  evalScore: 8,
  devDifficulty: 9,
  priority: 7,
  requestDate: 11,
  expectedDevDays: 9,
  planStartDate: 11,
  planEndDate: 11,
  actualStartDate: 11,
  actualEndDate: 11,
  testDate: 11,
  testCompleteDate: 11,
  productionApplyDate: 11,
  progress: 7,
  sortOrder: 7,
  delayReason: 28,
};

/** Excel 열 너비(문자 수) — 한글은 약 1.8배 */
function estimateExcelTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 127 ? 1.8 : 1;
  }
  return w;
}

function excelColumnWidth(
  col: SystemDevStatusGridColumn,
  items: SystemDevStatusItem[],
): number {
  const floor = EXCEL_COL_MIN_WIDTH[col.key] ?? 10;
  let maxW = estimateExcelTextWidth(col.label);
  for (const item of items) {
    const cell = systemDevStatusCellDisplay(item, col.key);
    for (const line of cell.split("\n")) {
      maxW = Math.max(maxW, estimateExcelTextWidth(line));
    }
  }
  return Math.min(48, Math.max(floor, Math.ceil(maxW) + 1));
}

export async function downloadSystemDevStatusExcel(
  items: SystemDevStatusItem[],
  year: number,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const title = systemDevStatusExportTitle(year);
  const colCount = SYSTEM_DEV_STATUS_GRID_COLUMNS.length;
  const headers = SYSTEM_DEV_STATUS_GRID_COLUMNS.map((c) => c.label);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("시스템일정", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: EXCEL_FONT_NAME, size: EXCEL_FONT_SIZE, bold: true };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;

  const headerRow = ws.getRow(2);
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { name: EXCEL_FONT_NAME, size: EXCEL_FONT_SIZE, bold: true };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
  });
  headerRow.height = 18;

  items.forEach((item, rowIdx) => {
    const row = ws.getRow(rowIdx + 3);
    SYSTEM_DEV_STATUS_GRID_COLUMNS.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = systemDevStatusCellDisplay(item, col.key);
      cell.font = { name: EXCEL_FONT_NAME, size: EXCEL_FONT_SIZE };
      cell.alignment = {
        vertical: "top",
        horizontal: col.key === "progress" || col.key === "sortOrder" ? "center" : "left",
        wrapText: Boolean(col.wrap),
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  SYSTEM_DEV_STATUS_GRID_COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = excelColumnWidth(col, items);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `시스템일정관리_${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 인쇄 대화상자 → PDF 저장 */
export function printSystemDevStatusSchedule(
  items: SystemDevStatusItem[],
  year: number,
): void {
  const title = systemDevStatusExportTitle(year);
  const headers = SYSTEM_DEV_STATUS_GRID_COLUMNS.map((c) => c.label);
  const headHtml = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const bodyHtml = items
    .map((item) => {
      const cells = SYSTEM_DEV_STATUS_GRID_COLUMNS.map((col) => {
        const text = systemDevStatusCellDisplay(item, col.key);
        return `<td>${escapeHtml(text).replace(/\n/g, "<br/>")}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  @page { size: landscape; margin: 12mm; }
  body { font-family: "Malgun Gothic", sans-serif; font-size: 10px; color: #111; }
  h1 { font-size: 16px; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; white-space: nowrap; }
  td { word-break: break-word; }
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
<p style="margin:0 0 8px;color:#555;">총 ${items.length}건 · 출력 ${new Date().toLocaleString("ko-KR")}</p>
<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
</body></html>`;

  /** 새 창(`window.open`) 대신 숨김 iframe — 탭·iframe 안에서도 팝업 차단 없음 */
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "시스템일정관리 인쇄");
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(frame);

  const frameWin = frame.contentWindow;
  const frameDoc = frame.contentDocument ?? frameWin?.document;
  if (!frameWin || !frameDoc) {
    frame.remove();
    window.alert("인쇄 준비에 실패했습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
    return;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 500);
  };

  const runPrint = () => {
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      window.alert("인쇄 대화상자를 열지 못했습니다.");
    } finally {
      cleanup();
    }
  };

  if (frameDoc.readyState === "complete") {
    window.setTimeout(runPrint, 100);
  } else {
    frame.onload = () => window.setTimeout(runPrint, 100);
  }
}
