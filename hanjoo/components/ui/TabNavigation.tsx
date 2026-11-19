import Link from "next/link";

export type TabItem = {
  id: string;
  label: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

type TabNavigationProps = {
  tabs: TabItem[];
  className?: string;
  "aria-label"?: string;
};

/** 공통 탭 — 기존 case-tabs 비주얼과 호환 */
export function TabNavigation({ tabs, className, "aria-label": ariaLabel }: TabNavigationProps) {
  const cls = className ? `sl-tabs case-tabs ${className}` : "sl-tabs case-tabs";
  return (
    <nav className={cls} aria-label={ariaLabel ?? "탭"}>
      {tabs.map((tab) => {
        const on = tab.active ? " on" : "";
        if (tab.href) {
          return (
            <Link key={tab.id} href={tab.href} className={on.trim() || undefined}>
              {tab.label}
            </Link>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            className={on.trim() || undefined}
            onClick={tab.onClick}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
