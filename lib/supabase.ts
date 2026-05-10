import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    "[FitSec] Variaveis de ambiente do Supabase nao configuradas. " +
    "Crie um .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "fitsec_auth",
    },
  }
);

/** Retorna o user autenticado ou null. */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Retorna o user_id da sessão atual (lança erro se não autenticado). */
export async function getUserId(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Não autenticado");
  return user.id;
}
