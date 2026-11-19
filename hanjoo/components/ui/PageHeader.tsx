type PageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  /**
   * default — 히어로형 (기존)
   * compact — 업무 포털용 한 줄~두 줄 헤더 (중복 설명·큰 카드 회피)
   */
  variant?: "default" | "compact";
};

/** 공통 페이지 상단 — default 호환 유지, compact는 밀도 우선 */
export function PageHeader({
  title,
  description,
  children,
  className,
  variant = "default",
}: PageHeaderProps) {
  const classes = [
    "sl-page-header",
    variant === "compact" ? "sl-page-header--compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={classes}>
      <div className="sl-page-header__main">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="sl-page-header__extra">{children}</div> : null}
    </header>
  );
}
