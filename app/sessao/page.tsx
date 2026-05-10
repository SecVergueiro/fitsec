"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { fmtRelativeDate, WEEKDAY_LABELS } from "@/lib/utils";
import type { TemplateDay, WorkoutSession } from "@/lib/database.types";

export default function SessaoIndex() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [todayDay, setTodayDay] = useState<TemplateDay | null>(null);
  const [recentSessions, setRecentSessions] = useState<(WorkoutSession & { day_name?: string })[]>([]);
  const [activeMesoId, setActiveMesoId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    setLoading(true);

    // 1. Sessão em andamento (não tem completed_at)
    const { data: active } = await supabase
      .from("workout_sessions")
      .select("*")
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active) {
      setActiveSession(active as WorkoutSession);
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
      templateId = (meso as any).template_id;
      setActiveMesoId((meso as any).id);
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
    }

    // 4. Sessões recentes (últimos 30 dias)
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

    // Se veio de um template_day, copia os exercicios prescritos
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

      {activeSession ? (
        <Card variant="strong" className="mb-5">
          <Eyebrow className="mb-1" style={{ color: "var(--text)" } as any}>
            Em andamento
          </Eyebrow>
          <div className="font-bold text-base mb-3">
            Sessão iniciada {fmtRelativeDate(activeSession.started_at)}
          </div>
          <Link href={`/sessao/${activeSession.id}`}>
            <div
              className="py-3 rounded-lg text-center text-sm font-bold cursor-pointer"
              style={{
                background: "var(--primary)",
                color: "var(--background)",
              }}
            >
              Continuar →
            </div>
          </Link>
        </Card>
      ) : todayDay ? (
        <Card variant="strong" className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <Eyebrow style={{ color: "var(--text)" } as any}>Treino de hoje</Eyebrow>
            <Pill variant="primary">{todayDay.name}</Pill>
          </div>
          <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            {todayDay.weekday !== null ? WEEKDAY_LABELS[todayDay.weekday] : ""}
          </div>
          <Button onClick={() => startSession(todayDay.id)} disabled={starting} fullWidth>
            {starting ? "Iniciando..." : "Iniciar sessão →"}
          </Button>
        </Card>
      ) : (
        <Card variant="ghost" className="mb-5 text-center">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>
            Sem treino programado
          </div>
          <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Você pode iniciar um treino livre
          </div>
          <Button onClick={() => startSession(null)} disabled={starting} variant="secondary">
            {starting ? "Iniciando..." : "Treino livre"}
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
                      {new Date(s.session_date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                      {s.duration_minutes && ` · ${s.duration_minutes} min`}
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
