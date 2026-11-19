"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  assertFieldProfileConfigured,
  fetchUserFieldProfile,
  FIELD_PROFILE_REQUIRED_MSG,
} from "@/app/(ai)/cas-ncom/cas-ncom-field-profile-client";
import type { UseCasNcomAuthResult } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import type {
  NcomFieldProfileApi,
  UserFieldProfile,
} from "@/app/lib/cas-ncom-user-field-profile-server";

export function useCasNcomFieldProfile(
  api: NcomFieldProfileApi,
  auth: UseCasNcomAuthResult,
) {
  const [profile, setProfile] = useState<UserFieldProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const sessionToken = auth.session?.token ?? "";
  const authRef = useRef(auth);
  authRef.current = auth;

  const reloadProfile = useCallback(async () => {
    if (!sessionToken) {
      setProfile(null);
      return null;
    }
    setLoading(true);
    setProfileErr(null);
    try {
      const next = await fetchUserFieldProfile(
        api,
        authRef.current.ensureSession,
        authRef.current.handleAuthFailure,
      );
      setProfile(next);
      return next;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setProfileErr(msg);
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      setProfile(null);
      setProfileErr(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setProfileErr(null);

    void fetchUserFieldProfile(
      api,
      authRef.current.ensureSession,
      authRef.current.handleAuthFailure,
    )
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setProfileErr(e instanceof Error ? e.message : String(e));
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, sessionToken]);

  const ensureProfileForSearch = useCallback(async (): Promise<UserFieldProfile> => {
    const current = profile ?? (await reloadProfile());
    if (!current) {
      throw new Error(profileErr ?? "필드 프로필을 불러오지 못했습니다.");
    }
    try {
      assertFieldProfileConfigured(current);
    } catch (e) {
      const msg = e instanceof Error ? e.message : FIELD_PROFILE_REQUIRED_MSG;
      window.alert(msg);
      setSettingsOpen(true);
      throw e;
    }
    return current;
  }, [profile, profileErr, reloadProfile]);

  return {
    profile,
    profileLoading: loading,
    profileErr,
    settingsOpen,
    setSettingsOpen,
    reloadProfile,
    ensureProfileForSearch,
    onProfileSaved: setProfile,
  };
}
