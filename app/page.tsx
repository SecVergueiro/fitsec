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
  const [monthPRs, setMonthPRs] = useState<number>(0);

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
    const todayWeekday = new Date().getDay() === 0 ? 7 : new Date().getDay();
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

    // 6. PRs do mes (placeholder simples — conta sessoes do mes)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const { count: monthSessionsCount } = await supabase
      .from("workout_sessions")
      .select("*", { count: "exact", head: true })
      .gte("session_date", startOfMonth.toISOString().slice(0, 10));

    setMonthPRs(monthSessionsCount ?? 0);

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
      <h1 className="text-2xl mt-1 mb-5" style={{ letterSpacing: "-0.025em" }}>
        Boa, Sec.
      </h1>

      {/* Treino de hoje */}
      {loading ? (
        <Card className="mb-4 h-32 animate-pulse">{" "}</Card>
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
            Sessões no mês
          </div>
          <div className="text-2xl font-bold tabular mt-0.5">{monthPRs}</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            consistência
          </div>
        </Card>
      </div>

      {/* Calendario semanal */}
      <Eyebrow className="mt-5 mb-2">Esta semana</Eyebrow>
      <Card className="!p-3">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((label, idx) => {
            const isToday = idx === todayDayOfWeek;
            const isPast = idx < todayDayOfWeek;
            const sessionDate = new Date();
            sessionDate.setDate(sessionDate.getDate() - (todayDayOfWeek - idx));
            const dateStr = sessionDate.toISOString().slice(0, 10);
            const hasSession = weekSessions.some((s) => s.session_date === dateStr);

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
