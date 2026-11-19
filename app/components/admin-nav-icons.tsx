import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = "h-[18px] w-[18px] shrink-0 stroke-current";

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      strokeWidth="1.6"
      className={base}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export type AdminNavIconName =
  | "dashboard"
  | "api"
  | "crawl"
  | "openlaw"
  | "rules"
  | "database"
  | "ai"
  | "chat"
  | "table"
  | "book"
  | "tariff"
  | "cases"
  | "origin"
  | "portal"
  | "gavel"
  | "inquiry"
  | "import"
  | "export"
  /** CAS — 수입/수출 실적 조회 */
  | "importStats"
  | "exportStats"
  /** CAS — 수입/수출 품목마스터 */
  | "importCatalog"
  | "exportCatalog"
  /** CAS — 환급 수입원장 */
  | "ledger"
  | "integration"
  | "json"
  | "list"
  | "history"
  | "guidelines"
  | "settings"
  | "log"
  | "tags";

export function AdminNavIcon({ name }: { name: AdminNavIconName }) {
  switch (name) {
    case "dashboard":
      return (
        <Icon>
          <rect x="3" y="3" width="6" height="6" rx="1" />
          <rect x="11" y="3" width="6" height="6" rx="1" />
          <rect x="3" y="11" width="6" height="6" rx="1" />
          <rect x="11" y="11" width="6" height="6" rx="1" />
        </Icon>
      );
    case "api":
      return (
        <Icon>
          <path d="M4 6.5h12M4 10h8M4 13.5h10" strokeLinecap="round" />
          <path d="M15 9v5" strokeLinecap="round" />
        </Icon>
      );
    case "crawl":
      return (
        <Icon>
          <path d="M10 4v8" strokeLinecap="round" />
          <path d="M7 9l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 15.5h10" strokeLinecap="round" />
        </Icon>
      );
    case "openlaw":
      return (
        <Icon>
          <circle cx="8.5" cy="8.5" r="4.5" />
          <path d="M12.5 12.5L16 16" strokeLinecap="round" />
        </Icon>
      );
    case "rules":
      return (
        <Icon>
          <path
            d="M6 4.5h8l1.5 1.5V15.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
            strokeLinejoin="round"
          />
          <path d="M9 4.5v3h5" strokeLinejoin="round" />
          <path d="M7.5 11h5M7.5 13.5h3.5" strokeLinecap="round" />
        </Icon>
      );
    case "database":
      return (
        <Icon>
          <ellipse cx="10" cy="5.5" rx="5.5" ry="2" />
          <path d="M4.5 5.5V14.5c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V5.5" />
          <path d="M4.5 10c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" />
        </Icon>
      );
    case "ai":
      return (
        <Icon>
          <path d="M10 4.5v2" strokeLinecap="round" />
          <path d="M6.5 6.5 10 10l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 14.5a5 5 0 0 1 10 0" strokeLinecap="round" />
        </Icon>
      );
    case "chat":
      return (
        <Icon>
          <path
            d="M5 5.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H9l-3 2.5V6.5a1 1 0 0 1 1-1Z"
            strokeLinejoin="round"
          />
          <path d="M7.5 9h5M7.5 11h3" strokeLinecap="round" />
        </Icon>
      );
    case "table":
      return (
        <Icon>
          <rect x="4" y="4.5" width="12" height="11" rx="1" />
          <path d="M4 9h12M10 9v6.5" strokeLinecap="round" />
        </Icon>
      );
    case "book":
      return (
        <Icon>
          <path d="M5 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5V15.5H6.5A1.5 1.5 0 0 1 5 14V4.5Z" />
          <path d="M11 6h4.5A1.5 1.5 0 0 1 17 7.5V15.5H11V6Z" />
        </Icon>
      );
    case "tariff":
      return (
        <Icon>
          <path d="M5 14.5V8l5-3.5L15 8v6.5" strokeLinejoin="round" />
          <path d="M8 14.5v-3h4v3" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      );
    case "cases":
      return (
        <Icon>
          <path d="M4 6.5h12M4 10h12M4 13.5h8" strokeLinecap="round" />
          <circle cx="15.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "origin":
      return (
        <Icon>
          <circle cx="10" cy="10" r="5.5" />
          <path d="M4.5 10h11M10 4.5c2 1.8 3 3.8 3 5.5s-1 3.7-3 5.5M10 4.5C8 6.3 7 8.3 7 10s1 3.7 3 5.5" />
        </Icon>
      );
    case "portal":
      return (
        <Icon>
          <path d="M4 8.5 10 4.5l6 4v7.5H4V8.5Z" strokeLinejoin="round" />
          <path d="M8 16v-4h4v4" strokeLinejoin="round" />
        </Icon>
      );
    case "gavel":
      return (
        <Icon>
          <path d="M6 14.5h8" strokeLinecap="round" />
          <path d="m8 12.5-3-3 2-2 3 3" strokeLinejoin="round" />
          <path d="m12 8.5 3-3" strokeLinecap="round" />
        </Icon>
      );
    case "inquiry":
      return (
        <Icon>
          <circle cx="10" cy="10" r="5.5" />
          <path d="M10 7v.5M10 11v2" strokeLinecap="round" />
        </Icon>
      );
    case "import":
      return (
        <Icon>
          <path d="M10 4.5v7" strokeLinecap="round" />
          <path d="M7 8.5 10 11.5 13 8.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 15.5h10" strokeLinecap="round" />
        </Icon>
      );
    case "export":
      return (
        <Icon>
          <path d="M10 11.5V4.5" strokeLinecap="round" />
          <path d="M7 7.5 10 4.5 13 7.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 15.5h10" strokeLinecap="round" />
        </Icon>
      );
    case "importStats":
      return (
        <Icon>
          <path d="M5.5 8.5V12.5M8 6.5v6M10.5 9v3.5" strokeLinecap="round" />
          <path d="M14 6.5v8" strokeLinecap="round" />
          <path d="M14 11.5 16 13.5 14 15.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16.5h12" strokeLinecap="round" />
        </Icon>
      );
    case "exportStats":
      return (
        <Icon>
          <path d="M5.5 9v3.5M8 7v5.5M10.5 8.5v4" strokeLinecap="round" />
          <path d="M14 11.5V6.5" strokeLinecap="round" />
          <path d="M12 6.5 14 4.5 16 6.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16.5h12" strokeLinecap="round" />
        </Icon>
      );
    case "importCatalog":
      return (
        <Icon>
          <path d="M10 5v5.5" strokeLinecap="round" />
          <path d="M7.5 8 10 10.5 12.5 8" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="12.5" y="5.5" width="4.5" height="4.5" rx="0.5" />
          <rect x="12.5" y="11" width="4.5" height="4.5" rx="0.5" />
          <path d="M4 16.5h8" strokeLinecap="round" />
        </Icon>
      );
    case "exportCatalog":
      return (
        <Icon>
          <path d="M10 10.5V5" strokeLinecap="round" />
          <path d="M7.5 7.5 10 5 12.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="5.5" width="4.5" height="4.5" rx="0.5" />
          <rect x="3" y="11" width="4.5" height="4.5" rx="0.5" />
          <path d="M4 16.5h8" strokeLinecap="round" />
        </Icon>
      );
    case "ledger":
      return (
        <Icon>
          <path
            d="M5 5h10a1 1 0 0 1 1 1v3.5H4V6a1 1 0 0 1 1-1Z"
            strokeLinejoin="round"
          />
          <path
            d="M4 9.5h12v4.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z"
            strokeLinejoin="round"
          />
          <path d="M6.5 7h4M6.5 12h7M6.5 14h5" strokeLinecap="round" />
        </Icon>
      );
    case "integration":
      return (
        <Icon>
          <path d="M7 7.5h6M7 12.5h6" strokeLinecap="round" />
          <path d="M10 4.5v11" strokeLinecap="round" />
          <path d="M4.5 10h11" strokeLinecap="round" />
        </Icon>
      );
    case "json":
      return (
        <Icon>
          <path d="M7 6.5c-1.5 0-2.5 1-2.5 2.5v2c0 1.5 1 2.5 2.5 2.5" strokeLinecap="round" />
          <path d="M13 6.5c1.5 0 2.5 1 2.5 2.5v2c0 1.5-1 2.5-2.5 2.5" strokeLinecap="round" />
        </Icon>
      );
    case "list":
      return (
        <Icon>
          <path d="M6 7h8M6 10h8M6 13h5" strokeLinecap="round" />
          <circle cx="4" cy="7" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="4" cy="10" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="4" cy="13" r="0.75" fill="currentColor" stroke="none" />
        </Icon>
      );
    case "history":
      return (
        <Icon>
          <circle cx="10" cy="10" r="5.5" />
          <path d="M10 7v3.5l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      );
    case "guidelines":
      return (
        <Icon>
          <path d="M6 5.5h8v9H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
          <path d="M7.5 9h5M7.5 11.5h3.5" strokeLinecap="round" />
        </Icon>
      );
    case "settings":
      return (
        <Icon>
          <circle cx="10" cy="10" r="2.25" />
          <path
            d="M10 3.5v1.2M10 15.3v1.2M16.5 10h-1.2M4.7 10H3.5M14.6 5.4l-.85.85M6.25 13.75l-.85.85M14.6 14.6l-.85-.85M6.25 6.25l-.85-.85"
            strokeLinecap="round"
          />
        </Icon>
      );
    case "log":
      return (
        <Icon>
          <path d="M5 5.5h10v9H5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
          <path d="M7.5 9h5M7.5 12h3.5" strokeLinecap="round" />
        </Icon>
      );
    case "tags":
      return (
        <Icon>
          <path d="M5 6.5h4l6 6-4 4-6-6V6.5Z" strokeLinejoin="round" />
          <circle cx="8" cy="9" r="1" fill="currentColor" stroke="none" />
        </Icon>
      );
    default:
      return (
        <Icon>
          <circle cx="10" cy="10" r="5.5" />
        </Icon>
      );
  }
}
