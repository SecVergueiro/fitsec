"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { readPersistedUser, clearPersistedSession } from "@/lib/auth-cache";
import type { User } from "@supabase/supabase-js";

const PUBLIC_PATHS = ["/login", "/public"];

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    let alive = true;

    // 1. Sessão persistida — leitura local e instantânea.
    //    O `getSession()` abaixo força refresh do token quando ele venceu (1h),
    //    o que offline falha e devolvia null: o app travava em spinner e
    //    redirecionava pro /login. Aqui já renderizamos com o que está no disco.
    const persisted = readPersistedUser();
    if (persisted) {
      setUser(persisted);
      setLoading(false);
    }

    // 2. Confirma com o supabase (revalida / renova o token quando dá).
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!alive) return;
        // session null acontece tanto em logout real quanto em falha de rede.
        // O supabase-js só apaga a chave do storage no logout real — então a
        // presença dela é o desempate.
        setUser(session?.user ?? readPersistedUser());
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setUser(readPersistedUser());
        setLoading(false);
      });

    // 3. Login / logout / refresh de token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
      } else {
        setUser(session?.user ?? readPersistedUser());
      }
      setLoading(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    // Chegar aqui com user null significa que não há sessão no disco — logout
    // de verdade, não queda de rede. O /login é pré-cacheado pelo service worker.
    if (!user && !isPublic) {
      router.push(`/login?from=${encodeURIComponent(pathname ?? "/")}`);
    }
  }, [user, loading, isPublic, pathname, router]);

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {
      /* offline — limpamos localmente logo abaixo */
    }
    clearPersistedSession();
    setUser(null);
    router.push("/login");
  }

  // Nas páginas protegidas, enquanto carrega ou se não há usuário, não renderiza nada
  if (!isPublic && (loading || !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--border-strong)", borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
