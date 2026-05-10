"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow } from "@/components/ui";
import { Spinner } from "@/components/Button";
import { estimate1RM, fmtKg, fmtRelativeDate, MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise, SessionSet } from "@/lib/database.types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  ComposedChart,
  BarChart,
  Bar,
} from "recharts";

interface SetWithE1RM extends SessionSet {
  e1rm: number;
  date: string;
}

export default function ExerciseStatsPage() {
  const params = useParams();
  const exerciseId = params.exerciseId as string;
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [sets, setSets] = useState<SetWithE1RM[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [exerciseId]);

  async function load() {
    setLoading(true);
    const [exRes, setsRes] = await Promise.all([
      supabase.from("exercises").select("*").eq("id", exerciseId).single(),
      supabase
        .from("session_sets")
        .select("*")
        .eq("exercise_id", exerciseId)
        .eq("is_warmup", false)
        .order("performed_at", { ascending: true }),
    ]);

    setExercise(exRes.data as Exercise);
    const enriched: SetWithE1RM[] = (setsRes.data as SessionSet[]).map((s) => ({
      ...s,
      e1rm: estimate1RM(s.weight_kg, s.reps),
      date: new Date(s.performed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
    setSets(enriched);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!exercise) return <div>Exercício não encontrado</div>;

  // Agrupa por sessao, pegando melhor e1RM de cada
  const bySession: Record<string, SetWithE1RM[]> = {};
  sets.forEach((s) => {
    if (!bySession[s.session_id]) bySession[s.session_id] = [];
    bySession[s.session_id].push(s);
  });

  const sessionData = Object.values(bySession)
    .map((sessionSets) => {
      const best = sessionSets.reduce((acc, s) => (s.e1rm > acc.e1rm ? s : acc), sessionSets[0]);
      const totalVolume = sessionSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
      return {
        date: best.date,
        e1rm: best.e1rm,
        weight: best.weight_kg,
        reps: best.reps,
        volume: Math.round(totalVolume),
        performed_at: best.performed_at,
      };
    })
    .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());

  const allTimeBest = sessionData.length > 0 ? Math.max(...sessionData.map((s) => s.e1rm)) : 0;
  const firstE1RM = sessionData[0]?.e1rm ?? 0;
  const currentE1RM = sessionData[sessionData.length - 1]?.e1rm ?? 0;
  const pctChange = firstE1RM > 0 ? ((currentE1RM - firstE1RM) / firstE1RM) * 100 : 0;

  return (
    <div className="fade-in">
      <Link href="/stats" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Stats
      </Link>
      <div className="mb-5">
        <Eyebrow>{MUSCLE_LABELS[exercise.primary_muscle]}</Eyebrow>
        <h1 className="text-2xl mt-1">{exercise.name}</h1>
      </div>

      {sessionData.length === 0 ? (
        <Card variant="ghost" className="text-center py-8">
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Nenhuma série registrada
          </div>
        </Card>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                e1RM atual
              </div>
              <div className="text-xl font-bold tabular mt-0.5" style={{ color: "var(--accent)" }}>
                {fmtKg(currentE1RM)}
              </div>
            </Card>
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Melhor PR
              </div>
              <div className="text-xl font-bold tabular mt-0.5">{fmtKg(allTimeBest)}</div>
            </Card>
            <Card className="!p-3">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Variação
              </div>
              <div
                className="text-xl font-bold tabular mt-0.5"
                style={{ color: pctChange >= 0 ? "var(--accent)" : "#ff8888" }}
              >
                {pctChange > 0 ? "+" : ""}
                {pctChange.toFixed(1)}%
              </div>
            </Card>
          </div>

          {/* Grafico e1RM */}
          {sessionData.length > 1 && (
            <>
              <Eyebrow className="mb-2">e1RM ao longo do tempo</Eyebrow>
              <Card className="!p-3 mb-5">
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={sessionData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="e1rmGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4493e0" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#4493e0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(237, 238, 239, 0.05)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "rgba(237, 238, 239, 0.4)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(237, 238, 239, 0.1)" }}
                    />
                    <YAxis
                      tick={{ fill: "rgba(237, 238, 239, 0.4)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
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
                      formatter={(v: any) => [`${v} kg`, "e1RM"]}
                    />
                    <Area type="monotone" dataKey="e1rm" stroke="none" fill="url(#e1rmGrad)" />
                    <Line
                      type="monotone"
                      dataKey="e1rm"
                      stroke="#4493e0"
                      strokeWidth={2}
                      dot={{ fill: "#4493e0", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              {/* Volume por sessao */}
              <Eyebrow className="mb-2">Volume por sessão</Eyebrow>
              <Card className="!p-3 mb-5">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={sessionData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(237, 238, 239, 0.05)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "rgba(237, 238, 239, 0.4)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(237, 238, 239, 0.1)" }}
                    />
                    <YAxis
                      tick={{ fill: "rgba(237, 238, 239, 0.4)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--background)",
                        border: "0.5px solid var(--border-strong)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "var(--muted)" }}
                      formatter={(v: any) => [`${v} kg`, "volume"]}
                    />
                    <Bar dataKey="volume" fill="#98b5d2" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}

          {/* Zonas de treino baseadas no PR */}
          <Eyebrow className="mb-2">Zonas de treino</Eyebrow>
          <Card className="!p-0 mb-5">
            {[
              { pct: 95, label: "Força máxima", reps: "1–2" },
              { pct: 85, label: "Força", reps: "3–5" },
              { pct: 75, label: "Hipertrofia", reps: "6–10" },
              { pct: 65, label: "Volume", reps: "10–15" },
              { pct: 55, label: "Resistência", reps: "15+" },
            ].map(({ pct, label, reps }, idx, arr) => (
              <div
                key={pct}
                className="px-4 py-2.5 flex justify-between items-center"
                style={{ borderBottom: idx < arr.length - 1 ? "0.5px solid var(--border)" : "none" }}
              >
                <div>
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>{reps} reps</span>
                </div>
                <span className="text-sm font-bold tabular" style={{ color: "var(--primary)" }}>
                  {fmtKg(Math.round(allTimeBest * pct / 100 * 2) / 2)} kg
                </span>
              </div>
            ))}
          </Card>

          {/* Historico detalhado */}
          <Eyebrow className="mb-2">Histórico · {sessionData.length} sessões</Eyebrow>
          <Card className="!p-0">
            {sessionData
              .slice()
              .reverse()
              .map((s, idx) => (
                <div
                  key={idx}
                  className="px-4 py-3 flex justify-between items-center"
                  style={{
                    borderBottom: idx < sessionData.length - 1 ? "0.5px solid var(--border)" : "none",
                  }}
                >
                  <div>
                    <div className="text-sm font-medium tabular">
                      {fmtKg(s.weight)}kg × {s.reps}
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {fmtRelativeDate(s.performed_at)}
                    </div>
                  </div>
                  <div className="text-sm font-bold tabular" style={{ color: "var(--accent)" }}>
                    {fmtKg(s.e1rm)}
                  </div>
                </div>
              ))}
          </Card>
        </>
      )}
    </div>
  );
}
