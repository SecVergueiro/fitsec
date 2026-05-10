"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);
    if (res.ok) {
      router.push(from);
      router.refresh();
    } else {
      setError(true);
      setPassword("");
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <div
            className="text-4xl font-black mb-1"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.04em",
              color: "var(--primary)",
            }}
          >
            FITSEC
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Insira a senha para continuar
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-base text-center font-bold tracking-widest"
            style={{
              background: "var(--surface)",
              border: error
                ? "0.5px solid rgba(239,68,68,0.5)"
                : "0.5px solid var(--border-strong)",
              color: "var(--text)",
              outline: "none",
              minHeight: "52px",
            }}
          />
          {error && (
            <p className="text-xs text-center" style={{ color: "#ef4444" }}>
              Senha incorreta
            </p>
          )}
          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{
              background: password && !loading ? "var(--primary)" : "var(--surface-strong)",
              color: password && !loading ? "var(--background)" : "var(--faint)",
              minHeight: "52px",
              cursor: password && !loading ? "pointer" : "default",
              transition: "background 0.2s",
            }}
          >
            {loading ? "Verificando..." : "Entrar →"}
          </button>
        </form>
      </div>
    </div>
  );
}
