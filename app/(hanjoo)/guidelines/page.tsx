"use client";

import { AppShellClient } from "@/hanjoo/components/app-shell-client";
import hub from "@/hanjoo/lib/data/iolaw-hub-ciel.json";
import Link from "next/link";

type HubRow = {
  구분: string;
  구분Href?: string;
  관련법령: string[];
  참조: string[];
  참조Href?: string[];
  참조RowSpan?: number;
  참조Skip?: boolean;
};

type HubSummary = {
  title: string;
  href?: string;
  badge?: string;
  lines: string[];
};

const table = hub.table as { columns: string[]; rows: HubRow[] };
const summaries = hub.summaries as HubSummary[];

export default function GuidelinesHubPage() {
  return (
    <AppShellClient>
      <div className="panel">
        <div className="panel-hd">{hub.title}</div>
        <div className="panel-bd case-page guidelines-hub">
          <div className="table-scroll">
            <table className="answer-table case-table guidelines-hub-table">
              <colgroup>
                <col className="gh-cat" />
                <col className="gh-law" />
                <col className="gh-ref" />
              </colgroup>
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.구분}>
                    <td>
                      {row.구분Href ? (
                        <Link href={row.구분Href} className="case-link">
                          <strong>{row.구분}</strong>
                        </Link>
                      ) : (
                        <strong>{row.구분}</strong>
                      )}
                    </td>
                    <td>
                      {row.관련법령.length ? (
                        <ul className="guidelines-hub-list">
                          {row.관련법령.map((law) => (
                            <li key={law}>{law}</li>
                          ))}
                        </ul>
                      ) : (
                        "　"
                      )}
                    </td>
                    {row.참조Skip ? null : (
                      <td rowSpan={row.참조RowSpan && row.참조RowSpan > 1 ? row.참조RowSpan : undefined}>
                        {row.참조.length ? (
                          <ul className="guidelines-hub-list">
                            {row.참조.map((label, index) => {
                              const href = row.참조Href?.[index];
                              return (
                                <li key={label}>
                                  {href ? (
                                    <Link href={href} className="case-link">
                                      {label}
                                    </Link>
                                  ) : (
                                    label
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          "　"
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="guidelines-hub-summaries">
            {summaries.map((item) => (
              <section key={item.title} className="guidelines-hub-summary">
                <h3>
                  {item.href ? (
                    <Link href={item.href} className="case-link">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                  {item.badge ? <span className="guidelines-hub-badge">[{item.badge}]</span> : null}
                </h3>
                {item.lines.map((line) => (
                  <p key={line.slice(0, 40)}>{line}</p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </AppShellClient>
  );
}
