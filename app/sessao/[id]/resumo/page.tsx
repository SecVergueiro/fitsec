"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { estimate1RM, fmtDuration, fmtKg, fmtTonnage } from "@/lib/utils";
import type { Exercise, SessionSet, WorkoutSession } from "@/lib/database.types";

interface ExSummary {
  id: string;
  exercise: Exercise;
  allSets: SessionSet[];
  realSets: SessionSet[];
  isPR: boolean;
  sessionBest: { weight: number; reps: number; e1rm: number };
  prevBest1RM: number;
}

export default function ResumoPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [summary, setSummary] = useState<ExSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [sessionId]);

  async function load() {
    setLoading(true);

    const [sessionRes, exRes, setsRes] = await Promise.all([
      supabase.from("workout_sessions").select("*").eq("id", sessionId).single(),
      supabase
        .from("session_exercises")
        .select("*, exercise:exercises(*)")
        .eq("session_id", sessionId)
        .order("exercise_order"),
      supabase.from("session_sets").select("*").eq("session_id", sessionId),
    ]);

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
            prevBest1RM = Math.max(
              ...(prevSets as any[]).map((s) => estimate1RM(s.weight_kg, s.reps))
            );
          }
        }

        return {
          id: ex.id,
          exercise: ex.exercise as Exercise,
          allSets: exAllSets,
          realSets: exRealSets,
          isPR: sessionBest.e1rm > 0 && sessionBest.e1rm > prevBest1RM,
          sessionBest,
          prevBest1RM,
        };
      })
    );

    setSummary(enriched);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fade-in text-center py-10">
        <p style={{ color: "var(--muted)" }}>Sessão não encontrada</p>
        <Link href="/">
          <Button variant="secondary" className="mt-4" size="sm">
            Voltar ao início
          </Button>
        </Link>
      </div>
    );
  }

  const allWorkingSets = summary.flatMap((e) => e.realSets);
  const tonnage = allWorkingSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
  const prs = summary.filter((e) => e.isPR);
  const duration = session.duration_minutes ?? 0;

  return (
    <div className="fade-in">
      {/* Cabeçalho de conclusão */}
      <div className="text-center pt-4 pb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{
            background: "rgba(152, 181, 210, 0.10)",
            border: "0.5px solid var(--border-strong)",
          }}
        >
          <CheckIcon />
        </div>
        <h1
          className="text-3xl mb-1.5"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.01em" }}
        >
          Treino concluído
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {new Date(session.session_date + "T12:00:00").toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>

      {/* Energia, peso corporal e notas */}
      {(session.energy_level || session.bodyweight_kg || session.notes) && (
        <Card className="mb-4">
          <div className="space-y-3">
            {session.bodyweight_kg && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Peso corporal
                </span>
                <span className="text-sm font-bold tabular">{fmtKg(session.bodyweight_kg)} kg</span>
              </div>
            )}
            {session.energy_level && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Energia
                </span>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="rounded"
                      style={{
                        width: "18px",
                        height: "18px",
                        background: i <= session.energy_level! ? "var(--accent)" : "var(--surface-strong)",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {session.notes && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {session.notes}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Grade de estatísticas */}
      <Card variant="strong" className="mb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat label="Duração" value={duration > 0 ? fmtDuration(duration) : "—"} />
          <Stat label="Séries" value={String(allWorkingSets.length)} />
          <Stat label="Exercícios" value={String(summary.length)} />
          <Stat label="Volume" value={fmtTonnage(tonnage)} />
        </div>
      </Card>

      {/* Seção de PRs */}
      {prs.length > 0 && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: "linear-gradient(135deg, rgba(251, 191, 36, 0.10) 0%, rgba(251, 191, 36, 0.04) 100%)",
            border: "0.5px solid rgba(251, 191, 36, 0.28)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrophyIcon />
            <span className="text-sm font-bold" style={{ color: "#fbbf24" }}>
              {prs.length === 1 ? "Novo recorde pessoal!" : `${prs.length} novos recordes pessoais!`}
            </span>
          </div>
          <div className="space-y-2.5">
            {prs.map((pr) => (
              <div key={pr.id} className="flex justify-between items-center">
                <span className="text-sm font-medium">{pr.exercise.name}</span>
                <div className="flex items-center gap-2">
                  {pr.prevBest1RM > 0 && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      +{fmtKg(pr.sessionBest.e1rm - pr.prevBest1RM)} kg
                    </span>
                  )}
                  <span className="text-sm font-bold tabular" style={{ color: "#fbbf24" }}>
                    {fmtKg(pr.sessionBest.e1rm)} e1RM
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de exercícios */}
      <Eyebrow className="mb-2">Exercícios realizados</Eyebrow>
      <Card className="mb-5 !p-0">
        {summary.map((ex, idx) => {
          const maxWeight =
            ex.realSets.length > 0 ? Math.max(...ex.realSets.map((s) => s.weight_kg)) : 0;

          return (
            <div
              key={ex.id}
              className="flex items-center gap-3 px-4"
              style={{
                paddingTop: "12px",
                paddingBottom: "12px",
                borderTop: idx > 0 ? "0.5px solid var(--border)" : "none",
              }}
            >
              {/* Número */}
              <div
                className="flex-shrink-0 rounded-md flex items-center justify-center font-bold text-xs"
                style={{
                  width: "24px",
                  height: "24px",
                  background: "rgba(152, 181, 210, 0.08)",
                  color: "var(--primary)",
                }}
              >
                {idx + 1}
              </div>

              {/* Nome + sets */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{ex.exercise.name}</span>
                  {ex.isPR && (
                    <Pill variant="accent" className="flex-shrink-0">
                      PR
                    </Pill>
                  )}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {ex.realSets.length} {ex.realSets.length === 1 ? "série" : "séries"}
                  {ex.allSets.some((s) => s.is_warmup) && " + aquecimento"}
                </div>
              </div>

              {/* Peso máximo */}
              {maxWeight > 0 && (
                <span className="text-sm tabular font-medium flex-shrink-0" style={{ color: "var(--muted)" }}>
                  {fmtKg(maxWeight)} kg
                </span>
              )}
            </div>
          );
        })}

        {summary.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
            Nenhum exercício registrado
          </div>
        )}
      </Card>

      {/* Botões de ação */}
      <div className="flex gap-2">
        <Link href="/" className="flex-1">
          <Button variant="primary" fullWidth>
            Início
          </Button>
        </Link>
        <Link href={`/sessao/${sessionId}`} className="flex-1">
          <Button variant="secondary" fullWidth>
            Ver detalhes
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Componentes auxiliares ─────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-xs font-bold mb-1"
        style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        {label}
      </div>
      <div className="text-xl font-bold tabular">{value}</div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <polyline
        points="20 6 9 17 4 12"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M8 21h8M12 17v4M17 3H7L8.5 10.5A4.5 4.5 0 0 0 12 14a4.5 4.5 0 0 0 3.5-3.5L17 3Z"
        stroke="#fbbf24"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 3H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 3h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"
        stroke="#fbbf24"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
