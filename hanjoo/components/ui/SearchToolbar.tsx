"use client";

import { FormEvent, ReactNode } from "react";
import "./search-toolbar.css";

export type SearchToolbarVariant = "chrome" | "panel" | "compact";

type SearchToolbarProps = {
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  className?: string;
  /**
   * chrome — SiteChrome 상단 `.search-bar` (기존 호환)
   * panel — 업무 화면 검색 카드 (White)
   * compact — HS비교 등 좁은 조건 바
   */
  variant?: SearchToolbarVariant;
  /** GET 목록 검색 등 — 기본 미지정(POST 아님, 핸들러 주도) */
  method?: "get" | "post";
  action?: string;
};

/** 공통 검색조건 툴바 — 자식 input/select/Button 구조·이벤트 유지 */
export function SearchToolbar({
  onSubmit,
  children,
  className,
  variant = "chrome",
  method,
  action,
}: SearchToolbarProps) {
  const classes = [
    variant === "chrome" ? "search-bar" : "sl-search-toolbar",
    variant === "panel" ? "sl-search-toolbar--panel" : "",
    variant === "compact" ? "sl-search-toolbar--compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form className={classes} method={method} action={action} onSubmit={onSubmit}>
      {children}
    </form>
  );
}
