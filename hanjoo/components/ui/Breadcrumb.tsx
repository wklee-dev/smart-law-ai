import Link from "next/link";

export type Crumb = { href?: string; label: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav className="site-crumb" aria-label="경로">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="site-crumb-item">
            {index > 0 ? <span className="sep" aria-hidden>›</span> : null}
            {!last && item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={last ? "current" : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
