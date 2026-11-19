import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import { listLawGuidance } from "@/hanjoo/lib/law-guidance";

export default async function LawGuidancePage() {
  const rows = await listLawGuidance();
  return (
    <AppShellClient>
      <div className="panel">
        <div className="panel-hd">법령별 수출입요령</div>
        <div className="panel-bd">
          <div className="table-scroll">
            <table className="answer-table case-table law-guidance-table">
              <thead>
                <tr>
                  <th>법령</th>
                  <th>수출 요건확인기관</th>
                  <th>수입 요건확인기관</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.law}>
                    <td>{row.law}</td>
                    <td>
                      <AgencyList agencies={row.exportAgencies} />
                    </td>
                    <td>
                      <AgencyList agencies={row.importAgencies} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShellClient>
  );
}

function AgencyList({ agencies }: { agencies: string[] }) {
  if (!agencies.length) return null;
  return (
    <span className="law-agencies">
      {agencies.map((agency) => (
        <span key={agency}>{agency}</span>
      ))}
    </span>
  );
}
