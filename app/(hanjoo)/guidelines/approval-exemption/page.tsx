"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import approvalCiel from "@/hanjoo/lib/data/approval-exemption-ciel.json";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Tab = "hub" | "export" | "import";

function lineClass(line: string): string {
  const isHead =
    /^\d+\./.test(line) ||
    /^[가-힣]\./.test(line) ||
    /^\(\d+\)/.test(line) ||
    /^\([가-힣]\)/.test(line) ||
    /^[A-D]\./.test(line);
  return isHead ? "approval-line-head" : "approval-line";
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <div className="approval-ciel-body">
      {lines.map((line, i) => (
        <p key={`${i}-${line.slice(0, 24)}`} className={lineClass(line)}>
          {line}
        </p>
      ))}
    </div>
  );
}

function ApprovalBody() {
  const search = useSearchParams();
  const raw = search.get("tab");
  const tab: Tab = raw === "import" || raw === "export" ? raw : "hub";

  const hub = approvalCiel.hub as
    | { title?: string; sections?: { title?: string; lines?: string[] }[] }
    | undefined;
  const block = tab === "import" ? approvalCiel.import : tab === "export" ? approvalCiel.export : null;
  const detailLines = (block?.lines ?? []).map((line) => String(line).trim()).filter(Boolean);

  return (
    <div className="panel">
      <div className="panel-hd">수출입승인의 면제</div>
      <div className="panel-bd approval-exemption">
        <div className="origin-tabs approval-tabs">
          <Link
            className={tab === "hub" ? "active" : ""}
            href="/guidelines/approval-exemption"
          >
            개요
          </Link>
          <Link
            className={tab === "export" ? "active" : ""}
            href="/guidelines/approval-exemption?tab=export"
          >
            수출승인의 면제
          </Link>
          <Link
            className={tab === "import" ? "active" : ""}
            href="/guidelines/approval-exemption?tab=import"
          >
            수입승인의 면제
          </Link>
        </div>

        {tab === "hub" ? (
          <div className="approval-hub">
            {(hub?.sections ?? []).map((section) => (
              <section key={section.title} className="approval-section">
                <h3>{section.title}</h3>
                <Lines lines={(section.lines ?? []).map(String)} />
              </section>
            ))}
            {!hub?.sections?.length ? (
              <p className="muted">개요 자료가 없습니다.</p>
            ) : null}
          </div>
        ) : (
          <section className="approval-section">
            <h3>{block?.title ?? (tab === "import" ? "수입승인의 면제" : "수출승인의 면제")}</h3>
            <Lines lines={detailLines} />
          </section>
        )}
      </div>
    </div>
  );
}

export default function ApprovalExemptionPage() {
  return (
    <AppShellClient>
      <Suspense
        fallback={
          <div className="panel">
            <div className="panel-bd muted">불러오는 중…</div>
          </div>
        }
      >
        <ApprovalBody />
      </Suspense>
    </AppShellClient>
  );
}
