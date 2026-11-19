"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { formatFileSize } from "@/app/(ai)/kita/yestrade-content-panel";
import {
  FTA_ORIGIN_CERT_FORM_SOURCE_URL,
  type FtaOriginCertificateFormRow,
} from "@/app/lib/fta-origin-certificate-form-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function OriginCertificateFormsView() {
  const [rows, setRows] = useState<FtaOriginCertificateFormRow[]>([]);
  const [dir, setDir] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: FtaOriginCertificateFormRow[];
        dir: string;
      }>("/api/fta-origin-certificate-forms/list");
      setRows(data.rows ?? []);
      setDir(data.dir ?? "");
      setSelectedId((prev) => {
        const list = data.rows ?? [];
        if (prev && list.some((r) => r.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const syncFolder = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: FtaOriginCertificateFormRow[];
        dir: string;
        synced: number;
        missingDir?: boolean;
      }>("/api/fta-origin-certificate-forms/sync", { method: "POST" });
      if (data.missingDir) {
        setError(`폴더 없음: ${data.dir}`);
      }
      setRows(data.rows ?? []);
      setDir(data.dir ?? "");
      setSelectedId((prev) => {
        const list = data.rows ?? [];
        if (prev && list.some((r) => r.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "폴더 동기화 실패");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  return (
    <CasPageShell>
      <CasPageHeader title="원산지증명서 서식" />
      <p className="text-[12px] text-slate-600">
        FTA 포털 · 원산지증명서 발급 ·{" "}
        <a
          href={FTA_ORIGIN_CERT_FORM_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          원산지증명서 서식
        </a>
        {dir ? (
          <>
            {" "}
            · 경로{" "}
            <code className="rounded bg-slate-100 px-1 text-[11px]">{dir}</code>
          </>
        ) : null}
        {" · "}
        <code className="rounded bg-slate-100 px-1 text-[11px]">
          fta_origin_certificate_form
        </code>
      </p>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      <CasCard
        title="협정별 서식"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://unipass.customs.go.kr/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-md border border-[#c5d0de] bg-white px-3 text-[11px] font-medium text-[#1e2f4f] hover:bg-slate-50"
            >
              관세청 원산지증명서 발급신청
            </a>
            <a
              href="https://www.korcham.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-md border border-[#c5d0de] bg-white px-3 text-[11px] font-medium text-[#1e2f4f] hover:bg-slate-50"
            >
              대한상공회의소 원산지증명서 발급신청
            </a>
            <button
              type="button"
              onClick={() => void syncFolder()}
              disabled={syncing}
              className="inline-flex h-8 items-center rounded-md bg-[#1e2f4f] px-3 text-[11px] font-medium text-white hover:bg-[#16253f] disabled:opacity-60"
            >
              {syncing ? "동기화 중…" : "폴더 동기화"}
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="text-[12px] text-slate-500">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-slate-500">
            등록된 서식이 없습니다.{" "}
            <code className="rounded bg-slate-100 px-1">
              D:\SQLiteDB\downloads\원산지증명서서식
            </code>
            에 PDF를 두고 「폴더 동기화」를 눌러 주세요.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {rows.map((r) => {
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`rounded-md border px-2.5 py-2.5 text-center text-[12px] font-medium transition-colors ${
                    active
                      ? "border-[#1e2f4f] bg-[#1e2f4f] text-white shadow-sm"
                      : "border-[#d8dee6] bg-white text-[#1e2f4f] hover:border-[#1e2f4f]/50 hover:bg-slate-50"
                  } ${!r.fileExists ? "opacity-60" : ""}`}
                  title={r.fileExists ? r.fileName : `${r.fileName} (파일 없음)`}
                >
                  {r.agreementName}
                </button>
              );
            })}
          </div>
        )}
      </CasCard>

      {selected ? (
        <CasCard
          title={selected.title}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500">
                {selected.fileName}
                {selected.fileSize
                  ? ` · ${formatFileSize(selected.fileSize)}`
                  : ""}
              </span>
              <a
                href={selected.downloadUrl}
                className="inline-flex h-8 items-center rounded-md border border-[#c5d0de] bg-white px-3 text-[11px] font-medium text-[#1e2f4f] hover:bg-slate-50"
              >
                PDF파일 다운로드
              </a>
            </div>
          }
        >
          {!selected.fileExists ? (
            <p className="text-[12px] text-amber-700">
              디스크에 파일이 없습니다. 경로를 확인한 뒤 폴더 동기화를 다시
              실행하세요.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-[#e5e9ef] bg-[#f8fafc]">
              <iframe
                key={selected.id}
                title={selected.title}
                src={selected.previewUrl}
                className="h-[min(78vh,920px)] w-full bg-white"
              />
            </div>
          )}
        </CasCard>
      ) : null}
    </CasPageShell>
  );
}
