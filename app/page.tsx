"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { fmtRelativeDate, getStreakMilestone, WEEKDAY_LABELS } from "@/lib/utils";
import type { Mesocycle, Template, TemplateDay, WorkoutSession } from "@/lib/database.types";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [activeMeso, setActiveMeso] = useState<Mesocycle | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [todayDay, setTodayDay] = useState<TemplateDay | null>(null);
  const [nextDay, setNextDay] = useState<{ day: TemplateDay; daysAhead: number; exerciseCount: number } | null>(null);
  const [todayExerciseCount, setTodayExerciseCount] = useState(0);
  const [weekSessions, setWeekSessions] = useState<WorkoutSession[]>([]);
  const [weeklyVolume, setWeeklyVolume] = useState<number | null>(null);
  const [prevWeekVolume, setPrevWeekVolume] = useState<number | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [heatmapSessions, setHeatmapSessions] = useState<Set<string>>(new Set());
  const [activeSession, setActiveSession] = useState<{ id: string; started_at: string } | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(4);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("4");

  useEffect(() => {
    loadDashboard();
    const saved = localStorage.getItem("user_name") ?? "";
    setUserName(saved);
    setNameInput(saved);
    const savedGoal = localStorage.getItem("weekly_goal");
    if (savedGoal) {
      const n = parseInt(savedGoal);
      setWeeklyGoal(n);
      setGoalInput(String(n));
    }
  }, []);

  function saveGoal() {
    const n = Math.max(1, Math.min(14, parseInt(goalInput) || 4));
    setWeeklyGoal(n);
    setGoalInput(String(n));
    localStorage.setItem("weekly_goal", String(n));
    setEditingGoal(false);
  }

  function saveName() {
    const n = nameInput.trim();
    setUserName(n);
    localStorage.setItem("user_name", n);
    setEditingName(false);
  }

  async function loadDashboard() {
    setLoading(true);

    // 0. Sessão em andamento
    const { data: activeSess } = await supabase
      .from("workout_sessions")
      .select("id, started_at")
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveSession(activeSess as { id: string; started_at: string } | null);

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

    // 3. Dia de hoje (baseado em weekday) + próximo treino
    const todayWeekday = new Date().getDay();
    if (templateId) {
      const { data: allDays } = await supabase
        .from("template_days")
        .select("*")
        .eq("template_id", templateId)
        .not("weekday", "is", null);

      const days = (allDays as TemplateDay[]) ?? [];
      const today = days.find((d) => d.weekday === todayWeekday) ?? null;
      setTodayDay(today);

      if (today) {
        const { count } = await supabase
          .from("template_exercises")
          .select("*", { count: "exact", head: true })
          .eq("template_day_id", today.id);
        setTodayExerciseCount(count ?? 0);
      } else {
        // Procura próximo dia (até 7 dias à frente)
        for (let i = 1; i <= 7; i++) {
          const checkWeekday = (todayWeekday + i) % 7;
          const found = days.find((d) => d.weekday === checkWeekday);
          if (found) {
            const { count } = await supabase
              .from("template_exercises")
              .select("*", { count: "exact", head: true })
              .eq("template_day_id", found.id);
            setNextDay({ day: found, daysAhead: i, exerciseCount: count ?? 0 });
            break;
          }
        }
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

    // 5b. Volume da semana anterior — pra mostrar tendência ↑↓
    const startPrevWeek = new Date(startOfWeek);
    startPrevWeek.setDate(startPrevWeek.getDate() - 7);
    const endPrevWeek = new Date(startOfWeek);
    endPrevWeek.setDate(endPrevWeek.getDate() - 1);
    const { data: prevSessions } = await supabase
      .from("workout_sessions")
      .select("id")
      .gte("session_date", startPrevWeek.toISOString().slice(0, 10))
      .lte("session_date", endPrevWeek.toISOString().slice(0, 10));

    if (prevSessions && prevSessions.length > 0) {
      const prevIds = prevSessions.map((s) => s.id);
      const { data: prevSets } = await supabase
        .from("session_sets")
        .select("weight_kg, reps, is_warmup")
        .in("session_id", prevIds);
      const prevTotal =
        prevSets?.filter((s) => !s.is_warmup).reduce((sum, s) => sum + s.weight_kg * s.reps, 0) ?? 0;
      setPrevWeekVolume(prevTotal);
    } else {
      setPrevWeekVolume(0);
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
      <div className="flex items-baseline gap-2 mt-1 mb-5">
        <h1
          className="text-4xl"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.01em" }}
        >
          {getGreeting()}{userName ? `, ${userName}.` : "."}
        </h1>
        {!editingName && (
          <button
            onClick={() => { setNameInput(userName); setEditingName(true); }}
            style={{ color: "var(--faint)", fontSize: 13, minHeight: "auto", paddingBottom: 2 }}
          >
            ✎
          </button>
        )}
      </div>
      {editingName && (
        <div className="flex gap-2 mb-4 -mt-3">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
            placeholder="Seu nome..."
            className="flex-1 rounded-lg px-3 py-2 text-sm font-bold"
            style={{ background: "var(--surface)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none" }}
          />
          <button onClick={saveName} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}>
            OK
          </button>
        </div>
      )}

      {/* Sessão em andamento — aparece se há treino ativo */}
      {!loading && activeSession && (
        <Link href={`/sessao/${activeSession.id}`}>
          <div
            className="rounded-xl p-4 mb-4 flex items-center justify-between"
            style={{ border: "0.5px solid var(--accent)", background: "rgba(68, 147, 224, 0.07)" }}
          >
            <div>
              <div
                className="text-xs font-bold mb-0.5"
                style={{ color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}
              >
                Em andamento
              </div>
              <div className="font-bold text-sm">Treino ativo</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {(() => {
                  const min = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000);
                  return min < 1 ? "Acabou de começar" : `Há ${min} min`;
                })()}
              </div>
            </div>
            <div className="text-base font-bold" style={{ color: "var(--accent)" }}>→</div>
          </div>
        </Link>
      )}

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
        <Card variant="ghost" className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)" }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            <span className="font-bold" style={{ color: "var(--primary)" }}>Dia de descanso</span>
          </div>
          {nextDay ? (
            <Link href="/treinos">
              <div className="text-sm mb-1" style={{ color: "var(--muted)" }}>
                Próximo treino: <span style={{ color: "var(--text)", fontWeight: 600 }}>{nextDay.day.name}</span>
              </div>
              <div className="text-xs" style={{ color: "var(--faint)" }}>
                {nextDay.daysAhead === 1 ? "Amanhã" : `Em ${nextDay.daysAhead} dias`}
                {" · "}
                {WEEKDAY_LABELS[nextDay.day.weekday!]}
                {nextDay.exerciseCount > 0 ? ` · ${nextDay.exerciseCount} exercícios` : ""}
              </div>
            </Link>
          ) : (
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              Sem treino programado pra hoje
            </div>
          )}
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
            {/* Trend arrow vs semana anterior */}
            {(() => {
              if (weeklyVolume === null || prevWeekVolume === null) {
                return (
                  <div className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                    {weekSessions.length} sessões
                  </div>
                );
              }
              if (prevWeekVolume === 0) {
                return (
                  <div className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                    {weekSessions.length} sessões
                  </div>
                );
              }
              const delta = ((weeklyVolume - prevWeekVolume) / prevWeekVolume) * 100;
              const isUp = delta >= 0;
              const color = Math.abs(delta) < 5 ? "var(--muted)" : isUp ? "var(--accent)" : "#ff8888";
              return (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-bold tabular" style={{ color }}>
                    {isUp ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
                  </span>
                  <span className="text-xs" style={{ color: "var(--faint)" }}>
                    vs sem ant
                  </span>
                </div>
              );
            })()}
          </Card>
          {(() => {
            const milestone = getStreakMilestone(streak);
            const justHitMilestone = milestone && [3, 7, 14, 30, 100, 365].includes(streak);
            return (
              <Card className="!p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Sequência</span>
                  {milestone && milestone.label && streak >= 3 && (
                    <span
                      className="text-xs font-bold tabular flex-shrink-0"
                      style={{
                        color: "#fbbf24",
                        padding: "1px 6px",
                        background: "rgba(251,191,36,0.1)",
                        borderRadius: 4,
                        fontSize: 9,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {milestone.label}
                    </span>
                  )}
                </div>
                <div
                  className={`flex items-baseline gap-1 mt-0.5 ${justHitMilestone ? "celebrate-pulse" : ""}`}
                  style={{ display: "inline-flex", borderRadius: 6 }}
                >
                  <div className="text-2xl font-bold tabular">{streak}</div>
                  <div className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                    {streak === 1 ? "dia" : "dias"}
                  </div>
                </div>
                <div className="text-xs mt-0.5" style={{ color: streak > 0 ? "var(--accent)" : "var(--faint)" }}>
                  {streak === 0
                    ? "sem sequência"
                    : milestone && milestone.next < 999 && streak < milestone.next
                    ? `+${milestone.next - streak} pra ${milestone.next} dias`
                    : streak === 1
                    ? "dia seguido"
                    : "dias seguidos"}
                </div>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Meta semanal */}
      {!loading && (
        <div
          className="rounded-xl px-4 py-3 mb-4 mt-1"
          style={{ background: "var(--surface)", border: "0.5px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Meta semanal
              </span>
              <span className="text-sm font-bold" style={{ color: weekSessions.filter((s) => s.completed_at).length >= weeklyGoal ? "var(--accent)" : "var(--primary)" }}>
                {weekSessions.filter((s) => s.completed_at).length} / {weeklyGoal}
              </span>
            </div>
            {editingGoal ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setEditingGoal(false); }}
                  autoFocus
                  min={1} max={14}
                  className="w-10 text-center text-xs font-bold rounded px-1 py-1"
                  style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none" }}
                />
                <button onClick={saveGoal} className="text-xs font-bold px-2 py-1 rounded" style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}>OK</button>
              </div>
            ) : (
              <button onClick={() => { setGoalInput(String(weeklyGoal)); setEditingGoal(true); }} style={{ color: "var(--faint)", fontSize: 12, minHeight: "auto" }}>✎</button>
            )}
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-strong)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (weekSessions.filter((s) => s.completed_at).length / weeklyGoal) * 100)}%`,
                background: weekSessions.filter((s) => s.completed_at).length >= weeklyGoal ? "var(--accent)" : "var(--primary)",
              }}
            />
          </div>
          {weekSessions.filter((s) => s.completed_at).length >= weeklyGoal && (
            <div className="text-xs mt-1.5 font-medium flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
              Meta atingida!
            </div>
          )}
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
        <Link href="/historico">
          <Card className="!p-3 text-center">
            <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
              Histórico →
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              todos os treinos
            </div>
          </Card>
        </Link>
        <Link href="/stats">
          <Card className="!p-3 text-center">
            <div className="text-sm font-bold" style={{ color: "var(--primary)" }}>
              Stats →
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              progressão e PRs
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
