"use client";

import { Button } from "@/hanjoo/components/ui/Button";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

/** 홈 히어로 검색 — 통합검색 API 없음. 기존 관세율표 HSK 숫자 라우팅과 동일(조건 조회) */
export function HomeHeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const digits = q.replace(/\D/g, "");
    if (!digits) {
      router.push("/tariff");
      return;
    }
    const year = "2026";
    if (digits.length <= 2) {
      router.push(`/tariff/chapter?hs=${digits.padStart(2, "0")}&year=${year}`);
    } else if (digits.length <= 4) {
      router.push(`/tariff/heading?hs=${digits.slice(0, 4)}&year=${year}`);
    } else {
      router.push(`/tariff/item?hs=${digits}&year=${year}`);
    }
  }

  return (
    <form className="home-hero-search" onSubmit={onSearch}>
      <select defaultValue="hsk" aria-label="검색구분">
        <option value="hsk">HSK</option>
      </select>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="HSK 코드 입력 (숫자)"
        aria-label="HSK 검색어"
      />
      <Button type="submit" action="lookup" size="medium" className="home-hero-lookup" />
    </form>
  );
}
