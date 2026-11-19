type InfoCardProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

/** 안내/요약용 라이트 블루 카드 (시안 이용안내 톤) */
export function InfoCard({ title, children, className }: InfoCardProps) {
  const cls = className ? `sl-info-card ${className}` : "sl-info-card";
  return (
    <aside className={cls}>
      {title ? <div className="sl-info-card-hd">{title}</div> : null}
      <div className="sl-info-card-bd">{children}</div>
    </aside>
  );
}
