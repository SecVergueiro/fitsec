import { createClient } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY, readPersistedUser } from "./auth-cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    "[FitSec] Variaveis de ambiente do Supabase nao configuradas. " +
    "Crie um .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

/**
 * Teto de tempo para qualquer request ao Supabase.
 *
 * `navigator.onLine` mente com frequência no iOS (fica `true` em Wi-Fi sem
 * internet), e o supabase-js não tem timeout próprio: sem isto, salvar uma série
 * ficava pendurada indefinidamente no meio do treino. Como o postgrest nunca
 * refaz um request abortado, o abort também corta o backoff de retry.
 */
const REQUEST_TIMEOUT_MS = 12000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Preserva um signal que o chamador já tenha passado (ex.: .abortSignal())
  const caller = init?.signal;
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
    },
    global: { fetch: fetchWithTimeout },
  }
);

/**
 * Usuário atual **sem tocar na rede** — lê a sessão persistida.
 *
 * Use isto (e não `supabase.auth.getUser()`) para carimbar `user_id` em inserts:
 * o getUser sempre bate no servidor e, offline, devolve null — o registro ia pra
 * fila sem user_id e a RLS rejeitava no flush, perdendo o treino.
 */
export function getCurrentUser() {
  return readPersistedUser();
}

/** user_id da sessão persistida, ou null se não houver sessão. */
export function getCurrentUserId(): string | null {
  return readPersistedUser()?.id ?? null;
}
