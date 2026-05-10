import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Aviso em runtime (no navegador), nunca no build
if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    "[FitSec] Variaveis de ambiente do Supabase nao configuradas. " +
    "Crie um .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Cria o cliente mesmo com strings vazias — falha so quando voce
// realmente tentar fazer uma query, e o erro fica claro no console do navegador.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
    },
  }
);