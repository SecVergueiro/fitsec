// Leitura da sessão persistida pelo supabase-js — 100% local, sem rede.
//
// Por que existe:
//   - `auth.getUser()` SEMPRE faz request ao servidor.
//   - `auth.getSession()` dispara refresh do token quando o access token venceu
//     (1h por padrão no Supabase).
// Offline os dois devolvem `null`, o que derrubava o app pro /login e gravava
// `user_id: undefined` nas mutações da fila — que a RLS depois rejeitava,
// perdendo o treino silenciosamente.
//
// O supabase-js apaga essa chave do localStorage apenas em logout real
// (signOut ou refresh token inválido). Logo: chave presente == usuário logado.
"use client";

import type { User } from "@supabase/supabase-js";

/** Precisa bater com o `storageKey` passado ao createClient em lib/supabase.ts */
export const AUTH_STORAGE_KEY = "fitsec_auth";

interface PersistedSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: User;
}

/** Sessão gravada no localStorage, ou null se não houver. Não toca na rede. */
export function readPersistedSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    // Versões antigas do supabase-js aninhavam em `currentSession`
    const session = ((parsed as any).currentSession ?? parsed) as PersistedSession;
    return session?.user?.id ? session : null;
  } catch {
    return null;
  }
}

/** Usuário da sessão persistida (mesmo com access token vencido). */
export function readPersistedUser(): User | null {
  return readPersistedSession()?.user ?? null;
}

/** user_id da sessão persistida — use para carimbar inserts offline. */
export function readPersistedUserId(): string | null {
  return readPersistedUser()?.id ?? null;
}

/** true se há sessão gravada, independente de o token estar válido. */
export function hasPersistedSession(): boolean {
  return readPersistedSession() != null;
}

/** true se o access token já venceu (ou está prestes a vencer). */
export function isAccessTokenExpired(marginSeconds = 30): boolean {
  const s = readPersistedSession();
  if (!s?.expires_at) return false;
  return s.expires_at * 1000 - Date.now() < marginSeconds * 1000;
}

/** Remove a sessão local — usado no signOut quando a chamada de rede falha. */
export function clearPersistedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* storage bloqueado — nada a fazer */
  }
}
