"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui";
import { Spinner } from "@/components/Button";
import { estimate1RM, fmtKg, fmtDuration, fmtTonnage } from "@/lib/utils";
import type { Exercise, SessionSet, WorkoutSession } from "@/lib/database.types";

interface ExSummary {
  exercise: Exercise;
  realSets: SessionSet[];
  isPR: boolean;
  sessionBest: { weight: number; reps: number; e1rm: number };
}

export default function PublicSessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [summary, setSummary] = useState<ExSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    load();
  }, [sessionId]);

  async function load() {
    setLoading(true);

    const [sessionRes, exRes, setsRes] = await Promise.all([
      supabase.from("workout_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("session_exercises").select("*, exercise:exercises(*)").eq("session_id", sessionId).order("exercise_order"),
      supabase.from("session_sets").select("*").eq("session_id", sessionId),
    ]);

    if (!sessionRes.data || !sessionRes.data.completed_at) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setSession(sessionRes.data as WorkoutSession);

    const exList = (exRes.data as any[]) ?? [];
    const allSets = (setsRes.data as SessionSet[]) ?? [];

    const enriched = await Promise.all(
      exList.map(async (ex) => {
        const exAllSets = allSets.filter((s) => s.exercise_id === ex.exercise_id);
        const exRealSets = exAllSets.filter((s) => !s.is_warmup);

        const sessionBest =
          exRealSets.length > 0
            ? exRealSets.reduce(
                (best, s) => {
                  const e1 = estimate1RM(s.weight_kg, s.reps);
                  return e1 > best.e1rm ? { weight: s.weight_kg, reps: s.reps, e1rm: e1 } : best;
                },
                { weight: 0, reps: 0, e1rm: 0 }
              )
            : { weight: 0, reps: 0, e1rm: 0 };

        let prevBest1RM = 0;
        if (sessionBest.e1rm > 0) {
          const { data: prevSets } = await supabase
            .from("session_sets")
            .select("weight_kg, reps")
            .eq("exercise_id", ex.exercise_id)
            .eq("is_warmup", false)
            .neq("session_id", sessionId)
            .limit(100);

          if (prevSets && prevSets.length > 0) {
            prevBest1RM = Math.max(...(prevSets as any[]).map((s) => estimate1RM(s.weight_kg, s.reps)));
          }
        }

        return {
          exercise: ex.exercise as Exercise,
          realSets: exRealSets,
          isPR: sessionBest.e1rm > 0 && sessionBest.e1rm > prevBest1RM,
          sessionBest,
        };
      })
    );

    setSummary(enriched);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <Spinner />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5" style={{ background: "var(--background)" }}>
        <div className="text-center">
          <div className="text-4xl font-black mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: "var(--primary)" }}>FITSEC</div>
          <div className="font-bold mb-1">Sessão não encontrada</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>Este link é inválido ou a sessão foi removida.</div>
        </div>
      </div>
    );
  }

  const allWorkingSets = summary.flatMap((e) => e.realSets);
  const tonnage = allWorkingSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
  const prs = summary.filter((e) => e.isPR);
  const duration = session!.duration_minutes ?? 0;
  const dateStr = new Date(session!.session_date + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <div className="max-w-md mx-auto px-5 pt-8 pb-12">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-2xl font-black mb-4" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em", color: "var(--primary)" }}>
            FITSEC
          </div>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "rgba(152, 181, 210, 0.10)", border: "0.5px solid var(--border-strong)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polyline points="20 6 9 17 4 12" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-1">Treino concluído</h1>
          <p className="text-sm capitalize" style={{ color: "var(--muted)" }}>{dateStr}</p>
        </div>

        {/* Stats */}
        <Card variant="strong" className="mb-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {[
              { label: "Duração", value: duration > 0 ? fmtDuration(duration) : "—" },
              { label: "Séries", value: String(allWorkingSets.length) },
              { label: "Exercícios", value: String(summary.length) },
              { label: "Volume", value: fmtTonnage(tonnage) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
                <div className="text-xl font-bold tabular">{value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* PRs */}
        {prs.length > 0 && (
          <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.28)" }}>
            <div className="text-sm font-bold mb-2" style={{ color: "#fbbf24" }}>
              🏆 {prs.length === 1 ? "Novo recorde pessoal!" : `${prs.length} novos recordes!`}
            </div>
            {prs.map((pr) => (
              <div key={pr.exercise.id} className="flex justify-between items-center">
                <span className="text-sm font-medium">{pr.exercise.name}</span>
                <span className="text-sm font-bold tabular" style={{ color: "#fbbf24" }}>{fmtKg(pr.sessionBest.e1rm)} e1RM</span>
              </div>
            ))}
          </div>
        )}

        {/* Energy */}
        {session!.energy_level && (
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Energia</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="rounded" style={{ width: "16px", height: "16px", background: i <= session!.energy_level! ? "var(--accent)" : "var(--surface-strong)" }} />
                ))}
              </div>
            </div>
            {session!.notes && <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>{session!.notes}</p>}
          </Card>
        )}

        {/* Exercises */}
        <div className="text-xs font-bold mb-2" style={{ color: "var(--faint)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Exercícios
        </div>
        <Card className="!p-0 mb-6">
          {summary.map((ex, idx) => {
            const maxWeight = ex.realSets.length > 0 ? Math.max(...ex.realSets.map((s) => s.weight_kg)) : 0;
            return (
              <div key={ex.exercise.id} className="flex items-center gap-3 px-4"
                style={{ paddingTop: 12, paddingBottom: 12, borderTop: idx > 0 ? "0.5px solid var(--border)" : "none" }}>
                <div className="rounded-md flex items-center justify-center font-bold text-xs flex-shrink-0"
                  style={{ width: 22, height: 22, background: "rgba(152,181,210,0.08)", color: "var(--primary)" }}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {ex.exercise.name}
                    {ex.isPR && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(68,147,224,0.15)", color: "var(--accent)" }}>PR</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {ex.realSets.length} séries · {ex.realSets.map((s) => `${fmtKg(s.weight_kg)}×${s.reps}`).join(", ")}
                  </div>
                </div>
                {maxWeight > 0 && (
                  <span className="text-sm tabular font-medium flex-shrink-0" style={{ color: "var(--muted)" }}>
                    {fmtKg(maxWeight)} kg
                  </span>
                )}
              </div>
            );
          })}
        </Card>

        {/* Footer */}
        <div className="text-center text-xs" style={{ color: "var(--faint)" }}>
          Registrado com FitSec · fitsec.app
        </div>
      </div>
    </div>
  );
}
