"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, Pill } from "@/components/ui";
import type { Mesocycle, Template, TemplateDay, WorkoutSession } from "@/lib/database.types";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [activeMeso, setActiveMeso] = useState<Mesocycle | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [todayDay, setTodayDay] = useState<TemplateDay | null>(null);
  const [todayExerciseCount, setTodayExerciseCount] = useState(0);
  const [weekSessions, setWeekSessions] = useState<WorkoutSession[]>([]);
  const [weeklyVolume, setWeeklyVolume] = useState<number | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [heatmapSessions, setHeatmapSessions] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    // 1. Mesociclo ativo
    const { data: mesoData } = await supabase
      .from("mesocycles")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveMeso(mesoData);

    // 2. Template ativo (do mesociclo ou marcado is_active)
    let templateId = mesoData?.template_id;
    if (!templateId) {
      const { data: tpl } = await supabase
        .from("templates")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (tpl) {
        setActiveTemplate(tpl);
        templateId = tpl.id;
      }
    } else {
      const { data: tpl } = await supabase
        .from("templates")
        .select("*")
        .eq("id", templateId)
        .single();
      setActiveTemplate(tpl);
    }

    // 3. Dia de hoje (baseado em weekday)
    const todayWeekday = new Date().getDay();
    if (templateId) {
      const { data: dayData } = await supabase
        .from("template_days")
        .select("*")
        .eq("template_id", templateId)
        .eq("weekday", todayWeekday)
        .maybeSingle();

      setTodayDay(dayData);

      if (dayData) {
        const { count } = await supabase
          .from("template_exercises")
          .select("*", { count: "exact", head: true })
          .eq("template_day_id", dayData.id);
        setTodayExerciseCount(count ?? 0);
      }
    }

    // 4. Sessoes da semana atual
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("*")
      .gte("session_date", startOfWeek.toISOString().slice(0, 10));

    setWeekSessions(sessions ?? []);

    // 5. Volume da semana (soma weight*reps das series nao-warmup)
    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map((s) => s.id);
      const { data: sets } = await supabase
        .from("session_sets")
        .select("weight_kg, reps, is_warmup")
        .in("session_id", sessionIds);

      const total =
        sets?.filter((s) => !s.is_warmup).reduce((sum, s) => sum + s.weight_kg * s.reps, 0) ?? 0;
      setWeeklyVolume(total);
    } else {
      setWeeklyVolume(0);
    }

    // 6. Sequência + heatmap — últimas 16 semanas (112 dias)
    const sixteenWeeksAgo = new Date();
    sixteenWeeksAgo.setDate(sixteenWeeksAgo.getDate() - 112);
    const { data: recentCompleted } = await supabase
      .from("workout_sessions")
      .select("session_date, completed_at")
      .not("completed_at", "is", null)
      .gte("session_date", sixteenWeeksAgo.toISOString().slice(0, 10))
      .order("session_date", { ascending: false });

    setStreak(computeStreak(recentCompleted ?? []));
    setHeatmapSessions(new Set((recentCompleted ?? []).map((s) => s.session_date)));

    setLoading(false);
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const todayDayOfWeek = today.getDay();

  return (
    <div className="fade-in">
      <Eyebrow>{dateStr}</Eyebrow>
      <h1
        className="text-4xl mt-1 mb-5"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.01em" }}
      >
        Boa, Sec.
      </h1>

      {/* Treino de hoje */}
      {loading ? (
        <Card className="mb-4 h-36 animate-pulse">{" "}</Card>
      ) : todayDay ? (
        <Link href="/sessao">
          <Card variant="strong" className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="eyebrow" style={{ color: "var(--text)" }}>
                Treino de hoje
              </span>
              <Pill variant="primary">{todayDay.name}</Pill>
            </div>
            <div className="text-lg font-bold mb-3">
              {activeTemplate?.name ?? "Sem template"}
            </div>
            <div className="flex justify-between text-sm" style={{ color: "var(--muted)" }}>
              <span>{todayExerciseCount} exercícios</span>
              {activeMeso && (
                <span>
                  Semana {weekNumber(activeMeso.start_date)} / {activeMeso.total_weeks}
                </span>
              )}
            </div>
            <div
              className="mt-4 py-3 rounded-lg text-center text-sm font-bold"
              style={{
                background: "var(--primary)",
                color: "var(--background)",
                letterSpacing: "0.02em",
              }}
            >
              Iniciar sessão →
            </div>
          </Card>
        </Link>
      ) : (
        <Card variant="ghost" className="mb-4 text-center">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>
            Dia de descanso
          </div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Sem treino programado pra hoje
          </div>
        </Card>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Card className="!p-3 h-20 animate-pulse">{" "}</Card>
          <Card className="!p-3 h-20 animate-pulse">{" "}</Card>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Card className="!p-3">
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Volume / sem
            </div>
            <div className="text-2xl font-bold tabular mt-0.5">
              {weeklyVolume === null ? "—" : formatTonnage(weeklyVolume)}
            </div>
            <div className="text-xs font-medium" style={{ color: "var(--accent)" }}>
              {weekSessions.length} sessões
            </div>
          </Card>
          <Card className="!p-3">
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Sequência
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <div className="text-2xl font-bold tabular">{streak}</div>
              <div className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                {streak === 1 ? "dia" : "dias"}
              </div>
            </div>
            <div
              className="text-xs mt-0.5"
              style={{ color: streak > 0 ? "var(--accent)" : "var(--faint)" }}
            >
              {streak === 0
                ? "sem sequência"
                : streak === 1
                ? "dia seguido"
                : "dias seguidos"}
            </div>
          </Card>
        </div>
      )}

      {/* Calendario semanal */}
      <Eyebrow className="mt-5 mb-2">Esta semana</Eyebrow>
      {loading ? (
        <Card className="!p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="aspect-square rounded-md animate-pulse"
                style={{ background: "var(--surface-strong)" }}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card className="!p-3">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((label, idx) => {
              const isToday = idx === todayDayOfWeek;
              const isPast = idx < todayDayOfWeek;
              const sessionDate = new Date();
              sessionDate.setDate(sessionDate.getDate() - (todayDayOfWeek - idx));
              const dStr = sessionDate.toISOString().slice(0, 10);
              const hasSession = weekSessions.some((s) => s.session_date === dStr);

              return (
                <div
                  key={idx}
                  className="aspect-square rounded-md flex items-center justify-center text-xs font-medium"
                  style={
                    isToday
                      ? {
                          background: "var(--background)",
                          border: "1.5px solid var(--accent)",
                          color: "var(--accent)",
                          fontWeight: 700,
                        }
                      : hasSession
                      ? {
                          background: "var(--primary)",
                          color: "var(--background)",
                        }
                      : {
                          background: "var(--surface)",
                          color: isPast ? "var(--faint)" : "var(--muted)",
                        }
                  }
                >
                  {label}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Heatmap de treinos — últimas 16 semanas */}
      {!loading && heatmapSessions.size > 0 && (
        <>
          <Eyebrow className="mt-5 mb-2">Histórico · 16 semanas</Eyebrow>
          <Card className="!p-3 mb-4">
            <TrainingHeatmap sessionDates={heatmapSessions} />
          </Card>
        </>
      )}

      {/* Atalhos rapidos */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <Link href="/biblioteca">
          <Card className="!p-3 text-center">
            <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
              Biblioteca →
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              gerenciar exercícios
            </div>
          </Card>
        </Link>
        <Link href="/treinos">
          <Card className="!p-3 text-center">
            <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
              Templates →
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              fichas e mesociclos
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

// ─── Heatmap de treinos ─────────────────────────────────────────────────────

function TrainingHeatmap({ sessionDates }: { sessionDates: Set<string> }) {
  const WEEKS = 16;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Start aligned to Monday, 16 weeks back
  const start = new Date(today);
  start.setDate(start.getDate() - WEEKS * 7 + 1);
  const dow = start.getDay();
  start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));

  // 7 rows (Mon–Sun) × WEEKS columns
  return (
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
            return (
              <div
                key={week}
                className="rounded-sm flex-1"
                style={{
                  aspectRatio: "1",
                  background: hasSession
                    ? "var(--primary)"
                    : isToday
                    ? "rgba(68, 147, 224, 0.18)"
                    : "var(--surface)",
                  opacity: isFuture ? 0.12 : 1,
                  border: isToday ? "1px solid rgba(68, 147, 224, 0.35)" : "none",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}

function weekNumber(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

function computeStreak(sessions: { session_date: string }[]): number {
  const sessionDates = new Set(sessions.map((s) => s.session_date));
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  let streak = 0;
  const cursor = new Date(today);

  if (!sessionDates.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (sessionDates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
