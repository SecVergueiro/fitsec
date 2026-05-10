"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { fmtKg, fmtRelativeDate, MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise, PersonalRecord } from "@/lib/database.types";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface ExerciseWithStats {
  exercise: Exercise;
  setsCount: number;
  pr?: PersonalRecord;
}

type TimeFilter = "all" | "month" | "block";

interface MuscleVolume {
  muscle: string;
  volume: number;
  sets: number;
  pct: number;
}

interface WeekBucket {
  label: string;
  volume: number;
  startStr: string;
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
  const [weeklyTrend, setWeeklyTrend] = useState<WeekBucket[]>([]);
  const [bodyweightData, setBodyweightData] = useState<{ date: string; kg: number }[]>([]);
  const [weeklyFrequency, setWeeklyFrequency] = useState<number | null>(null);
  const [dayOfWeekVolume, setDayOfWeekVolume] = useState<{ day: string; sets: number; pct: number }[]>([]);
  const [deloadAlert, setDeloadAlert] = useState(false);
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

    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    const [setsRes, exRes, mesoRes, bwRes, sessRes] = await Promise.all([
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
      supabase
        .from("workout_sessions")
        .select("session_date, bodyweight_kg")
        .not("bodyweight_kg", "is", null)
        .not("completed_at", "is", null)
        .order("session_date", { ascending: true })
        .limit(60),
      supabase
        .from("workout_sessions")
        .select("session_date")
        .not("completed_at", "is", null)
        .gte("session_date", twelveWeeksAgo.toISOString().slice(0, 10)),
    ]);

    const allSets = (setsRes.data as any[]) ?? [];
    const allExercises = (exRes.data as Exercise[]) ?? [];

    setRawSets(allSets);
    setRawExercises(allExercises);
    if (mesoRes.data) setActiveMesoStart((mesoRes.data as any).start_date);

    const bwPoints = ((bwRes.data as any[]) ?? []).map((s) => ({
      date: new Date(s.session_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      kg: s.bodyweight_kg,
    }));
    setBodyweightData(bwPoints);

    // Frequência semanal média — últimas 12 semanas
    const sessionDates = ((sessRes.data as any[]) ?? []).map((s) => s.session_date);
    const sessionsByWeek: Record<string, number> = {};
    sessionDates.forEach((d: string) => {
      const date = new Date(d + "T12:00:00");
      const dow = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
      const key = monday.toISOString().slice(0, 10);
      sessionsByWeek[key] = (sessionsByWeek[key] ?? 0) + 1;
    });
    const totalSessions = Object.values(sessionsByWeek).reduce((sum, n) => sum + n, 0);
    setWeeklyFrequency(Math.round((totalSessions / 12) * 10) / 10);

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
      .sort((a, b) => (b!.e1rm) - (a!.e1rm))
      .slice(0, 5) as PersonalRecord[];
    setRecentPRs(recent);

    // Volume por músculo (tonelagem + contagem de séries)
    const byMuscle: Record<string, { volume: number; sets: number }> = {};
    workingSets.forEach((s: any) => {
      const ex = allExercises.find((e) => e.id === s.exercise_id);
      if (!ex) return;
      const key = ex.primary_muscle;
      if (!byMuscle[key]) byMuscle[key] = { volume: 0, sets: 0 };
      byMuscle[key].volume += s.weight_kg * s.reps;
      byMuscle[key].sets++;
    });
    const maxSets = Math.max(...Object.values(byMuscle).map((d) => d.sets), 1);
    const muscles: MuscleVolume[] = Object.entries(byMuscle)
      .map(([muscle, d]) => ({ muscle, volume: d.volume, sets: d.sets, pct: (d.sets / maxSets) * 100 }))
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 8);
    setMuscleVolumes(muscles);

