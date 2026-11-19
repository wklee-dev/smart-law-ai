"use client";

import { useCallback, useEffect, useState } from "react";
import {
  saveUserFieldProfileViaApi,
} from "@/app/(ai)/cas-ncom/cas-ncom-field-profile-client";
import {
  CasAlert,
  CasPrimaryButton,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import type { UseCasNcomAuthResult } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import {
  filterConfigurableProfile,
  formatProfileLevelTabLabel,
  profileSavePayload,
  resolveFieldDisplayLabel,
} from "@/app/lib/cas-ncom-field-profile-columns";
import type {
  NcomFieldProfileApi,
  UserFieldProfile,
} from "@/app/lib/cas-ncom-user-field-profile-server";

type Props = {
  open: boolean;
  api: NcomFieldProfileApi;
  profile: UserFieldProfile | null;
  auth: UseCasNcomAuthResult;
  onClose: () => void;
  onSaved: (profile: UserFieldProfile) => void;
};

export function CasFieldSettingsDialog({
  open,
  api,
  profile,
  auth,
  onClose,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<UserFieldProfile | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !profile) return;
    const configurable = filterConfigurableProfile(profile, api);
    setDraft({
      ...configurable,
      levels: configurable.levels.map((level) => ({
        ...level,
        fields: level.fields.map((f) => ({ ...f })),
      })),
    });
    setActiveTab(0);
    setErr(null);
  }, [api, open, profile]);

  const toggleField = useCallback(
    (levelIndex: number, fieldKey: string, selected: boolean) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const levels = prev.levels.map((level, li) => {
          if (li !== levelIndex) return level;
          return {
            ...level,
            fields: level.fields.map((f) =>
              f.fieldKey === fieldKey ? { ...f, selected } : f,
            ),
          };
        });
        return { ...prev, levels };
      });
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = { ...profileSavePayload(draft), apiNm: api };
      const saved = await saveUserFieldProfileViaApi(
        payload,
        auth.ensureSession,
        auth.handleAuthFailure,
      );
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [api, auth.ensureSession, auth.handleAuthFailure, draft, onClose, onSaved]);

  if (!open || !draft) return null;

  const level = draft.levels[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            인터페이스 항목 설정
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            공통/란/모델규격 항목을 선택한 후 저장하세요. 조회 결과 그리드에
            선택된 항목만 표시됩니다.
          </p>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-5 pt-3">
          {draft.levels.map((lv, idx) => (
            <button
              key={lv.tableNm || idx}
              type="button"
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === idx
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setActiveTab(idx)}
            >
              {formatProfileLevelTabLabel(lv.levelName, lv.tableNm)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {err ? (
            <div className="mb-3">
              <CasAlert tone="error">{err}</CasAlert>
            </div>
          ) : null}

          {level ? (
            level.fields.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {level.fields.map((field) => (
                <label
                  key={field.fieldKey}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={field.selected}
                    onChange={(e) =>
                      toggleField(activeTab, field.fieldKey, e.target.checked)
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800">
                      {resolveFieldDisplayLabel(api, field)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            ) : (
              <p className="text-sm text-slate-500">
                이 구분에 설정 가능한 항목이 없습니다.
              </p>
            )
          ) : (
            <p className="text-sm text-slate-500">설정 가능한 항목이 없습니다.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <CasSecondaryButton type="button" disabled={saving} onClick={onClose}>
            닫기
          </CasSecondaryButton>
          <CasPrimaryButton type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "저장 중…" : "저장"}
          </CasPrimaryButton>
        </div>
      </div>
    </div>
  );
}
