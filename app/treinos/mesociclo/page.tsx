"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { useConfirm } from "@/components/Toast";
import { weekNumber } from "@/lib/utils";
import type { Mesocycle, WorkoutSession } from "@/lib/database.types";

export default function MesocicloPage() {
  const confirm = useConfirm();
  const [meso, setMeso] = useState<(Mesocycle & { template_name?: string }) | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: mesoData } = await supabase
      .from("mesocycles")
      .select("*, templates(name)")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mesoData) {
      const m = mesoData as any;
      setMeso({ ...m, template_name: m.templates?.name });

      const { data: sessRes } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("mesocycle_id", m.id)
        .order("session_date", { ascending: true });
      setSessions((sessRes as WorkoutSession[]) ?? []);
    }
    setLoading(false);
  }

  async function endMeso() {
    if (!meso) return;
    const ok = await confirm({
      title: "Encerrar mesociclo?",
      message: "O bloco será marcado como encerrado.",
      confirmLabel: "Encerrar",
      danger: true,
    });
    if (!ok) return;
    await supabase
      .from("mesocycles")
      .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) } as any)
      .eq("id", meso.id);
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!meso) {
    return (
      <div className="fade-in">
        <Link href="/treinos" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
          ← Treinos
        </Link>
        <PageHeader eyebrow="Mesociclo" title="Sem bloco ativo" />
        <Link href="/treinos/mesociclo/novo">
          <Button fullWidth>Iniciar mesociclo</Button>
        </Link>
      </div>
    );
  }

  const currentWeek = Math.min(weekNumber(meso.start_date), meso.total_weeks);
  const progress = (currentWeek / meso.total_weeks) * 100;
  const isDeloadWeek = meso.deload_week === currentWeek;

  // Define fases por semana (acumulação → intensificação → pico → deload)
  const phases = computePhases(meso.total_weeks, meso.deload_week);

  // Sessões por semana
  const sessionsByWeek: Record<number, WorkoutSession[]> = {};
  sessions.forEach((s) => {
    const sessionDate = new Date(s.session_date);
    const startDate = new Date(meso.start_date);
    const diffDays = Math.floor((sessionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const week = Math.floor(diffDays / 7) + 1;
    if (!sessionsByWeek[week]) sessionsByWeek[week] = [];
    sessionsByWeek[week].push(s);
  });

  return (
    <div className="fade-in">
      <Link href="/treinos" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Treinos
      </Link>
      <div className="mb-1">
        <Eyebrow>Mesociclo ativo</Eyebrow>
        <h1 className="text-2xl mt-1">{meso.name}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {meso.template_name} · iniciado {new Date(meso.start_date).toLocaleDateString("pt-BR")}
        </p>
      </div>

      <Card className="my-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold">Progresso</span>
          <span className="text-sm font-bold tabular" style={{ color: "var(--accent)" }}>
            {currentWeek} / {meso.total_weeks} semanas
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(237, 238, 239, 0.08)" }}>
          <div
            className="h-full"
            style={{
              background: "var(--accent)",
              width: `${progress}%`,
              boxShadow: "0 0 8px rgba(68, 147, 224, 0.5)",
            }}
          />
        </div>
        {isDeloadWeek && (
          <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(68, 147, 224, 0.1)", color: "var(--accent)" }}>
            Semana de deload — reduza volume em ~40% e mantenha técnica
          </div>
        )}
      </Card>

      <Eyebrow className="mb-2">Fases</Eyebrow>
      <Card className="!p-0 mb-5">
        {phases.map((phase, idx) => {
          const inPhase = currentWeek >= phase.startWeek && currentWeek <= phase.endWeek;
          return (
            <div
              key={idx}
              className="px-4 py-3 flex justify-between items-center"
              style={{
                borderBottom: idx < phases.length - 1 ? "0.5px solid var(--border)" : "none",
                background: inPhase ? "rgba(68, 147, 224, 0.05)" : "transparent",
              }}
            >
              <div>
                <div className="text-sm font-bold">{phase.name}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  sem {phase.startWeek}{phase.startWeek !== phase.endWeek ? `-${phase.endWeek}` : ""}
                </div>
              </div>
              {inPhase ? <Pill variant="primary">EM CURSO</Pill> : <span className="text-xs" style={{ color: "var(--muted)" }}>{phase.tip}</span>}
            </div>
          );
        })}
      </Card>

      <Eyebrow className="mb-2">Histórico de sessões · {sessions.length}</Eyebrow>
      <Card className="mb-5">
        <div className="space-y-2">
          {Array.from({ length: meso.total_weeks }, (_, i) => i + 1).map((wk) => {
            const wkSessions = sessionsByWeek[wk] ?? [];
            return (
              <div key={wk} className="flex items-center gap-3">
                <div className="text-xs font-bold tabular w-10" style={{ color: wk === currentWeek ? "var(--accent)" : "var(--muted)" }}>
                  S{wk}
                </div>
                <div className="flex-1 flex gap-1">
                  {Array.from({ length: 7 }, (_, d) => {
                    const date = new Date(meso.start_date);
                    date.setDate(date.getDate() + (wk - 1) * 7 + d);
                    const dateStr = date.toISOString().slice(0, 10);
                    const hasSession = wkSessions.some((s) => s.session_date === dateStr);
                    return (
                      <div
                        key={d}
                        className="flex-1 aspect-square rounded-md"
                        style={{
                          background: hasSession
                            ? meso.deload_week === wk
                              ? "rgba(37, 84, 128, 0.6)"
                              : "var(--primary)"
                            : "var(--surface)",
                          opacity: wk > currentWeek ? 0.3 : 1,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <button onClick={endMeso} className="text-xs mt-6 block mx-auto" style={{ color: "#ff8888", minHeight: "auto" }}>
        Encerrar mesociclo
      </button>
    </div>
  );
}

function computePhases(totalWeeks: number, deloadWeek: number | null) {
  const phases: { name: string; startWeek: number; endWeek: number; tip: string }[] = [];
  const deload = deloadWeek ?? totalWeeks;
  const beforeDeload = deload - 1;
  const accEnd = Math.max(1, Math.floor(beforeDeload * 0.5));
  const intEnd = Math.max(accEnd + 1, Math.floor(beforeDeload * 0.85));

  phases.push({ name: "Acumulação", startWeek: 1, endWeek: accEnd, tip: "+ volume" });
  if (intEnd > accEnd) {
    phases.push({ name: "Intensificação", startWeek: accEnd + 1, endWeek: intEnd, tip: "+ carga" });
  }
  if (beforeDeload > intEnd) {
    phases.push({ name: "Pico", startWeek: intEnd + 1, endWeek: beforeDeload, tip: "testar PRs" });
  }
  if (deloadWeek) {
    phases.push({ name: "Deload", startWeek: deload, endWeek: deload, tip: "-40% volume" });
  }
  return phases;
}
