import Image from "next/image";

/** 사이드바 등 소형 영역용 — HANJOO 상징(막대)만 잘라 표시 */
export function HanjooLogoMark({ className }: { className?: string }) {
  return (
    <div
      className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-lg ${className ?? ""}`}
    >
      <Image
        src="/hanjoo-logo-light.svg"
        alt="HANJOO"
        width={91}
        height={112}
        priority
        className="absolute left-1/2 top-0 h-[3.35rem] w-auto max-w-none -translate-x-1/2"
      />
    </div>
  );
}
