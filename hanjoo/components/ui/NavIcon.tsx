/** 사이드바용 인라인 SVG — 패키지 추가 없음 */
export function NavIcon({ label }: { label: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (label) {
    case "홈":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "관세율표":
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "분류사례":
      return (
        <svg {...common}>
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
      );
    case "세율":
      return (
        <svg {...common}>
          <path d="M12 3v18M7 8h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8" />
        </svg>
      );
    case "수출입요령":
      return (
        <svg {...common}>
          <path d="M3 7h13l5 5v5a2 2 0 0 1-2 2H3z" />
          <path d="M16 7v5h5" />
        </svg>
      );
    case "관련법령":
      return (
        <svg {...common}>
          <path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M14 3v5h5M8 13h8M8 17h6" />
        </svg>
      );
    case "판례·예규":
      return (
        <svg {...common}>
          <path d="M12 3 4 7v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4z" />
        </svg>
      );
    case "도구":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z" />
        </svg>
      );
    case "게시판":
      return (
        <svg {...common}>
          <path d="M4 5h16v12H8l-4 3V5z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}
