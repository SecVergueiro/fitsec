"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { db as offlineDB } from "@/lib/offline-db";
import { offlineUpdate } from "@/lib/offline-writes";
import type { UserProfile } from "@/lib/database.types";

const DEFAULT_PROFILE: Omit<UserProfile, "user_id" | "created_at" | "updated_at"> = {
  display_name: null,
  weekly_goal: 4,
  units: "kg",
  current_bodyweight_kg: null,
  rest_overrides: {},
};

interface ProfileCtx {
  profile: UserProfile | null;
  loading: boolean;
  update: (patch: Partial<Omit<UserProfile, "user_id" | "created_at" | "updated_at">>) => Promise<void>;
  setRestOverride: (exerciseId: string, seconds: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileCtx>({
  profile: null,
  loading: true,
  update: async () => {},
  setRestOverride: async () => {},
  refresh: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Cache local primeiro — offline é a única fonte que responde
    const cached = offlineDB
      ? await offlineDB.user_profile.get(user.id).catch(() => undefined)
      : undefined;
    if (cached) {
      setProfile(cached as UserProfile);
      setLoading(false);
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setProfile(data as UserProfile);
      if (offlineDB) await offlineDB.user_profile.put(data as any).catch(() => {});
    } else if (error) {
      // Erro de rede: o supabase-js resolve com { data: null, error } em vez de
      // rejeitar. Antes isso caía no insert abaixo e tentava recriar o profile.
      if (!cached) setProfile(null);
    } else {
      // Sem erro e sem linha: o profile realmente não existe (trigger não rodou)
      const { data: created } = await supabase
        .from("user_profiles")
        .insert({ user_id: user.id, ...DEFAULT_PROFILE } as any)
        .select()
        .single();
      if (created) {
        setProfile(created as UserProfile);
        if (offlineDB) await offlineDB.user_profile.put(created as any).catch(() => {});
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function update(patch: Partial<Omit<UserProfile, "user_id" | "created_at" | "updated_at">>) {
    if (!user || !profile) return;
    // Atualização otimista
    setProfile({ ...profile, ...patch, updated_at: new Date().toISOString() });
    // offlineUpdate grava no Dexie e enfileira quando não há rede
    await offlineUpdate("user_profiles", patch as any, { user_id: user.id }, {
      localTable: "user_profile",
      localId: user.id,
    });
  }

  async function setRestOverride(exerciseId: string, seconds: number) {
    if (!profile) return;
    const next = { ...profile.rest_overrides, [exerciseId]: seconds };
    await update({ rest_overrides: next });
  }

  return (
    <ProfileContext.Provider value={{ profile, loading, update, setRestOverride, refresh: load }}>
      {children}
    </ProfileContext.Provider>
  );
}
