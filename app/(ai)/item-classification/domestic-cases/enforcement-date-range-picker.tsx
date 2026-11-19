"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 시행일자 선택 가능 최소 연도 (국내·외국 사례 공통) */
const MIN_YEAR = 1988;

/** 이중 달력 가로·대략적인 높이(뷰포트 배치용) */
const POPUP_MAX_WIDTH_PX = 500;
const POPUP_EST_HEIGHT_PX = 248;

function clampYearMonth(year: number, month0: number): [number, number] {
  const cy = new Date().getFullYear();
  const maxY = cy + 5;
  let y = year;
  let m = month0;
  if (y < MIN_YEAR) {
    y = MIN_YEAR;
    m = 0;
  }
  if (y > maxY) {
    y = maxY;
    m = 11;
  }
  if (m < 0) m = 0;
  if (m > 11) m = 11;
  return [y, m];
}

function isBeforeMinDay(d: Date): boolean {
  return (
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) <
    Date.UTC(MIN_YEAR, 0, 1)
  );
}

function padLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(iso: string): Date | null {
  const t = iso.trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayOrder(a: Date, b: Date): number {
  const ax = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bx = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  if (ax < bx) return -1;
  if (ax > bx) return 1;
  return 0;
}

function addMonths(year: number, month0: number, delta: number): [number, number] {
  const d = new Date(year, month0 + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}

function calendarCells(year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1);
  const pad = first.getDay();
  const start = new Date(year, month0, 1 - pad);
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const c = new Date(start);
    c.setDate(start.getDate() + i);
    out.push(c);
  }
  return out;
}

function orderedRangeInclusive(
  draftStart: Date,
  draftEnd: Date | null,
): [Date, Date] {
  if (!draftEnd) return [draftStart, draftStart];
  return dayOrder(draftStart, draftEnd) <= 0
    ? [draftStart, draftEnd]
    : [draftEnd, draftStart];
}

function computeFixedPosition(anchorRect: DOMRect): {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
} {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(POPUP_MAX_WIDTH_PX, vw - 2 * margin);

  let left = anchorRect.left;
  if (left + width > vw - margin) left = vw - width - margin;
  if (left < margin) left = margin;

  let top = anchorRect.bottom + margin;
  const spaceBelow = vh - top - margin;
  const spaceAbove = anchorRect.top - margin;

  if (
    spaceBelow < POPUP_EST_HEIGHT_PX &&
    spaceAbove > spaceBelow
  ) {
    top = anchorRect.top - margin - POPUP_EST_HEIGHT_PX;
  }
  if (top < margin) top = margin;

  const maxHeight = Math.max(160, vh - top - margin);

  return { top, left, width, maxHeight };
}