    // Volume semanal — últimas 8 semanas (sempre usa todos os sets, ignora filtro temporal)
    const allWorkingSets = allSets.filter((s: any) => !s.is_warmup);
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setDate(now.getDate() - now.getDay());
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    const trend: WeekBucket[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(startOfCurrentWeek);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const startStr = weekStart.toISOString().slice(0, 10);
      const endStr = weekEnd.toISOString().slice(0, 10);
      const vol = allWorkingSets
        .filter((s: any) => {
          const d = s.performed_at.slice(0, 10);
          return d >= startStr && d < endStr;
        })
        .reduce((sum: number, s: any) => sum + s.weight_kg * s.reps, 0);
      trend.push({
        label: weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        volume: Math.round(vol),
        startStr,
      });
    }
    setWeeklyTrend(trend);

    // Volume por dia da semana
    const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const byDow: Record<number, number> = {};
    allWorkingSets.forEach((s: any) => {
      const dow = new Date(s.performed_at).getDay();
      byDow[dow] = (byDow[dow] ?? 0) + 1;
    });
    const maxDowSets = Math.max(...Object.values(byDow), 1);
    const dowData = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      day: DAY_LABELS[d],
      sets: byDow[d] ?? 0,
      pct: ((byDow[d] ?? 0) / maxDowSets) * 100,
    }));
    setDayOfWeekVolume(dowData);

    // Alerta de deload
    const thisWeekVol = allWorkingSets
      .filter((s: any) => s.performed_at.slice(0, 10) >= trend[trend.length - 1]?.startStr)
      .reduce((sum: number, s: any) => sum + s.weight_kg * s.reps, 0);
    const past4Vols = trend.slice(-5, -1).map((w) =>
      allWorkingSets
        .filter((s: any) => {
          const d = s.performed_at.slice(0, 10);
          return d >= w.startStr && d < trend[trend.findIndex((t) => t.startStr === w.startStr) + 1]?.startStr;
        })
        .reduce((sum: number, s: any) => sum + s.weight_kg * s.reps, 0)
    );
    const avg4 = past4Vols.reduce((sum, v) => sum + v, 0) / 4;
    setDeloadAlert(avg4 > 500 && thisWeekVol < avg4 * 0.65 && now.getDay() >= 3);
  }

  const filtered = search.trim()
    ? data.filter((d) => d.exercise.name.toLowerCase().includes(search.toLowerCase()))
    : data;

  const hasBlock = activeMesoStart !== null;
  const hasTrend = weeklyTrend.some((w) => w.volume > 0);

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
      ) : data.length === 0 && !hasTrend ? (
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
          {/* Alerta de deload */}
          {deloadAlert && (
            <div
              className="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
              style={{ background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.3)" }}
            >
              <span style={{ color: "#fbbf24", fontSize: 18, lineHeight: 1 }}>⚡</span>
              <div>
                <div className="text-sm font-bold" style={{ color: "#fbbf24" }}>Volume abaixo do normal</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  Esta semana está mais de 35% abaixo da sua média. Pode ser hora de um deload planejado, ou verifique se não perdeu sessões.
                </div>
              </div>
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Exercícios
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">{data.length}</div>
            </Card>
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Volume
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">
                {totalVolume >= 1000
                  ? `${(totalVolume / 1000).toFixed(1)}t`
                  : `${Math.round(totalVolume)}kg`}
              </div>
            </Card>
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Freq/sem
              </div>
              <div className="text-2xl font-bold tabular mt-0.5">
                {weeklyFrequency !== null ? weeklyFrequency : "—"}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--faint)" }}>12 sem</div>
            </Card>
          </div>

          {/* Volume semanal — tendência 8 semanas */}
          {hasTrend && (
            <>
              <Eyebrow className="mb-2">Volume semanal · 8 semanas</Eyebrow>
              <Card className="!p-3 mb-5">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart
                    data={weeklyTrend}
                    margin={{ top: 8, right: 5, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgba(237, 238, 239, 0.05)"
                      strokeDasharray="2 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "rgba(237, 238, 239, 0.35)", fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(237, 238, 239, 0.1)" }}
                      interval={1}
                    />
                    <YAxis
                      tick={{ fill: "rgba(237, 238, 239, 0.35)", fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}`
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--background)",
                        border: "0.5px solid var(--border-strong)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "var(--muted)" }}
                      formatter={(v: any) => [
                        v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v} kg`,
                        "volume",
                      ]}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar
                      dataKey="volume"
                      fill="var(--primary)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}

          {/* Peso corporal */}
          {bodyweightData.length >= 2 && (
            <>
              <Eyebrow className="mb-2">Peso corporal · {bodyweightData.length} registros</Eyebrow>
              <Card className="!p-3 mb-5">
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart
                    data={bodyweightData}
                    margin={{ top: 8, right: 5, left: -22, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgba(237, 238, 239, 0.05)"
                      strokeDasharray="2 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "rgba(237, 238, 239, 0.35)", fontSize: 9 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(237, 238, 239, 0.1)" }}
                      interval={Math.max(0, Math.floor(bodyweightData.length / 5) - 1)}
                    />
                    <YAxis
                      tick={{ fill: "rgba(237, 238, 239, 0.35)", fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}`}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--background)",
                        border: "0.5px solid var(--border-strong)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "var(--muted)" }}
                      formatter={(v: any) => [`${v} kg`, "peso"]}
                      cursor={{ stroke: "rgba(237,238,239,0.15)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="kg"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "var(--accent)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs mt-2" style={{ color: "var(--muted)" }}>
                  <span>Mín: {Math.min(...bodyweightData.map((d) => d.kg))} kg</span>
                  <span>Máx: {Math.max(...bodyweightData.map((d) => d.kg))} kg</span>
                  <span>Último: {bodyweightData[bodyweightData.length - 1].kg} kg</span>
                </div>
              </Card>
            </>
          )}

          {/* Volume por músculo */}
          {muscleVolumes.length > 0 && (
            <>
              <Eyebrow className="mb-2">Volume por músculo</Eyebrow>
              <Card className="mb-5">
                <div className="space-y-3">
                  {muscleVolumes.map(({ muscle, volume, sets, pct }) => (
                    <div key={muscle}>
                      <div className="flex justify-between items-baseline text-xs mb-1.5">
                        <span className="font-medium">
                          {(MUSCLE_LABELS as Record<string, string>)[muscle] ?? muscle}
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold tabular" style={{ color: "var(--accent)" }}>
                            {sets} {sets === 1 ? "série" : "séries"}
                          </span>
                          <span style={{ color: "var(--faint)" }}>
                            {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
                          </span>
                        </div>
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

          {/* Volume por dia da semana */}
          {dayOfWeekVolume.some((d) => d.sets > 0) && (
            <>
              <Eyebrow className="mb-2">Volume por dia da semana</Eyebrow>
              <Card className="mb-5">
                <div className="space-y-2.5">
                  {dayOfWeekVolume.map(({ day, sets, pct }) => (
                    <div key={day} className="flex items-center gap-3">
                      <div className="text-xs font-bold w-7 flex-shrink-0 tabular" style={{ color: "var(--muted)" }}>
                        {day}
                      </div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-strong)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: "var(--accent)" }}
                        />
                      </div>
                      <div className="text-xs tabular font-medium w-12 text-right flex-shrink-0" style={{ color: sets > 0 ? "var(--text)" : "var(--faint)" }}>
                        {sets > 0 ? `${sets}s` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Top 5 e1RM */}
          {recentPRs.length > 0 && (
            <>
              <Eyebrow className="mb-2">Top 5 e1RM</Eyebrow>
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
          {data.length > 0 && (
            <>
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
                            {(MUSCLE_LABELS as Record<string, string>)[s.exercise.primary_muscle]} · {s.setsCount} séries
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
      <Card className="mb-5 h-36 animate-pulse">{" "}</Card>
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
