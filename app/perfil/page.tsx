"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { useProfile } from "@/components/ProfileProvider";
import { useConfirm, useToast } from "@/components/Toast";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { fmtTonnage } from "@/lib/utils";

interface Stats {
  totalSessions: number;
  activeDays: number;
  totalPRs: number;
  totalVolume: number;
  memberSince: string;
}

export default function PerfilPage() {
  const { user, signOut } = useAuth();
  const { profile, update } = useProfile();
  const confirm = useConfirm();
  const toast = useToast();

  const [stats, setStats] = useState<Stats | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("4");
  const [editingBW, setEditingBW] = useState(false);
  const [bwInput, setBwInput] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (profile) {
      setNameInput(profile.display_name ?? "");
      setGoalInput(String(profile.weekly_goal));
      setBwInput(profile.current_bodyweight_kg ? String(profile.current_bodyweight_kg) : "");
    }
  }, [profile]);

  async function saveBW() {
    const n = parseFloat(bwInput);
    const value = isNaN(n) || n <= 0 ? null : Math.round(n * 10) / 10;
    await update({ current_bodyweight_kg: value });
    setEditingBW(false);
    toast.success("Peso corporal atualizado");
  }

  useEffect(() => {
    if (!user) return;
    loadStats();
  }, [user]);

  async function loadStats() {
    const [sessRes, setsRes] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select("session_date, completed_at")
        .not("completed_at", "is", null),
      supabase.from("session_sets").select("weight_kg, reps, is_warmup, exercise_id, performed_at"),
    ]);

    const sessions = (sessRes.data as any[]) ?? [];
    const sets = (setsRes.data as any[]) ?? [];
    const realSets = sets.filter((s) => !s.is_warmup);
    const totalVolume = realSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);

    // PRs all-time: por exercício, conta novos picos
    const byExercise: Record<string, any[]> = {};
    realSets.forEach((s) => {
      if (!byExercise[s.exercise_id]) byExercise[s.exercise_id] = [];
      byExercise[s.exercise_id].push(s);
    });
    let totalPRs = 0;
    Object.values(byExercise).forEach((list) => {
      list.sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());
      let best = 0;
      list.forEach((s) => {
        const e1rm = s.weight_kg * (1 + s.reps / 30);
        if (e1rm > best) {
          best = e1rm;
          totalPRs++;
        }
      });
    });

    const dates = new Set(sessions.map((s: any) => s.session_date));

    setStats({
      totalSessions: sessions.length,
      activeDays: dates.size,
      totalPRs,
      totalVolume,
      memberSince: user?.created_at ?? "",
    });
  }

  async function saveName() {
    await update({ display_name: nameInput.trim() || null });
    setEditingName(false);
    toast.success("Nome atualizado");
  }

  async function saveGoal() {
    const n = Math.max(1, Math.min(14, parseInt(goalInput) || 4));
    await update({ weekly_goal: n });
    setGoalInput(String(n));
    setEditingGoal(false);
    toast.success("Meta atualizada");
  }

  async function exportData() {
    setExporting(true);
    const [sessions, sets, sessionExercises, templates, mesos, exercises] = await Promise.all([
      supabase.from("workout_sessions").select("*"),
      supabase.from("session_sets").select("*"),
      supabase.from("session_exercises").select("*"),
      supabase.from("templates").select("*"),
      supabase.from("mesocycles").select("*"),
      supabase.from("exercises").select("*").eq("is_custom", true),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: user?.id,
      profile,
      workout_sessions: sessions.data,
      session_sets: sets.data,
      session_exercises: sessionExercises.data,
      templates: templates.data,
      mesocycles: mesos.data,
      custom_exercises: exercises.data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitsec-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExporting(false);
    toast.success("Arquivo gerado");
  }

  async function handleLogout() {
    const ok = await confirm({ title: "Sair?", message: "Você precisará fazer login novamente.", confirmLabel: "Sair", danger: false });
    if (!ok) return;
    await signOut();
  }

  async function handleDeleteAccount() {
    const ok = await confirm({
      title: "Apagar conta?",
      message: "Todos os seus treinos, templates e PRs serão perdidos. Esta ação é irreversível.",
      confirmLabel: "Apagar conta",
      danger: true,
    });
    if (!ok) return;
    // Apaga dados via cascade (user_id FK com on delete cascade)
    await supabase.rpc("delete_user");
    await signOut();
  }

  const initials = (profile?.display_name ?? user?.email ?? "U")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

  const memberSinceLabel = stats?.memberSince
    ? new Date(stats.memberSince).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "—";

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Conta" title="Perfil" />

      {/* Identidade */}
      <Card variant="strong" className="mb-4">
        <div className="flex items-center gap-3">
          <div
            className="rounded-2xl flex items-center justify-center font-bold flex-shrink-0"
            style={{
              width: 64,
              height: 64,
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
              color: "var(--background)",
              fontSize: 22,
              letterSpacing: "0.04em",
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base truncate">
              {profile?.display_name || (user?.email?.split("@")[0] ?? "Atleta")}
            </div>
            <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
              {user?.email ?? "—"}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--faint)" }}>
              Membro desde <span className="capitalize">{memberSinceLabel}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats agregadas */}
      <Eyebrow className="mb-2">Estatísticas</Eyebrow>
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <StatRow label="Treinos" value={stats ? String(stats.totalSessions) : "—"} />
          <StatRow label="Dias ativos" value={stats ? String(stats.activeDays) : "—"} />
          <StatRow label="PRs all-time" value={stats ? String(stats.totalPRs) : "—"} />
          <StatRow label="Volume total" value={stats ? fmtTonnage(stats.totalVolume) : "—"} />
        </div>
      </Card>

      {/* Preferências */}
      <Eyebrow className="mb-2">Preferências</Eyebrow>
      <Card className="mb-4 !p-0">
        <SettingRow label="Nome de exibição">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                autoFocus
                className="text-sm font-bold rounded px-2 py-1 tabular text-right"
                style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none", maxWidth: 160 }}
              />
              <button onClick={saveName} className="text-xs font-bold px-2 py-1 rounded" style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}>OK</button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)", minHeight: "auto" }}>
              <span>{profile?.display_name || "—"}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--faint)" }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </SettingRow>

        <SettingRow label="Peso corporal">
          {editingBW ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                value={bwInput}
                onChange={(e) => setBwInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveBW(); if (e.key === "Escape") setEditingBW(false); }}
                autoFocus
                step="0.1"
                placeholder="kg"
                className="w-20 text-center text-sm font-bold rounded px-1 py-1 tabular"
                style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none" }}
              />
              <button onClick={saveBW} className="text-xs font-bold px-2 py-1 rounded" style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}>OK</button>
            </div>
          ) : (
            <button onClick={() => setEditingBW(true)} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)", minHeight: "auto" }}>
              <span className="tabular">{profile?.current_bodyweight_kg ? `${profile.current_bodyweight_kg} kg` : "—"}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--faint)" }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </SettingRow>

        <SettingRow label="Meta semanal">
          {editingGoal ? (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setEditingGoal(false); }}
                autoFocus
                min={1} max={14}
                className="w-12 text-center text-sm font-bold rounded px-1 py-1 tabular"
                style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none" }}
              />
              <button onClick={saveGoal} className="text-xs font-bold px-2 py-1 rounded" style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}>OK</button>
            </div>
          ) : (
            <button onClick={() => setEditingGoal(true)} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)", minHeight: "auto" }}>
              <span className="tabular">{profile?.weekly_goal ?? 4}× / semana</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--faint)" }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </SettingRow>

        <SettingRow label="Unidade de peso">
          <div className="flex gap-1.5">
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                onClick={() => update({ units: u })}
                className="rounded-md text-xs font-bold uppercase"
                style={{
                  padding: "5px 12px", minHeight: "auto",
                  background: profile?.units === u ? "var(--primary)" : "var(--surface)",
                  color: profile?.units === u ? "var(--background)" : "var(--muted)",
                  border: `0.5px solid ${profile?.units === u ? "var(--primary)" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                {u}
              </button>
            ))}
          </div>
        </SettingRow>
      </Card>

      {/* Conta */}
      <Eyebrow className="mb-2">Conta</Eyebrow>
      <Card className="mb-5 !p-0">
        <ActionRow onClick={exportData} disabled={exporting}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {exporting ? "Exportando..." : "Exportar meus dados (JSON)"}
        </ActionRow>
        <ActionRow onClick={handleLogout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sair
        </ActionRow>
        <ActionRow onClick={handleDeleteAccount} danger>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
          </svg>
          Apagar conta
        </ActionRow>
      </Card>

      <div className="text-center text-xs mb-6" style={{ color: "var(--faint)" }}>
        FitSec · feito pra atletas que treinam serio
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold mb-0.5" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div className="text-xl font-bold tabular">{value}</div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4" style={{ paddingTop: 14, paddingBottom: 14, borderBottom: "0.5px solid var(--border)", minHeight: 56 }}>
      <span className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}

function ActionRow({ onClick, disabled, danger, children }: { onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 text-left text-sm font-medium"
      style={{
        paddingTop: 14, paddingBottom: 14, minHeight: 56,
        borderBottom: "0.5px solid var(--border)",
        color: danger ? "#ff8888" : "var(--text)",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
