"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function RedirectInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const hs = (sp.get("hs") ?? "").replace(/\D/g, "");
  const year = sp.get("year") ?? "2026";

  useEffect(() => {
    if (hs.length <= 2) {
      router.replace(`/tariff/chapter?hs=${(hs || "01").padStart(2, "0")}&year=${year}`);
    } else if (hs.length <= 4) {
      router.replace(`/tariff/heading?hs=${hs.slice(0, 4)}&year=${year}`);
    } else {
      router.replace(`/tariff/item?hs=${hs}&year=${year}`);
    }
  }, [hs, year, router]);

  return <p className="muted">관세율 단계로 이동 중…</p>;
}

export default function TariffTreeRedirect() {
  return (
    <Suspense fallback={<div className="site-main muted">이동 중…</div>}>
      <RedirectInner />
    </Suspense>
  );
}
