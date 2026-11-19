import { tariffHref, tariffIndexHref } from "@/hanjoo/lib/tariff-links";
import Link from "next/link";

const STEPS = [
  { n: 1, label: "속견표" },
  { n: 2, label: "호" },
  { n: 3, label: "세번" },
  { n: 4, label: "세율" },
] as const;

export function TariffSteps({
  step,
  year,
  chapter,
  heading,
  country = "KR",
}: {
  step: 1 | 2 | 3 | 4;
  year: number;
  chapter?: string;
  heading?: string;
  country?: string;
}) {
  const hrefOf = (n: number): string | null => {
    if (n === 1) return tariffIndexHref(year, country);
    if (n === 2 && chapter) return tariffHref("/tariff/chapter", year, country, { hs: chapter });
    if (n === 3 && heading) return tariffHref("/tariff/heading", year, country, { hs: heading });
    return null;
  };

  return (
    <ol className="step-bar" aria-label="관세율표 조회 단계">
      {STEPS.map((s) => {
        const href = s.n < step ? hrefOf(s.n) : null;
        const cls = s.n === step ? "on" : s.n < step ? "done" : "";
        const text = `${s.n}/4 ${s.label}`;
        return (
          <li key={s.n} className={cls} aria-current={s.n === step ? "step" : undefined}>
            {href ? <Link href={href}>{text}</Link> : <span>{text}</span>}
          </li>
        );
      })}
    </ol>
  );
}
