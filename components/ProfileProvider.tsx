"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
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
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      // Profile não existe — cria com defaults (caso o trigger não tenha rodado)
      const { data: created } = await supabase
        .from("user_profiles")
        .insert({ user_id: user.id, ...DEFAULT_PROFILE } as any)
        .select()
        .single();
      setProfile(created as UserProfile);
    } else {
      setProfile(data as UserProfile);
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
    await supabase.from("user_profiles").update(patch as any).eq("user_id", user.id);
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
