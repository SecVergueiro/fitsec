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
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface ExerciseWithStats {
  exercise: Exercise;
  setsCount: number;
  pr?: PersonalRecord;
}

type TimeFilter = "all" | "month" | "block";

const COMP_COLORS = ["#4493e0", "#98b5d2", "#f59e0b", "#22c55e"];
const PIE_COLORS = ["#4493e0", "#98b5d2", "#f59e0b", "#22c55e", "#f97316", "#a78bfa", "#ec4899", "#6ee7b7"];

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
  const [showMuscleAsPie, setShowMuscleAsPie] = useState(false);
  const [allSessionDates, setAllSessionDates] = useState<Set<string>>(new Set());
  const [compExercises, setCompExercises] = useState<string[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

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

    // Session dates para heatmap anual (de todos os sets, ignora filtro)
    setAllSessionDates(new Set(allSets.map((s: any) => s.performed_at.slice(0, 10))));

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

  async function exportCSV() {
    setExportLoading(true);
    const { data: sets } = await supabase
      .from("session_sets")
      .select("*, exercises(name, primary_muscle), workout_sessions(session_date)")
      .order("performed_at");
    setExportLoading(false);
    if (!sets) return;

    const headers = "data,exercicio,musculo,serie,kg,reps,rir,aquecimento,falha,e1rm";
    const rows = (sets as any[]).map((s) => {
      const e1 = Math.round(s.weight_kg * (1 + s.reps / 30) * 10) / 10;
      return [
        s.workout_sessions?.session_date ?? s.performed_at.slice(0, 10),
        `"${s.exercises?.name ?? s.exercise_id}"`,
        s.exercises?.primary_muscle ?? "",
        s.set_number,
        s.weight_kg,
        s.reps,
        s.rir ?? "",
        s.is_warmup ? "sim" : "não",
        s.is_failure ? "sim" : "não",
        e1,
      ].join(",");
    });

    const csv = [headers, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fitsec_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function toggleCompExercise(id: string) {
    setCompExercises((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]
    );
  }

  function computeCompData() {
    if (compExercises.length === 0) return { rows: [], pbs: {} as Record<string, number> };

    const pbs: Record<string, number> = {};
    compExercises.forEach((id) => {
      const sets = rawSets.filter((s: any) => s.exercise_id === id && !s.is_warmup);
      pbs[id] = sets.reduce((max: number, s: any) => Math.max(max, s.weight_kg * (1 + s.reps / 30)), 0);
    });

    const weeks: Record<string, Record<string, number>> = {};
    rawSets
      .filter((s: any) => !s.is_warmup && compExercises.includes(s.exercise_id))
      .forEach((s: any) => {
        const date = new Date(s.performed_at);
        const dow = date.getDay();
        const mon = new Date(date);
        mon.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1));
        const key = mon.toISOString().slice(0, 10);
        const e1 = s.weight_kg * (1 + s.reps / 30);
        if (!weeks[key]) weeks[key] = {};
        if (!weeks[key][s.exercise_id] || e1 > weeks[key][s.exercise_id]) {
          weeks[key][s.exercise_id] = e1;
        }
      });

    const sortedWeeks = Object.keys(weeks).sort().slice(-16);
    const rows = sortedWeeks.map((week) => {
      const entry: any = { week: week.slice(5) };
      compExercises.forEach((id) => {
        if (weeks[week][id] && pbs[id] > 0) {
          entry[id] = Math.round((weeks[week][id] / pbs[id]) * 100);
        }
      });
      return entry;
    });

    return { rows, pbs };
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
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

          {/* Export + Heatmap anual */}
          <div className="flex justify-between items-center mb-2">
            <Eyebrow>Atividade · 52 semanas</Eyebrow>
            <button
              onClick={exportCSV}
              disabled={exportLoading}
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: "var(--surface)", color: "var(--muted)", border: "0.5px solid var(--border)", minHeight: "auto" }}
            >
              {exportLoading ? "..." : "↓ CSV"}
            </button>
          </div>
          {allSessionDates.size > 0 && (
            <Card className="!p-3 mb-5">
              <YearHeatmap sessionDates={allSessionDates} />
            </Card>
          )}

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

          {/* Volume por músculo — barra ou pizza */}
          {muscleVolumes.length > 0 && (
            <>
              <div className="flex justify-between items-center mb-2">
                <Eyebrow>Volume por músculo</Eyebrow>
                <button
                  onClick={() => setShowMuscleAsPie((v) => !v)}
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--surface)", color: "var(--muted)", border: "0.5px solid var(--border)", minHeight: "auto" }}
                >
                  {showMuscleAsPie ? "Barras" : "Pizza"}
                </button>
              </div>
              <Card className="mb-5">
                {showMuscleAsPie ? (
                  <div>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={muscleVolumes}
                          dataKey="sets"
                          nameKey="muscle"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={44}
                        >
                          {muscleVolumes.map((_, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", borderRadius: 8, fontSize: 11 }}
                          formatter={(v: any, _: any, props: any) => [`${v} séries`, (MUSCLE_LABELS as Record<string, string>)[props.payload.muscle] ?? props.payload.muscle]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {muscleVolumes.map(({ muscle, sets }, idx) => (
                        <div key={muscle} className="flex items-center gap-1 text-xs">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span style={{ color: "var(--muted)" }}>{(MUSCLE_LABELS as Record<string, string>)[muscle] ?? muscle}</span>
                          <span className="font-bold tabular" style={{ color: "var(--text)" }}>{sets}s</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
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
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-strong)" }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "var(--primary)" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

          {/* Comparar exercícios — força relativa normalizada */}
          {data.length >= 2 && (
            <>
              <Eyebrow className="mb-2">Comparar exercícios</Eyebrow>
              <Card className="mb-5">
                <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                  Selecione até 4 exercícios para comparar a progressão normalizada (% do seu PR)
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {data.slice(0, 12).map((d, idx) => {
                    const selected = compExercises.includes(d.exercise.id);
                    const colorIdx = compExercises.indexOf(d.exercise.id);
                    return (
                      <button
                        key={d.exercise.id}
                        onClick={() => toggleCompExercise(d.exercise.id)}
                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{
                          minHeight: "auto",
                          background: selected ? `${COMP_COLORS[colorIdx]}20` : "var(--surface)",
                          border: `0.5px solid ${selected ? COMP_COLORS[colorIdx] : "var(--border)"}`,
                          color: selected ? COMP_COLORS[colorIdx] : "var(--muted)",
                          cursor: !selected && compExercises.length >= 4 ? "not-allowed" : "pointer",
                          opacity: !selected && compExercises.length >= 4 ? 0.45 : 1,
                        }}
                      >
                        {d.exercise.name}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  if (compExercises.length < 2) return (
                    <div className="text-xs text-center py-4" style={{ color: "var(--faint)" }}>
                      Selecione pelo menos 2 exercícios
                    </div>
                  );
                  const { rows, pbs } = computeCompData();
                  if (rows.length === 0) return <div className="text-xs text-center py-4" style={{ color: "var(--faint)" }}>Sem dados para comparar</div>;
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={rows} margin={{ top: 4, right: 5, left: -24, bottom: 0 }}>
                          <CartesianGrid stroke="rgba(237,238,239,0.05)" strokeDasharray="2 3" vertical={false} />
                          <XAxis dataKey="week" tick={{ fill: "rgba(237,238,239,0.35)", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "rgba(237,238,239,0.1)" }} interval="preserveStartEnd" />
                          <YAxis tick={{ fill: "rgba(237,238,239,0.35)", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={[60, 100]} />
                          <Tooltip
                            contentStyle={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", borderRadius: 8, fontSize: 11 }}
                            formatter={(v: any, key: any) => {
                              const ex = data.find((d) => d.exercise.id === key);
                              return [`${v}%`, ex?.exercise.name ?? key];
                            }}
                          />
                          {compExercises.map((id, i) => (
                            <Line key={id} type="monotone" dataKey={id} stroke={COMP_COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {compExercises.map((id, i) => {
                          const ex = data.find((d) => d.exercise.id === id);
                          return (
                            <div key={id} className="flex items-center gap-1 text-xs">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COMP_COLORS[i] }} />
                              <span style={{ color: "var(--muted)" }}>{ex?.exercise.name}</span>
                              <span className="font-bold tabular" style={{ color: "var(--text)" }}>{pbs[id] > 0 ? `${Math.round(pbs[id])}kg` : "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
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

// ─── YearHeatmap ────────────────────────────────────────────────────────────

function YearHeatmap({ sessionDates }: { sessionDates: Set<string> }) {
  const WEEKS = 52;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Start 52 weeks ago, aligned to Monday
  const start = new Date(today);
  start.setDate(start.getDate() - WEEKS * 7 + 1);
  const dow = start.getDay();
  start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));

  const months: { label: string; col: number }[] = [];
  let lastMonth = -1;

  return (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${WEEKS * 11}px` }}>
          <div className="space-y-1">
            {Array.from({ length: 7 }, (_, day) => (
              <div key={day} className="flex gap-1">
                {Array.from({ length: WEEKS }, (_, week) => {
                  const d = new Date(start);
                  d.setDate(d.getDate() + week * 7 + day);
                  const dateStr = d.toISOString().slice(0, 10);
                  const hasSession = sessionDates.has(dateStr);
                  const isFuture = dateStr > todayStr;
                  const isToday = dateStr === todayStr;

                  if (day === 0) {
                    const m = d.getMonth();
                    if (m !== lastMonth) {
                      lastMonth = m;
                      months.push({ label: d.toLocaleDateString("pt-BR", { month: "short" }), col: week });
                    }
                  }

                  return (
                    <div
                      key={week}
                      title={dateStr}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: hasSession
                          ? "var(--primary)"
                          : isToday
                          ? "rgba(68,147,224,0.25)"
                          : "var(--surface)",
                        opacity: isFuture ? 0.1 : 1,
                        border: isToday ? "1px solid rgba(68,147,224,0.4)" : "none",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-2 text-xs" style={{ color: "var(--faint)" }}>
        <span>Menos</span>
        {[0, 1].map((v) => (
          <div key={v} style={{ width: 10, height: 10, borderRadius: 2, background: v === 0 ? "var(--surface)" : "var(--primary)", marginTop: 1 }} />
        ))}
        <span>Mais</span>
        <span className="ml-auto">{sessionDates.size} sessões registradas</span>
      </div>
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
