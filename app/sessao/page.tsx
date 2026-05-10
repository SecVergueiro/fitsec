"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { fmtRelativeDate, WEEKDAY_LABELS } from "@/lib/utils";
import type { Mesocycle, TemplateDay, WorkoutSession } from "@/lib/database.types";

const SESSION_MAX_MINUTES = 240;

export default function SessaoIndex() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [todayDay, setTodayDay] = useState<TemplateDay | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [recentSessions, setRecentSessions] = useState<(WorkoutSession & { day_name?: string })[]>([]);
  const [activeMesoId, setActiveMesoId] = useState<string | null>(null);
  const [activeMeso, setActiveMeso] = useState<Mesocycle | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);

    // 1. Sessão em andamento
    const { data: active } = await supabase
      .from("workout_sessions")
      .select("*")
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active) {
      const elapsedMin = (Date.now() - new Date((active as WorkoutSession).started_at).getTime()) / 60000;
      if (elapsedMin > SESSION_MAX_MINUTES) {
        // Auto-finaliza sessão que ficou aberta >4h
        const autoEnd = new Date(new Date((active as WorkoutSession).started_at).getTime() + SESSION_MAX_MINUTES * 60000);
        await supabase
          .from("workout_sessions")
          .update({
            completed_at: autoEnd.toISOString(),
            ended_at: autoEnd.toISOString(),
            duration_minutes: SESSION_MAX_MINUTES,
          } as any)
          .eq("id", (active as WorkoutSession).id);
      } else {
        setActiveSession(active as WorkoutSession);
      }
    }

    // 2. Mesociclo ativo
    const { data: meso } = await supabase
      .from("mesocycles")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    let templateId: string | null = null;
    if (meso) {
      const m = meso as Mesocycle;
      templateId = (m as any).template_id;
      setActiveMesoId((m as any).id);
      setActiveMeso(m);
    } else {
      const { data: tpl } = await supabase
        .from("templates")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      templateId = (tpl as any)?.id ?? null;
    }

    // 3. Dia de hoje
    if (templateId) {
      const todayWeekday = new Date().getDay();
      const { data: dayData } = await supabase
        .from("template_days")
        .select("*")
        .eq("template_id", templateId)
        .eq("weekday", todayWeekday)
        .maybeSingle();
      setTodayDay(dayData as TemplateDay);

      if (dayData) {
        const { count } = await supabase
          .from("template_exercises")
          .select("*", { count: "exact", head: true })
          .eq("template_day_id", (dayData as TemplateDay).id);
        setExerciseCount(count ?? 0);
      }
    }

    // 4. Sessões recentes
    const { data: recent } = await supabase
      .from("workout_sessions")
      .select("*, template_days(name)")
      .not("completed_at", "is", null)
      .order("session_date", { ascending: false })
      .limit(10);

    const enriched = (recent as any[])?.map((r) => ({ ...r, day_name: r.template_days?.name })) ?? [];
    setRecentSessions(enriched);

    setLoading(false);
  }

  async function startSession(templateDayId: string | null) {
    setStarting(true);

    const { data: session, error } = await supabase
      .from("workout_sessions")
      .insert({
        template_day_id: templateDayId,
        mesocycle_id: activeMesoId,
        session_date: new Date().toLocaleDateString("en-CA"),
        started_at: new Date().toISOString(),
      } as any)
      .select()
      .single();

    if (error || !session) {
      toast.error("Erro ao iniciar sessão" + (error?.message ? `: ${error.message}` : ""));
      setStarting(false);
      return;
    }

    const sessionId = (session as any).id;

    if (templateDayId) {
      const { data: prescribed } = await supabase
        .from("template_exercises")
        .select("*")
        .eq("template_day_id", templateDayId)
        .order("exercise_order");

      if (prescribed && prescribed.length > 0) {
        const sessionExercises = (prescribed as any[]).map((p) => ({
          session_id: sessionId,
          exercise_id: p.exercise_id,
          template_exercise_id: p.id,
          exercise_order: p.exercise_order,
          prescribed_sets: p.prescribed_sets,
          rep_range_min: p.rep_range_min,
          rep_range_max: p.rep_range_max,
          target_rir: p.target_rir,
          rest_seconds: p.rest_seconds,
        }));
        await supabase.from("session_exercises").insert(sessionExercises as any);
      }
    }

    router.push(`/sessao/${sessionId}`);
  }

  // Deload hint: current meso week >= deload_week
  const mesoCurrentWeek = activeMeso
    ? Math.floor((Date.now() - new Date(activeMeso.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    : 0;
  const showDeloadHint =
    activeMeso &&
    activeMeso.deload_week != null &&
    mesoCurrentWeek >= activeMeso.deload_week &&
    mesoCurrentWeek <= (activeMeso.total_weeks + 1);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Sessão" title="Treino" />

      {/* Deload hint */}
      {showDeloadHint && (
        <div
          className="mb-4 px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2"
          style={{
            background: "rgba(251, 191, 36, 0.08)",
            border: "0.5px solid rgba(251, 191, 36, 0.3)",
            color: "#fbbf24",
          }}
        >
          <span>★</span>
          <span>
            Semana {mesoCurrentWeek} de {activeMeso!.total_weeks} — deload recomendado. Reduza volume e intensidade.
          </span>
        </div>
      )}

      {/* Sessão em andamento */}
      {activeSession ? (
        <Card variant="strong" className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
            />
            <Eyebrow style={{ color: "var(--text)" } as any}>Em andamento</Eyebrow>
          </div>
          <div className="font-bold text-base mb-1">Treino ativo</div>
          <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            Iniciado {fmtRelativeDate(activeSession.started_at)}
            {(() => {
              const min = Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000);
              return min > 0 ? ` · ${min} min` : "";
            })()}
          </div>
          <Link href={`/sessao/${activeSession.id}`}>
            <div
              className="py-3 rounded-lg text-center text-sm font-bold cursor-pointer"
              style={{ background: "var(--primary)", color: "var(--background)" }}
            >
              Continuar →
            </div>
          </Link>
        </Card>
      ) : todayDay ? (
        <Card variant="strong" className="mb-5">
          <div className="flex justify-between items-center mb-1">
            <Eyebrow style={{ color: "var(--text)" } as any}>Treino de hoje</Eyebrow>
            <Pill variant="primary">{todayDay.name}</Pill>
          </div>
          <div className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            {todayDay.weekday !== null ? WEEKDAY_LABELS[todayDay.weekday] : ""}
            {exerciseCount > 0 ? ` · ${exerciseCount} exercícios` : ""}
            {activeMeso ? ` · Semana ${mesoCurrentWeek}/${activeMeso.total_weeks}` : ""}
          </div>
          <Button onClick={() => startSession(todayDay.id)} disabled={starting} fullWidth>
            {starting ? "Iniciando..." : "Iniciar treino →"}
          </Button>
          <button
            onClick={() => startSession(null)}
            disabled={starting}
            className="w-full text-center text-xs mt-3 py-1"
            style={{ color: "var(--muted)", minHeight: "auto" }}
          >
            Iniciar treino livre
          </button>
        </Card>
      ) : (
        <Card variant="strong" className="mb-5">
          <Eyebrow style={{ color: "var(--text)" } as any} className="mb-1">
            Hoje
          </Eyebrow>
          <div className="font-bold text-base mb-1">Dia de descanso</div>
          <div className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            Nenhum treino programado pra hoje
          </div>
          <Button onClick={() => startSession(null)} disabled={starting} fullWidth>
            {starting ? "Iniciando..." : "Treino livre →"}
          </Button>
        </Card>
      )}

      <Eyebrow className="mb-2">Sessões recentes</Eyebrow>
      {recentSessions.length === 0 ? (
        <Card variant="ghost" className="text-center py-5">
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Nenhuma sessão registrada ainda
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {recentSessions.map((s) => (
            <Link
              key={s.id}
              href={s.completed_at ? `/sessao/${s.id}/resumo` : `/sessao/${s.id}`}
            >
              <Card className="!p-3 mb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm">{s.day_name ?? "Treino livre"}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {new Date(s.session_date + "T12:00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--accent)" }}>→</div>
                </div>
              </Card>
            </Link>
          ))}
          {recentSessions.length > 0 && (
            <Link
              href="/historico"
              className="block text-center text-xs font-bold mt-1 py-2"
              style={{ color: "var(--accent)", minHeight: "auto" }}
            >
              Ver histórico completo →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
