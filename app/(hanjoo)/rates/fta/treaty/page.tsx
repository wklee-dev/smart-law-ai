import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { loadFtaTreaty } from "@/hanjoo/lib/fta-treaty";
import Link from "next/link";

export default async function FtaTreatyPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; part?: string }>;
}) {
  const query = await searchParams;
  const code = query.code?.trim() ?? "";
  const treaty = code ? await loadFtaTreaty(code, query.part?.trim() ?? "") : null;
  const many = (treaty?.parts.length ?? 0) > 1;

  return (
    <AppShellClient>
      <div className="crumb">
        <Link href="/">HOME</Link> › <Link href="/rates/fta">FTA협정관세</Link> › 협정문
      </div>
      <section className="panel">
        <div className="panel-hd">{treaty?.name || "협정문"}</div>
        <div className="panel-bd">
          {!treaty ? <p className="muted">저장된 협정문이 없습니다.</p> : null}
          {treaty ? (
            <>
              <p className="fta-treaty-meta">
                {[treaty.number, treaty.effect ? `발효 ${treaty.effect}` : ""].filter(Boolean).join(" · ")}
              </p>
              {treaty.lang === "EN" ? (
                <p className="fta-treaty-meta">국문 본문이 없어 영문 협정문을 표시합니다.</p>
              ) : null}
              <div className={many ? "fta-treaty" : "fta-treaty single"}>
                {many ? (
                  <aside className="year-side">
                    <div className="year-side-hd">협정문</div>
                    {treaty.parts.map((part) => (
                      <Link
                        key={part.id}
                        href={`/rates/fta/treaty?code=${encodeURIComponent(treaty.code)}&part=${encodeURIComponent(part.id)}`}
                        className={part.id === treaty.partId ? "on" : ""}
                      >
                        {part.title}
                      </Link>
                    ))}
                  </aside>
                ) : null}
                <p className="fta-treaty-body">{treaty.body || "본문 텍스트가 없습니다."}</p>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </AppShellClient>
  );
}
