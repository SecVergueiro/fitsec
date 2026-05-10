"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Tab = "login" | "signup";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Se já tem sessão ativa, redireciona
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push(from);
    });
  }, [from, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (err) {
      setError(err.message === "Invalid login credentials"
        ? "Email ou senha incorretos."
        : err.message);
      return;
    }

    router.push(from);
    router.refresh();
  }

  async function handleResetPassword() {
    if (!email) {
      setError("Digite seu email primeiro pra receber o link de recuperação.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess("Link de recuperação enviado pro seu email. Confira a caixa de entrada.");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // Supabase pode exigir confirmação de email (configurável no dashboard)
    setSuccess("Conta criada! Verifique seu email para confirmar o cadastro, depois faça o login.");
    setTab("login");
    setPassword("");
    setConfirmPassword("");
  }

  const inputStyle = (hasError?: boolean) => ({
    background: "var(--surface)",
    border: `0.5px solid ${hasError ? "rgba(239,68,68,0.5)" : "var(--border-strong)"}`,
    color: "var(--text)",
    outline: "none",
    minHeight: "52px",
  });

  const canSubmitLogin = email && password && !loading;
  const canSubmitSignup = email && password && confirmPassword && !loading;

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-xs">

        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="text-4xl font-black mb-1"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em", color: "var(--primary)" }}
          >
            FITSEC
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            {tab === "login" ? "Seu caderno de treino." : "Crie sua conta gratuita."}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl p-1 mb-6" style={{ background: "var(--surface)", border: "0.5px solid var(--border)" }}>
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setSuccess(null); }}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
              style={{
                background: tab === t ? "var(--primary)" : "transparent",
                color: tab === t ? "var(--background)" : "var(--muted)",
                minHeight: "auto",
                cursor: "pointer",
              }}
            >
              {t === "login" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>

        {/* Mensagem de sucesso */}
        {success && (
          <div className="rounded-xl px-4 py-3 mb-4 text-xs leading-relaxed" style={{ background: "rgba(34,197,94,0.08)", border: "0.5px solid rgba(34,197,94,0.3)", color: "#22c55e" }}>
            {success}
          </div>
        )}

        {/* Form Login */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={inputStyle()}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              autoComplete="current-password"
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={inputStyle()}
            />
            {error && <p className="text-xs text-center" style={{ color: "#ef4444" }}>{error}</p>}
            <button
              type="submit"
              disabled={!canSubmitLogin}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{
                background: canSubmitLogin ? "var(--primary)" : "var(--surface-strong)",
                color: canSubmitLogin ? "var(--background)" : "var(--faint)",
                minHeight: "52px",
                cursor: canSubmitLogin ? "pointer" : "default",
                transition: "background 0.2s",
              }}
            >
              {loading ? "Entrando..." : "Entrar →"}
            </button>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full text-center text-xs font-medium mt-2"
              style={{ color: "var(--muted)", minHeight: "auto", padding: "8px", background: "transparent", border: "none", cursor: "pointer" }}
            >
              Esqueci minha senha
            </button>
          </form>
        )}

        {/* Form Cadastro */}
        {tab === "signup" && (
          <form onSubmit={handleSignup} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={inputStyle()}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha (mín. 6 caracteres)"
              autoComplete="new-password"
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={inputStyle()}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmar senha"
              autoComplete="new-password"
              className="w-full rounded-xl px-4 py-3 text-sm"
              style={inputStyle(!!error && password !== confirmPassword)}
            />
            {error && <p className="text-xs text-center" style={{ color: "#ef4444" }}>{error}</p>}
            <button
              type="submit"
              disabled={!canSubmitSignup}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{
                background: canSubmitSignup ? "var(--accent)" : "var(--surface-strong)",
                color: canSubmitSignup ? "var(--background)" : "var(--faint)",
                minHeight: "52px",
                cursor: canSubmitSignup ? "pointer" : "default",
                transition: "background 0.2s",
              }}
            >
              {loading ? "Criando conta..." : "Criar conta →"}
            </button>
          </form>
        )}

        <div className="text-center mt-6 text-xs" style={{ color: "var(--faint)" }}>
          Seus dados ficam no seu banco Supabase.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
