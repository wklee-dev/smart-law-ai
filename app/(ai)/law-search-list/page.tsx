"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { useEffect, useMemo, useState } from "react";
import { formatLawIdForDisplay } from "@/app/shared/law-id";

type LawSearchItem = {
  id: number;
  search_history_id: number;
  item_no: number;
  law_serial_no: string;
  history_status_code: string;
  law_name_kr: string;
  law_name_short: string;
  law_id: string;
  promulgation_date: string;
  promulgation_no: string;
  revision_type_name: string;
  ministry_code: string;
  ministry_name: string;
  law_type_name: string;
  enforcement_date: string;
  detail_link: string;
  created_at: string;
};

export default function LawSearchListPage() {
  const [items, setItems] = useState<LawSearchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<LawSearchItem | null>(null);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadItems = async () => {
      try {
        setIsLoading(true);

        const response = await fetch("/api/law-search/list", {
          method: "GET",
          cache: "no-store",
        });

        const text = await response.text();

        if (!response.ok) {
          throw new Error(`조회 실패: ${response.status} ${text}`);
        }

        const data = JSON.parse(text) as {
          ok: boolean;
          items?: LawSearchItem[];
          error?: string;
        };

        if (!data.ok) {
          throw new Error(data.error || "법령 목록 조회 실패");
        }

        setItems(data.items ?? []);
      } catch (error) {
        console.error(error);
        setItems([]);
        setMessage(
          error instanceof Error
            ? error.message
            : "법령 목록 조회 중 오류가 발생했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return items;

    return items.filter((item) => {
      return (
        item.law_name_kr?.toLowerCase().includes(q) ||
        item.law_name_short?.toLowerCase().includes(q) ||
        item.law_id?.toLowerCase().includes(q) ||
        formatLawIdForDisplay(item.law_id).toLowerCase().includes(q) ||
        item.law_serial_no?.toLowerCase().includes(q) ||
        item.ministry_name?.toLowerCase().includes(q)
      );
    });
  }, [items, keyword]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CasPageHeader title="현행법령(시행일) 목록 조회" className="min-w-0 flex-1" />

            <div className="text-sm text-slate-500">
              총 건수:{" "}
              <span className="font-semibold">{filteredItems.length}</span>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {message}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                검색
              </span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="법령명, 법령ID, 법령일련번호, 소관부처명 검색"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>

            <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
              {isLoading ? "불러오는 중..." : `조회 완료 ${items.length}건`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              법령 목록
            </h2>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      법령명
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      법령ID
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      소관부처
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      시행일자
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-sm text-slate-500"
                      >
                        저장된 법령 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isSelected = selectedItem?.id === item.id;

                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedItem(item)}
                          className={`cursor-pointer transition ${
                            isSelected
                              ? "bg-blue-50"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
                            {item.law_name_kr}
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
                            {formatLawIdForDisplay(item.law_id)}
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
                            {item.ministry_name || "—"}
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3 text-sm text-slate-800">
                            {item.enforcement_date || "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              상세 정보
            </h2>

            {!selectedItem ? (
              <div className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
                왼쪽 목록에서 법령을 선택해 주세요.
              </div>
            ) : (
              <div className="space-y-3 text-sm text-slate-700">
                <DetailRow label="법령명" value={selectedItem.law_name_kr} />
                <DetailRow
                  label="법령약칭명"
                  value={selectedItem.law_name_short}
                />
                <DetailRow
                  label="법령ID"
                  value={formatLawIdForDisplay(selectedItem.law_id)}
                />
                <DetailRow
                  label="법령일련번호"
                  value={selectedItem.law_serial_no}
                />
                <DetailRow
                  label="현행연혁코드"
                  value={selectedItem.history_status_code}
                />
                <DetailRow label="공포일자" value={selectedItem.promulgation_date} />
                <DetailRow label="공포번호" value={selectedItem.promulgation_no} />
                <DetailRow
                  label="제개정구분명"
                  value={selectedItem.revision_type_name}
                />
                <DetailRow label="소관부처코드" value={selectedItem.ministry_code} />
                <DetailRow label="소관부처명" value={selectedItem.ministry_name} />
                <DetailRow label="법령구분명" value={selectedItem.law_type_name} />
                <DetailRow label="시행일자" value={selectedItem.enforcement_date} />
                <DetailRow label="상세링크" value={selectedItem.detail_link} />
                <DetailRow
                  label="검색이력ID"
                  value={String(selectedItem.search_history_id)}
                />
                <DetailRow label="저장일시" value={selectedItem.created_at} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      <div className="break-all text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}