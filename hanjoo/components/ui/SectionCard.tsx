type SectionCardProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

/** panel과 동일 비주얼의 재사용 카드 (데이터/로직 없음) */
export function SectionCard({ title, children, className }: SectionCardProps) {
  const cls = className ? `sl-card ${className}` : "sl-card";
  return (
    <section className={cls}>
      {title ? <div className="sl-card-hd">{title}</div> : null}
      <div className="sl-card-bd">{children}</div>
    </section>
  );
}
