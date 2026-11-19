import { groupTariffRates, parseDomesticTax, type RateRow } from "@/hanjoo/lib/tariff-rate-groups";
import { formatHs } from "@/hanjoo/lib/hs-format";

type ItemBits = {
  hs_code: string;
  item_name: string;
  item_name_en: string;
  origin: string;
  unit_weight: string;
  unit_qty: string;
  basic_rate: string;
  reduction: string;
  simple_refund: string;
};

function RateLines({
  rows,
}: {
  rows: { key: string; name: string; value: string }[];
}) {
  if (rows.length === 0) return <span className="muted">—</span>;
  return (
    <ul className="rate-lines">
      {rows.map((r) => (
        <li key={r.key}>
          <span>{r.name}</span>
          <b>{r.value || "—"}</b>
        </li>
      ))}
    </ul>
  );
}

export type DomesticTaxRecord = {
  category: string;
  rate: string;
  code: string;
  basePrice: string;
  ruralYn: string;
  period: string;
};

export function TariffRateSheet({
  item,
  rates,
  domesticTax = [],
}: {
  item: ItemBits;
  rates: RateRow[];
  domesticTax?: DomesticTaxRecord[];
}) {
  const grouped = groupTariffRates(rates);
  const ftaCount = grouped.fta.length;
  const parsed = parseDomesticTax(grouped.domestic);
  const records: DomesticTaxRecord[] =
    domesticTax.length > 0
      ? domesticTax
      : Object.values(parsed).some((v) => v.trim())
        ? [
            {
              category: parsed["구분"],
              rate: parsed["내국세율"],
              code: parsed["세종부호"],
              basePrice: parsed["개소세과세기준가격"],
              ruralYn: parsed["농특세과세여부"],
              period: parsed["기준일자"],
            },
          ]
        : [];

  return (
    <table className="answer-table">
      <tbody>
        <tr>
          <th>품목번호</th>
          <td className="hs-no" colSpan={3}>
            {formatHs(item.hs_code)}
          </td>
          <th>수량단위</th>
          <td className="unit">{item.unit_weight || "—"}</td>
          <th>수량단위</th>
          <td className="unit">{item.unit_qty || "—"}</td>
        </tr>
        <tr>
          <th rowSpan={2}>품명</th>
          <th className="sub">국문</th>
          <td colSpan={6}>{item.item_name || "—"}</td>
        </tr>
        <tr>
          <th className="sub">영문</th>
          <td colSpan={6}>{item.item_name_en || "—"}</td>
        </tr>
        <tr>
          <th className="wide-label">간이정액환급</th>
          <td colSpan={7}>{item.simple_refund}</td>
        </tr>
        <tr>
          <th>감면</th>
          <td colSpan={7}>{item.reduction}</td>
        </tr>
        <tr>
          <th>원산지</th>
          <td colSpan={7}>{item.origin || "—"}</td>
        </tr>
        <tr>
          <th>관세</th>
          <td colSpan={7}>
            <RateLines
              rows={
                grouped.general.length
                  ? grouped.general.map((r) => ({
                      key: r.rate_code + r.rate_name,
                      name: `${r.rate_name}(${r.rate_code})`,
                      value: r.rate_value,
                    }))
                  : item.basic_rate
                    ? [{ key: "A", name: "기본세율(A)", value: item.basic_rate }]
                    : []
              }
            />
          </td>
        </tr>
        {grouped.fta.map((block, idx) => (
          <tr key={block.id}>
            {idx === 0 ? (
              <th rowSpan={ftaCount} className="fta-label">
                FTA
              </th>
            ) : null}
            <th className={`region region-${block.id}`}>{block.label}</th>
            <td colSpan={6}>
              <RateLines
                rows={block.lines.map((line) => ({
                  key: line.rate_code,
                  name: `${line.label}:`,
                  value: line.rate_value,
                }))}
              />
            </td>
          </tr>
        ))}
        <tr>
          <th>내국세</th>
          <td className="domestic-cell" colSpan={7}>
            {records.length > 0 ? (
              records.map((row, i) => (
                <table className="domestic-tax" key={`${row.code}-${i}`}>
                  <tbody>
                    <tr>
                      <th>구분</th>
                      <td>{row.category || "—"}</td>
                      <th>내국세율</th>
                      <td>{row.rate || "—"}</td>
                    </tr>
                    <tr>
                      <th>세종부호</th>
                      <td>{row.code || "—"}</td>
                      <th>개소세과세기준가격</th>
                      <td>{row.basePrice || "—"}</td>
                    </tr>
                    <tr>
                      <th>농특세과세여부</th>
                      <td>{row.ruralYn || "—"}</td>
                      <th>기준일자</th>
                      <td>{row.period || "—"}</td>
                    </tr>
                  </tbody>
                </table>
              ))
            ) : (
              <RateLines rows={[{ key: "vat-default", name: "부가세:", value: "10%" }]} />
            )}
          </td>
        </tr>
        {grouped.dumping.length > 0 ? (
          <tr>
            <th>덤핑</th>
            <td colSpan={7}>
              <RateLines
                rows={grouped.dumping.map((r, i) => ({
                  key: `d-${i}`,
                  name: r.rate_name,
                  value: r.rate_value,
                }))}
              />
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
