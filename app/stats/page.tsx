"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { fmtKg, fmtRelativeDate, MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise, PersonalRecord } from "@/lib/database.types";

interface ExerciseWithStats {
  exercise: Exercise;
  setsCount: number;
  pr?: PersonalRecord;
}

type TimeFilter = "all" | "month" | "block";

interface MuscleVolume {
  muscle: string;
  volume: number;
  pct: number;
}

export default function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [activeMesoStart, setActiveMesoStart] = useState<string | null>(null);
  const [rawSets, setRawSets] = useState<any[]>([]);
  const [rawExercises, setRawExercises] = useState<Exercise[]>([]);

  const [data, setData] = useState<ExerciseWithStats[]>([]);
  const [recentPRs, setRecentPRs] = useState<PersonalRecord[]>([]);
  const [totalVolume, setTotalVolume] = useState(0);
  const [muscleVolumes, setMuscleVolumes] = useState<MuscleVolume[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (rawSets.length > 0 || rawExercises.length > 0) {
      computeStats(rawSets, rawExercises, timeFilter, activeMesoStart);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSets, rawExercises, timeFilter, activeMesoStart]);

  async function load() {
    setLoading(true);

    const [setsRes, exRes, mesoRes] = await Promise.all([
      supabase
        .from("session_sets")
        .select("exercise_id, weight_kg, reps, performed_at, is_warmup"),
      supabase.from("exercises").select("*"),
      supabase
        .from("mesocycles")
        .select("start_date")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    const allSets = (setsRes.data as any[]) ?? [];
    const allExercises = (exRes.data as Exercise[]) ?? [];

    setRawSets(allSets);
    setRawExercises(allExercises);
    if (mesoRes.data) setActiveMesoStart((mesoRes.data as any).start_date);

    setLoading(false);
  }

  function computeStats(
    allSets: any[],
    allExercises: Exercise[],
    filter: TimeFilter,
    mesoStart: string | null
  ) {
    const now = new Date();
    const filteredSets = allSets.filter((s) => {
      const d = s.performed_at.slice(0, 10);
      if (filter === "month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        return d >= monthStart;
      }
      if (filter === "block" && mesoStart) {
        return d >= mesoStart.slice(0, 10);
      }
      return true;
    });

    const workingSets = filteredSets.filter((s) => !s.is_warmup);
    const totalVol = workingSets.reduce((sum: number, s: any) => sum + s.weight_kg * s.reps, 0);
    setTotalVolume(totalVol);

    // Agrupa por exercício
    const byExercise: Record<string, any[]> = {};
    workingSets.forEach((s: any) => {
      if (!byExercise[s.exercise_id]) byExercise[s.exercise_id] = [];
      byExercise[s.exercise_id].push(s);
    });

    const stats: ExerciseWithStats[] = allExercises
      .filter((e) => byExercise[e.id]?.length > 0)
      .map((e) => {
        const sets = byExercise[e.id];
        let bestPR: any = null;
        sets.forEach((s: any) => {
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

    const recent = stats
      .map((s) => s.pr)
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(b!.performed_at).getTime() - new Date(a!.performed_at).getTime()
      )
      .slice(0, 5) as PersonalRecord[];
    setRecentPRs(recent);

    // Volume por músculo
    const byMuscle: Record<string, number> = {};
    workingSets.forEach((s: any) => {
      const ex = allExercises.find((e) => e.id === s.exercise_id);
      if (!ex) return;
      byMuscle[ex.primary_muscle] =
        (byMuscle[ex.primary_muscle] ?? 0) + s.weight_kg * s.reps;
    });
    const maxVol = Math.max(...Object.values(byMuscle), 1);
    const muscles: MuscleVolume[] = Object.entries(byMuscle)
      .map(([muscle, vol]) => ({ muscle, volume: vol, pct: (vol / maxVol) * 100 }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 6);
    setMuscleVolumes(muscles);
  }

  const filtered = search.trim()
    ? data.filter((d) =>
        d.exercise.name.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const hasBlock = activeMesoStart !== null;

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Progressão" title="Stats" />

      {/* Filtro temporal */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "month", ...(hasBlock ? ["block"] : [])] as TimeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setTimeFilter(f)}
            className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={{
              background: timeFilter === f ? "var(--primary)" : "var(--surface)",
              color: timeFilter === f ? "var(--background)" : "var(--muted)",
              border: `0.5px solid ${timeFilter === f ? "var(--primary)" : "var(--border)"}`,
              minHeight: "auto",
            }}
          >
            {f === "all" ? "Tudo" : f === "month" ? "Este mês" : "Este bloco"}
          </button>
        ))}
      </div>

      {loading ? (
        <StatsSkeleton />
      ) : data.length === 0 ? (
        <Card variant="ghost" className="text-center py-8">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>
            Sem dados{timeFilter !== "all" ? " no período" : ""}
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            {timeFilter === "all"
              ? "Registre algumas sessões pra ver tua progressão"
              : "Nenhum dado para o período selecionado"}
          </div>
        </Card>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Exercícios
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">{data.length}</div>
            </Card>
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Volume total
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">
                {totalVolume >= 1000
                  ? `${(totalVolume / 1000).toFixed(1)}t`
                  : `${Math.round(totalVolume)}kg`}
              </div>
            </Card>
          </div>

          {/* Volume por músculo */}
          {muscleVolumes.length > 0 && (
            <>
              <Eyebrow className="mb-2">Volume por músculo</Eyebrow>
              <Card className="mb-5">
                <div className="space-y-3">
                  {muscleVolumes.map(({ muscle, volume, pct }) => (
                    <div key={muscle}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium">
                          {(MUSCLE_LABELS as Record<string, string>)[muscle] ?? muscle}
                        </span>
                        <span style={{ color: "var(--muted)" }}>
                          {volume >= 1000
                            ? `${(volume / 1000).toFixed(1)}t`
                            : `${Math.round(volume)}kg`}
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--surface-strong)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: "var(--primary)" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Melhores PRs */}
          {recentPRs.length > 0 && (
            <>
              <Eyebrow className="mb-2">Melhores PRs</Eyebrow>
              <Card className="!p-0 mb-5">
                {recentPRs.map((pr, idx) => (
                  <Link key={pr.exercise_id} href={`/stats/${pr.exercise_id}`}>
                    <div
                      className="px-4 py-3 flex justify-between items-center"
                      style={{
                        borderBottom:
                          idx < recentPRs.length - 1
                            ? "0.5px solid var(--border)"
                            : "none",
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium">{pr.exercise_name}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {fmtRelativeDate(pr.performed_at)} · {fmtKg(pr.weight_kg)}kg ×{" "}
                          {pr.reps}
                        </div>
                      </div>
                      <div
                        className="text-sm font-bold tabular"
                        style={{ color: "var(--accent)" }}
                      >
                        {fmtKg(pr.e1rm)}
                      </div>
                    </div>
                  </Link>
                ))}
              </Card>
            </>
          )}

          {/* Lista de exercícios */}
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
                      <div className="font-medium text-sm truncate">
                        {s.exercise.name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                        {(MUSCLE_LABELS as Record<string, string>)[
                          s.exercise.primary_muscle
                        ]} · {s.setsCount} séries
                      </div>
                    </div>
                    {s.pr && (
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          e1RM
                        </div>
                        <div
                          className="text-sm font-bold tabular"
                          style={{ color: "var(--accent)" }}
                        >
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

// ─── Skeleton ───────────────────────────────────────────────────────────────

function StatsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <Card className="!p-3 h-20 animate-pulse">{" "}</Card>
        <Card className="!p-3 h-20 animate-pulse">{" "}</Card>
      </div>
      <Card className="mb-5">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="flex justify-between mb-1.5">
                <div
                  className="h-3 w-24 rounded animate-pulse"
                  style={{ background: "var(--surface-strong)" }}
                />
                <div
                  className="h-3 w-12 rounded animate-pulse"
                  style={{ background: "var(--surface-strong)" }}
                />
              </div>
              <div
                className="h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--surface-strong)" }}
              />
            </div>
          ))}
        </div>
      </Card>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="!p-3 mb-2">
            <div className="flex justify-between items-center">
              <div>
                <div
                  className="h-3 w-36 rounded animate-pulse mb-1.5"
                  style={{ background: "var(--surface-strong)" }}
                />
                <div
                  className="h-2 w-24 rounded animate-pulse"
                  style={{ background: "var(--surface)" }}
                />
              </div>
              <div
                className="h-4 w-12 rounded animate-pulse"
                style={{ background: "var(--surface-strong)" }}
              />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
