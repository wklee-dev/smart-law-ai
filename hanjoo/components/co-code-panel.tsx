import type { CoBasis, CoForm } from "@/hanjoo/lib/fta-co-codes";

const BASIS_LABEL: Record<CoBasis, string> = {
  WO: "완전생산",
  PE: "원산지재료로만 생산",
  PSR: "품목별 원산지결정기준(PSR) 충족",
  GENERAL: "협정 일반기준 충족",
  SPECIAL: "특례·예외 규정",
  OTHER: "그 밖의 기준",
};

function statusLabel(status: string): string {
  return status === "verified" ? "원문 확인" : "확인 필요";
}

/** 원산지증명서 기재부호 후보. 실제 부호는 원산지판정 결과에 따르므로 확정 표시하지 않는다. */
export function CoCodePanel({ co, rule, title }: { co?: CoForm; rule?: string; title?: string }) {
  const heading = title ? `원산지증명서 기재부호 — ${title}` : "원산지증명서 기재부호";
  if (!co) {
    return (
      <section className="co-code-panel">
        <h4>{heading}</h4>
        <p className="muted">확인 필요 — 이 협정의 원산지증명서 서식 자료가 없습니다.</p>
      </section>
    );
  }
  return (
    <section className="co-code-panel">
      <h4>{heading}</h4>
      <table className="fta-mini co-code-meta">
        <tbody>
          <tr>
            <th>서식</th>
            <td>
              {co.title}
              {co.formNo ? ` (${co.legalBasis} ${co.formNo}${co.revision ? `, ${co.revision}` : ""})` : ""}
            </td>
          </tr>
          <tr>
            <th>기재란</th>
            <td>{co.field || "—"}</td>
          </tr>
          {rule ? (
            <tr>
              <th>관련 원산지결정기준</th>
              <td>{rule}</td>
            </tr>
          ) : null}
          <tr>
            <th>원산지판정</th>
            <td>미판정 — HS 조회만으로는 기재부호가 확정되지 않습니다.</td>
          </tr>
          <tr>
            <th>검증상태</th>
            <td className={co.status === "verified" ? undefined : "co-warn"}>{statusLabel(co.status)}</td>
          </tr>
          <tr>
            <th>공식 출처</th>
            <td>
              {co.sourceUrl ? (
                <a href={co.sourceUrl} target="_blank" rel="noreferrer">
                  관세청 FTA 포털 원산지증명서 서식
                </a>
              ) : (
                "확인 필요"
              )}
              {co.sourceFile ? ` · ${co.sourceFile}` : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {co.method === "declaration" ? (
        <p className="muted">이 협정은 송품장 등 상업서류에 원산지신고 문안을 기재하는 방식으로, 원산지기준 기재부호가 없습니다.</p>
      ) : null}

      {co.codes.length ? (
        <table className="fta-mini co-code-table">
          <thead>
            <tr>
              <th>기재부호</th>
              <th>부호 적용조건</th>
              <th>구분</th>
              <th>검증</th>
            </tr>
          </thead>
          <tbody>
            {co.codes.map((item, index) => (
              <tr key={`${item.code}-${index}`} className={item.basis === "PSR" ? "psr" : undefined}>
                <td className="code">{item.code || "확인 필요"}</td>
                <td className="wrap">{item.meaning}</td>
                <td>{BASIS_LABEL[item.basis]}</td>
                <td className={item.status === "verified" ? undefined : "co-warn"}>
                  {statusLabel(item.status)}
                  {item.page ? ` (p.${item.page})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {co.extras.length ? (
        <table className="fta-mini co-code-table">
          <thead>
            <tr>
              <th>관련 기재란</th>
              <th colSpan={3}>기재방법</th>
            </tr>
          </thead>
          <tbody>
            {co.extras.map((item) => (
              <tr key={item.field}>
                <td>{item.field}</td>
                <td colSpan={3} className="wrap">
                  {item.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {co.notes.map((note) => (
        <p key={note} className="fta-foot">
          ※ {note}
        </p>
      ))}
      <p className="fta-foot">
        ※ 같은 HS라도 물품이 실제 충족한 기준에 따라 부호가 달라집니다. 강조된 행은 품목별 원산지결정기준(PSR)을 충족한 경우의 후보입니다.
      </p>
    </section>
  );
}
