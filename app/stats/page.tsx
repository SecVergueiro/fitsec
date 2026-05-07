"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Spinner } from "@/components/Button";
import { fmtKg, fmtRelativeDate, MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise, PersonalRecord } from "@/lib/database.types";

interface ExerciseWithStats {
  exercise: Exercise;
  setsCount: number;
  pr?: PersonalRecord;
}

export default function StatsPage() {
  const [data, setData] = useState<ExerciseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recentPRs, setRecentPRs] = useState<PersonalRecord[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const [setsRes, exRes, sessRes] = await Promise.all([
      supabase.from("session_sets").select("exercise_id, weight_kg, reps, performed_at, is_warmup"),
      supabase.from("exercises").select("*"),
      supabase.from("workout_sessions").select("*", { count: "exact", head: true }).not("completed_at", "is", null),
    ]);

    const allSets = (setsRes.data as any[]) ?? [];
    const allExercises = (exRes.data as Exercise[]) ?? [];

    setTotalSessions(sessRes.count ?? 0);

    // Volume total (excluindo warmups)
    const totalVol = allSets.filter((s) => !s.is_warmup).reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
    setTotalVolume(totalVol);

    // Agrupa por exercicio
    const byExercise: Record<string, any[]> = {};
    allSets.forEach((s) => {
      if (s.is_warmup) return;
      if (!byExercise[s.exercise_id]) byExercise[s.exercise_id] = [];
      byExercise[s.exercise_id].push(s);
    });

    const stats: ExerciseWithStats[] = allExercises
      .filter((e) => byExercise[e.id]?.length > 0)
      .map((e) => {
        const sets = byExercise[e.id];
        // Calcula PR (melhor e1RM)
        let bestPR: any = null;
        sets.forEach((s) => {
          const e1 = s.weight_kg * (1 + s.reps / 30);
          if (!bestPR || e1 > bestPR.e1rm) {
            bestPR = {
              exercise_id: e.id,
              exercise_name: e.name,
              weight_kg: s.weight_kg,
              reps: s.reps,
              e1rm: Math.round(e1 * 10) / 10,
              performed_at: s.performed_at,
            };
          }
        });
        return { exercise: e, setsCount: sets.length, pr: bestPR };
      })
      .sort((a, b) => (b.pr?.e1rm ?? 0) - (a.pr?.e1rm ?? 0));

    setData(stats);

    // PRs recentes (últimas 7 PRs nominais)
    const recent = stats
      .map((s) => s.pr)
      .filter(Boolean)
      .sort((a, b) => new Date(b!.performed_at).getTime() - new Date(a!.performed_at).getTime())
      .slice(0, 5) as PersonalRecord[];
    setRecentPRs(recent);

    setLoading(false);
  }

  const filtered = search.trim()
    ? data.filter((d) => d.exercise.name.toLowerCase().includes(search.toLowerCase()))
    : data;

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Progressão" title="Stats" />

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <Card variant="ghost" className="text-center py-8">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>
            Sem dados ainda
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Registre algumas sessões pra ver tua progressão
          </div>
        </Card>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Total sessões
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">{totalSessions}</div>
            </Card>
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Tonelagem total
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">
                {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${Math.round(totalVolume)}kg`}
              </div>
            </Card>
          </div>

          {/* PRs recentes */}
          {recentPRs.length > 0 && (
            <>
              <Eyebrow className="mb-2">Melhores PRs</Eyebrow>
              <Card className="!p-0 mb-5">
                {recentPRs.map((pr, idx) => (
                  <Link key={pr.exercise_id} href={`/stats/${pr.exercise_id}`}>
                    <div
                      className="px-4 py-3 flex justify-between items-center"
                      style={{
                        borderBottom: idx < recentPRs.length - 1 ? "0.5px solid var(--border)" : "none",
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium">{pr.exercise_name}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {fmtRelativeDate(pr.performed_at)} · {fmtKg(pr.weight_kg)}kg × {pr.reps}
                        </div>
                      </div>
                      <div className="text-sm font-bold tabular" style={{ color: "var(--accent)" }}>
                        {fmtKg(pr.e1rm)}
                      </div>
                    </div>
                  </Link>
                ))}
              </Card>
            </>
          )}

          {/* Lista de exercicios */}
          <Eyebrow className="mb-2">Por exercício</Eyebrow>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full rounded-lg px-3 py-2.5 text-sm mb-3"
            style={{
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              color: "var(--text)",
              outline: "none",
            }}
          />

          <div className="space-y-2">
            {filtered.map((s) => (
              <Link key={s.exercise.id} href={`/stats/${s.exercise.id}`}>
                <Card className="!p-3 mb-2">
                  <div className="flex justify-between items-center">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{s.exercise.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {MUSCLE_LABELS[s.exercise.primary_muscle]} · {s.setsCount} séries
                      </div>
                    </div>
                    {s.pr && (
                      <div className="text-right">
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          e1RM
                        </div>
                        <div className="text-sm font-bold tabular" style={{ color: "var(--accent)" }}>
                          {fmtKg(s.pr.e1rm)}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