/** 일요일 시작, 좌측 시작일·우측 종료일 이중 달력 */
export function EnforcementDateRangePicker(props: {
  from: string;
  to: string;
  onConfirm: (from: string, to: string) => void;
}) {
  const { from, to, onConfirm } = props;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  /** 팝업 내부 임시 구간 선택 */
  const [draftStart, setDraftStart] = useState<Date | null>(null);
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  /** 좌우 패널이 보여줄 년·월 */
  const [monthLeftYM, setMonthLeftYM] = useState<[number, number]>(() => {
    const d = parseYmd(from) ?? new Date();
    return [d.getFullYear(), d.getMonth()];
  });
  const [monthRightYM, setMonthRightYM] = useState<[number, number]>(() => {
    const a = parseYmd(to);
    const b = parseYmd(from);
    if (a && b && dayOrder(b, a) <= 0) {
      const n = addMonths(a.getFullYear(), a.getMonth(), -1);
      return n;
    }
    const base = a ?? b ?? new Date();
    return [base.getFullYear(), base.getMonth()];
  });

  const [popupBox, setPopupBox] = useState(() => ({
    top: 0,
    left: 0,
    width: POPUP_MAX_WIDTH_PX,
    maxHeight: 320,
  }));

  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const lbl = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePopupPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setPopupBox(computeFixedPosition(el.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePopupPosition();
  }, [open, updatePopupPosition]);

  useEffect(() => {
    if (!open) return;
    updatePopupPosition();
    const handler = () => updatePopupPosition();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updatePopupPosition]);

  useEffect(() => {
    function onPointerDown(ev: MouseEvent) {
      if (!open) return;
      const t = ev.target as Node | null;
      if (!t) return;
      if (
        wrapRef.current?.contains(t) ||
        popupRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const openPopover = () => {
    const a = parseYmd(from);
    const b = parseYmd(to);
    if (a && b) {
      if (dayOrder(a, b) <= 0) {
        setDraftStart(a);
        setDraftEnd(b);
      } else {
        setDraftStart(b);
        setDraftEnd(a);
      }
      setMonthLeftYM([a.getFullYear(), a.getMonth()]);
      setMonthRightYM([b.getFullYear(), b.getMonth()]);
    } else if (a) {
      setDraftStart(a);
      setDraftEnd(a);
      setMonthLeftYM([a.getFullYear(), a.getMonth()]);
      setMonthRightYM([a.getFullYear(), a.getMonth()]);
      onConfirm(padLocal(a), padLocal(a));
    } else if (b) {
      setDraftStart(b);
      setDraftEnd(b);
      setMonthLeftYM([b.getFullYear(), b.getMonth()]);
      setMonthRightYM([b.getFullYear(), b.getMonth()]);
      onConfirm(padLocal(b), padLocal(b));
    } else {
      /** 빈 값이면 당일~당일로 표시 */
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const today = padLocal(now);
      setDraftStart(now);
      setDraftEnd(now);
      setMonthLeftYM([y, m]);
      setMonthRightYM([y, m]);
      onConfirm(today, today);
    }
    setOpen(true);
  };

  const applyDraftToParent = (start: Date | null, end: Date | null) => {
    if (!start && !end) return;
    const startCell = start ?? end!;
    const endCell = end ?? start!;
    let lo = startCell;
    let hi = endCell;
    if (dayOrder(lo, hi) > 0) {
      const x = lo;
      lo = hi;
      hi = x;
    }
    onConfirm(padLocal(lo), padLocal(hi));
  };

  const onPickDay = (d: Date, side: PanelSide) => {
    if (side === "L") {
      setDraftStart(d);
      applyDraftToParent(d, draftEnd ?? d);
      return;
    }
    setDraftEnd(d);
    applyDraftToParent(draftStart ?? d, d);
  };

  const doConfirm = () => {
    if (!draftStart && !draftEnd) {
      setOpen(false);
      return;
    }
    const startCell = draftStart ?? draftEnd!;
    const endCell = draftEnd ?? draftStart!;
    let a = startCell;
    let b = endCell;
    if (dayOrder(a, b) > 0) {
      const x = a;
      a = b;
      b = x;
    }
    onConfirm(padLocal(a), padLocal(b));
    setOpen(false);
  };

  const years = () => {
    const cy = new Date().getFullYear();
    const out: number[] = [];
    for (let y = MIN_YEAR; y <= cy + 5; y++) out.push(y);
    return out;
  };

  const inDraftRange = (d: Date): boolean => {
    if (!draftStart && !draftEnd) return false;
    const start = draftStart ?? draftEnd!;
    const end = draftEnd ?? draftStart!;
    const [lo, hi] = orderedRangeInclusive(start, end);
    return dayOrder(d, lo) >= 0 && dayOrder(d, hi) <= 0;
  };

  const isDraftEdge = (d: Date): boolean => {
    if (!draftStart && !draftEnd) return false;
    const start = draftStart ?? draftEnd!;
    const end = draftEnd ?? draftStart!;
    const [lo, hi] = orderedRangeInclusive(start, end);
    return sameDay(d, lo) || sameDay(d, hi);
  };

  /** 표시 문자열용 (YYYY-MM-DD) */
  const displayFrom = from.trim() ? from.trim() : "—";
  const displayTo = to.trim() ? to.trim() : "—";

  type PanelSide = "L" | "R";

  /** `w-full` 없이 flex 행에서 균등 분배 (다른 조회 필드와 동일 테두리 톤) */
  const readonlyInputClass =
    "min-w-0 max-w-[7.25rem] flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-slate-900 shadow-inner cursor-default focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200";

  const MonthPanel = (side: PanelSide, title: string) => {
    const raw = side === "L" ? monthLeftYM : monthRightYM;
    const [year, mo0] = clampYearMonth(raw[0], raw[1]);
    const setYm = side === "L" ? setMonthLeftYM : setMonthRightYM;
    const cells = calendarCells(year, mo0);

    const navPrevYear = () => {
      setYm(clampYearMonth(...addMonths(year, mo0, -12)));
    };
    const navNextYear = () => {
      setYm(clampYearMonth(...addMonths(year, mo0, 12)));
    };
    const navPrevMonth = () => setYm(clampYearMonth(...addMonths(year, mo0, -1)));
    const navNextMonth = () => setYm(clampYearMonth(...addMonths(year, mo0, 1)));

    return (
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-center text-[10px] font-semibold text-slate-600">
          {title}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-0.5 text-slate-600">
          <button
            type="button"
            className="rounded px-0.5 text-[10px] hover:bg-slate-100"
            onClick={navPrevYear}
            aria-label="이전 년도"
          >
            «
          </button>
          <button
            type="button"
            className="rounded px-0.5 text-[10px] hover:bg-slate-100"
            onClick={navPrevMonth}
            aria-label="이전 달"
          >
            ‹
          </button>
          <select
            className="max-w-[3.5rem] shrink rounded border border-slate-300 bg-white py-0.5 text-[10px] leading-tight"
            value={year}
            onChange={(e) =>
              setYm(clampYearMonth(Number(e.target.value), mo0))
            }
            aria-label="년 선택"
          >
            {years().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className="max-w-[2.75rem] shrink rounded border border-slate-300 bg-white py-0.5 text-[10px] leading-tight"
            value={mo0}
            onChange={(e) =>
              setYm([year, Number(e.target.value)])
            }
            aria-label="월 선택"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded px-0.5 text-[10px] hover:bg-slate-100"
            onClick={navNextMonth}
            aria-label="다음 달"
          >
            ›
          </button>
          <button
            type="button"
            className="rounded px-0.5 text-[10px] hover:bg-slate-100"
            onClick={navNextYear}
            aria-label="다음 년도"
          >
            »
          </button>
        </div>
        <div className="grid grid-cols-7 gap-px text-[10px]">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="pb-0.5 text-center font-semibold text-slate-500"
            >
              {w}
            </div>
          ))}
          {cells.map((cell, idx) => {
            const sun = cell.getDay() === 0;
            const sat = cell.getDay() === 6;
            const outer = cell.getMonth() !== mo0;
            const tooEarly = isBeforeMinDay(cell);
            const inRg =
              !tooEarly && (draftStart || draftEnd)
                ? inDraftRange(cell)
                : false;
            const edge =
              !tooEarly && (draftStart || draftEnd)
                ? isDraftEdge(cell)
                : false;
            let dayColor = "text-slate-800";
            if (tooEarly) dayColor = "text-slate-300";
            else if (sun) dayColor = outer ? "text-red-400" : "text-red-600";
            else if (sat) dayColor = outer ? "text-blue-400" : "text-blue-600";
            else if (outer) dayColor = "text-slate-500";
            return (
              <button
                key={`${side}-${idx}`}
                type="button"
                disabled={tooEarly}
                onClick={() => {
                  if (!tooEarly) onPickDay(cell, side);
                }}
                className={[
                  "flex h-6 items-center justify-center rounded-sm text-[10px] leading-none transition-colors",
                  dayColor,
                  tooEarly
                    ? "cursor-not-allowed opacity-40"
                    : "hover:bg-rose-100/80",
                  inRg ? "bg-rose-50" : "",
                  edge ? "ring-1 ring-red-400/90 ring-offset-0" : "",
                  outer && !tooEarly ? "opacity-80" : "",
                ].join(" ")}
              >
                {cell.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [open]);

  const popupNode =
    open &&
    mounted &&
    createPortal(
      <div
        ref={popupRef}
        role="dialog"
        aria-modal="false"
        className="fixed z-[280] flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white p-2 shadow-xl"
        style={{
          top: popupBox.top,
          left: popupBox.left,
          width: popupBox.width,
          maxHeight: popupBox.maxHeight,
          boxSizing: "border-box",
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
          <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain max-[479px]:flex-col sm:flex-row sm:divide-x sm:divide-slate-200">
            <div className="min-w-0 flex-1 shrink-0 pr-2 sm:max-w-[50%] sm:pr-3">
              {MonthPanel("L", "시작일자")}
            </div>
            <div className="min-w-0 flex-1 shrink-0 sm:max-w-[50%] sm:pl-0">
              {MonthPanel("R", "종료일자")}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-1.5">
            <p className="hidden text-[9px] leading-tight text-slate-500 sm:inline sm:max-w-[58%]">
              왼쪽 달력에서 시작일, 오른쪽 달력에서 종료일을 선택한 뒤 확인을
              누르세요.
            </p>
            <button
              type="button"
              className="ml-auto shrink-0 rounded bg-[#1e2f4f] px-3 py-1 text-xs font-semibold text-white hover:bg-[#162438]"
              onClick={doConfirm}
            >
              확인
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div ref={wrapRef} className="relative w-full">
      <span id={lbl} className="sr-only">
        시행일자 시작·종료
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="text"
          readOnly
          className={`${readonlyInputClass} cursor-pointer`}
          aria-labelledby={lbl}
          value={displayFrom}
          onClick={openPopover}
        />
        <span className="shrink-0 text-slate-400">~</span>
        <input
          type="text"
          readOnly
          className={`${readonlyInputClass} cursor-pointer`}
          aria-labelledby={lbl}
          value={displayTo}
          onClick={openPopover}
        />
        <button
          type="button"
          onClick={openPopover}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#1e2f4f] bg-[#1e2f4f]/10 text-[#1e2f4f] shadow-sm hover:bg-[#1e2f4f]/20 print:hidden"
          title="달력으로 기간 선택"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>

      {popupNode}
    </div>
  );
}
