import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = "h-4 w-4 shrink-0";

export function SlIconSearch(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M13 13l3.25 3.25" strokeLinecap="round" />
    </svg>
  );
}

export function SlIconReset(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M4.5 5.5V2.5M4.5 5.5H7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5 10a5 5 0 1 0 1.46-3.54"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SlIconExcel(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path
        d="M4 3.5h8l4 4V16.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        strokeLinejoin="round"
      />
      <path d="M12 3.5V7h4" strokeLinejoin="round" />
      <path d="M7 10.5l2 3-2 3M11 10.5l-2 3 2 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SlIconDownload(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M10 3.5v9" strokeLinecap="round" />
      <path d="M6.5 9 10 12.5 13.5 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 16.5h11" strokeLinecap="round" />
    </svg>
  );
}

export function SlIconSave(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path
        d="M4.5 4.5h9l2 2v9a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"
        strokeLinejoin="round"
      />
      <path d="M7 4.5v4h6v-4" strokeLinejoin="round" />
      <path d="M7 14.5h6" strokeLinecap="round" />
    </svg>
  );
}

export function SlIconClose(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M5 5l10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}

export function SlIconPlus(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
    </svg>
  );
}

export function SlIconRefresh(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path
        d="M16.5 6.5V3.5M16.5 6.5H13.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 10a5 5 0 1 1-1.46-3.54L16.5 6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 13.5V16.5M3.5 13.5H6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 10a5 5 0 1 1 1.46 3.54L3.5 13.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 일괄 가져오기 — 다운로드/수집 */
export function SlIconImport(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M10 3.5v8" strokeLinecap="round" />
      <path d="M7 8.5 10 11.5 13 8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M4.5 14.5h11a1 1 0 0 0 1-1v-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** OPEN API 수집 — 클라우드/DB */
export function SlIconCollect(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path
        d="M5.5 14.5a4 4 0 0 1 9 0"
        strokeLinecap="round"
      />
      <path
        d="M10 4.5a3 3 0 0 1 0 6 3 3 0 0 1 0-6Z"
        strokeLinejoin="round"
      />
      <path d="M10 10.5v2" strokeLinecap="round" />
      <path d="M8.5 12h3" strokeLinecap="round" />
    </svg>
  );
}

/** 일괄 처리 — 스택 */
export function SlIconBatch(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M4 6.5h12M4 10h12M4 13.5h12" strokeLinecap="round" />
      <path d="M6.5 4.5v11M13.5 4.5v11" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** API 호출 — 실행 */
export function SlIconPlay(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path
        d="M7.5 5.5v9l7-4.5-7-4.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 상세 더보기 — 돋보기 + */
export function SlIconSearchPlus(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="M13 13l3.25 3.25" strokeLinecap="round" />
      <path d="M8.75 6.25v5M6.25 8.75h5" strokeLinecap="round" />
    </svg>
  );
}

export function SlIconTrash(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={base}
      aria-hidden
      {...props}
    >
      <path d="M4.5 6.5h11" strokeLinecap="round" />
      <path
        d="M8 6.5V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 6.5l.5 9a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-9"
        strokeLinejoin="round"
      />
    </svg>
  );
}
