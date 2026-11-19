import type { Metadata } from "next";
import "./globals.css";
import "./home.css";
import "./tariff.css";
import "./tariff-rules.css";
import "./import-taxes.css";
import "./duty-modern.css";
import "./fta-rates.css";
/* Common Button — after page CSS so Primary/Outline color wins over legacy button/span rules */
import "@/hanjoo/components/ui/button.css";
import "@/hanjoo/components/ui/page-header.css";
/* Full UI tokens — class-scoped only (no bare button/input/table tags) */
import "@/hanjoo/components/ui/data-table.css";
import "@/hanjoo/components/ui/surface-card.css";
import "@/hanjoo/components/ui/dialog-shell.css";
import "@/hanjoo/components/ui/legal-reader.css";
import "@/hanjoo/components/ui/special-ui.css";

/** 로그인 세션·DB 조회 화면 — 빌드 시 DB 조회(정적 생성) 방지 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart Law — 관세·법령 통합 조회",
  description: "CIEL형 HS·관세율표·법령 포털",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
