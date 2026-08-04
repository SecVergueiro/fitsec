"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useProfile } from "@/components/ProfileProvider";
import { offlineInsert, offlineUpdate } from "@/lib/offline-writes";
import { offlineRead, offlineReadList } from "@/lib/offline-reads";
import { db as offlineDB } from "@/lib/offline-db";
import { saveActiveSession } from "@/lib/session-timer";
import { fmtRelativeDate, WEEKDAY_LABELS } from "@/lib/utils";
import type { Mesocycle, TemplateDay, WorkoutSession } from "@/lib/database.types";

const SESSION_MAX_MINUTES = 240;

export default function SessaoIndex() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [todayDay, setTodayDay] = useState<TemplateDay | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [recentSessions, setRecentSessions] = useState<(WorkoutSession & { day_name?: string })[]>([]);
  const [activeMesoId, setActiveMesoId] = useState<string | null>(null);
  const [activeMeso, setActiveMeso] = useState<Mesocycle | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [pendingDayId, setPendingDayId] = useState<string | null>(null);

  useEffect(() => {
    // Cache primeiro (instantâneo), rede depois em background. Mesmo motivo da
    // sessão ativa: essas leituras eram sequenciais e rede-primeiro, então em
    // sinal ruim a tela ficava em spinner somando o timeout de cada uma.
    let alive = true;
    (async () => {
      const painted = await init({ localOnly: true });
      if (!alive) return;
      if (painted) setLoading(false);
      if (typeof navigator === "undefined" || navigator.onLine) await init();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  /** `localOnly` não toca na rede — é a passada que pinta a tela. */
  async function init({ localOnly = false }: { localOnly?: boolean } = {}): Promise<boolean> {
    const readOpts = { localOnly };

    // 1. Sessão em andamento
    const active = await offlineRead<WorkoutSession>(
      () => supabase.from("workout_sessions").select("*").is("completed_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      async () => {
        if (!offlineDB) return null;
        const list = await offlineDB.workout_sessions.filter((s) => s.completed_at == null).toArray();
        list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        return list[0] ?? null;
      },
      readOpts
    );

    if (active) {
      const elapsedMin = (Date.now() - new Date(active.started_at).getTime()) / 60000;
      if (elapsedMin > SESSION_MAX_MINUTES) {
        // A passada de cache não escreve — senão o encerramento automático
        // entraria duas vezes na fila por abertura de tela.
        if (!localOnly) {
          const autoEnd = new Date(new Date(active.started_at).getTime() + SESSION_MAX_MINUTES * 60000);
          await offlineUpdate(
            "workout_sessions",
            { completed_at: autoEnd.toISOString(), ended_at: autoEnd.toISOString(), duration_minutes: SESSION_MAX_MINUTES },
            { id: active.id },
            { localTable: "workout_sessions", localId: active.id }
          );
        }
      } else {
        setActiveSession(active);
      }
    }

    // 2. Mesociclo ativo
    const meso = await offlineRead<Mesocycle>(
      () => supabase.from("mesocycles").select("*").eq("is_active", true).limit(1).maybeSingle(),
      async () => {
        if (!offlineDB) return null;
        const list = await offlineDB.mesocycles.filter((m) => (m as any).is_active === true).toArray();
        return (list[0] as Mesocycle) ?? null;
      },
      readOpts
    );

    let templateId: string | null = null;
    if (meso) {
      templateId = (meso as any).template_id;
      setActiveMesoId(meso.id);
      setActiveMeso(meso);
    } else {
      const tpl = await offlineRead<{ id: string }>(
        () => supabase.from("templates").select("id").eq("is_active", true).limit(1).maybeSingle(),
        async () => {
          if (!offlineDB) return null;
          const list = await offlineDB.templates.filter((t) => (t as any).is_active === true).toArray();
          return list[0] ? { id: list[0].id } : null;
        },
        readOpts
      );
      templateId = tpl?.id ?? null;
    }

    // 3. Dia de hoje
    if (templateId) {
      const todayWeekday = new Date().getDay();
      const dayData = await offlineRead<TemplateDay>(
        () => supabase.from("template_days").select("*").eq("template_id", templateId!).eq("weekday", todayWeekday).maybeSingle(),
        async () => {
          if (!offlineDB) return null;
          const list = await offlineDB.template_days.where("template_id").equals(templateId!).filter((d) => d.weekday === todayWeekday).toArray();
          return list[0] ?? null;
        },
        readOpts
      );
      setTodayDay(dayData);

      if (dayData) {
        const prescribed = await offlineReadList<{ id: string }>(
          () => supabase.from("template_exercises").select("id").eq("template_day_id", dayData.id),
          async () =>
            offlineDB
              ? offlineDB.template_exercises.where("template_day_id").equals(dayData.id).toArray()
              : null,
          readOpts
        );
        setExerciseCount(prescribed.length);

        // Estima duração baseada nas últimas 5 sessões desse dia
        const pastSessions = await offlineReadList<{ duration_minutes: number }>(
          () =>
            supabase
              .from("workout_sessions")
              .select("duration_minutes")
              .eq("template_day_id", dayData.id)
              .not("duration_minutes", "is", null)
              .order("session_date", { ascending: false })
              .limit(5),
          async () => {
            if (!offlineDB) return null;
            const list = await offlineDB.workout_sessions
              .filter((s) => s.template_day_id === dayData.id && s.duration_minutes != null)
              .toArray();
            list.sort((a, b) => b.session_date.localeCompare(a.session_date));
            return list.slice(0, 5) as any[];
          },
          readOpts
        );
        if (pastSessions.length > 0) {
          const avg = pastSessions.reduce((s, p) => s + p.duration_minutes, 0) / pastSessions.length;
          setEstimatedDuration(Math.round(avg));
        }
      }
    }

    // 4. Sessões recentes
    const recent = await offlineRead<any[]>(
      () => supabase.from("workout_sessions").select("*, template_days(name)").not("completed_at", "is", null).order("session_date", { ascending: false }).limit(10),
      async () => {
        if (!offlineDB) return [];
        const all = await offlineDB.workout_sessions.filter((s) => s.completed_at != null).toArray();
        all.sort((a, b) => b.session_date.localeCompare(a.session_date));
        const top = all.slice(0, 10);
        // Hidrata day_name via cache
        return Promise.all(top.map(async (s) => {
          if (!s.template_day_id) return { ...s, day_name: null };
          const d = await offlineDB.template_days.get(s.template_day_id);
          return { ...s, day_name: d?.name ?? null };
        }));
      },
      readOpts
    );

    const enriched = (recent as any[])?.map((r) => ({ ...r, day_name: r.day_name ?? r.template_days?.name })) ?? [];
    setRecentSessions(enriched);

    // Só considera a tela "pintada" se havia o que pintar — senão o "Dia de
    // descanso" apareceria por um segundo antes de a rede dizer o contrário.
    return active != null || templateId != null;
  }

  function startSession(templateDayId: string | null) {
    setPendingDayId(templateDayId);
    setShowCheckin(true);
  }

  async function confirmCheckin(energy: number | null) {
    setStarting(true);
    setShowCheckin(false);
    const templateDayId = pendingDayId;

    // user_id vem da sessão persistida: auth.getUser() bate na rede e devolve null offline
    const userId = getCurrentUserId();
    const bodyweight = profile?.current_bodyweight_kg ?? null;

    // Insert offline-first — funciona mesmo sem internet
    const session = await offlineInsert(
      "workout_sessions",
      {
        template_day_id: templateDayId,
        mesocycle_id: activeMesoId,
        session_date: new Date().toLocaleDateString("en-CA"),
        started_at: new Date().toISOString(),
        bodyweight_kg: bodyweight,
        energy_level: energy,
        user_id: userId,
      },
      { localTable: "workout_sessions" }
    );

    const sessionId = session.id;

    // Marca o treino em andamento: se o iOS matar o PWA, reabrir cai direto aqui.
    saveActiveSession(sessionId, Date.now());

    if (templateDayId) {
      // Prescrição do dia — do servidor, com o Dexie como fallback offline
      const prescribed = await offlineReadList<any>(
        () =>
          supabase
            .from("template_exercises")
            .select("*")
            .eq("template_day_id", templateDayId)
            .order("exercise_order"),
        async () =>
          offlineDB
            ? offlineDB.template_exercises.where("template_day_id").equals(templateDayId).sortBy("exercise_order")
            : null
      );

      if (prescribed && prescribed.length > 0) {
        await Promise.all(
          prescribed.map((p) =>
            offlineInsert(
              "session_exercises",
              {
                session_id: sessionId,
                exercise_id: p.exercise_id,
                template_exercise_id: p.id,
                exercise_order: p.exercise_order,
                prescribed_sets: p.prescribed_sets,
                rep_range_min: p.rep_range_min,
                rep_range_max: p.rep_range_max,
                target_rir: p.target_rir,
                rest_seconds: p.rest_seconds,
                is_completed: false,
              },
              { localTable: "session_exercises" }
            )
          )
        );
      }
    }

    router.push(`/sessao/ativa?id=${sessionId}`);
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
          <Link href={`/sessao/ativa?id=${activeSession.id}`}>
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
            {estimatedDuration ? ` · ~${estimatedDuration} min` : ""}
            {activeMeso ? ` · Semana ${mesoCurrentWeek}/${activeMeso.total_weeks}` : ""}
          </div>
          <Button onClick={() => startSession(todayDay.id)} disabled={starting} fullWidth>
            {starting ? "Iniciando..." : "Iniciar treino →"}
          </Button>
          <div className="flex items-center justify-center gap-3 mt-3">
            <button
              onClick={() => startSession(null)}
              disabled={starting}
              className="text-xs py-1"
              style={{ color: "var(--muted)", minHeight: "auto" }}
            >
              Treino livre
            </button>
            <span style={{ color: "var(--border-strong)" }}>·</span>
            <Link href="/sessao/rapido" className="text-xs py-1" style={{ color: "var(--muted)", minHeight: "auto" }}>
              Modo rápido
            </Link>
          </div>
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
          <Link
            href="/sessao/rapido"
            className="block text-center text-xs mt-3 py-1"
            style={{ color: "var(--muted)", minHeight: "auto" }}
          >
            Modo rápido
          </Link>
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
              href={s.completed_at ? `/sessao/resumo?id=${s.id}` : `/sessao/ativa?id=${s.id}`}
            >
              <Card className="!p-3 mb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm">{(s as any).custom_name || s.day_name || "Treino livre"}</div>
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
      {showCheckin && (
        <CheckinModal
          onConfirm={confirmCheckin}
          onSkip={() => confirmCheckin(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// CheckinModal — peso corporal + energia antes do treino
// ============================================================
const ENERGY_LABELS = ["", "Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];
const ENERGY_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "var(--accent)"];

function CheckinModal({
  onConfirm,
  onSkip,
}: {
  onConfirm: (energy: number | null) => void;
  onSkip: () => void;
}) {
  const [energy, setEnergy] = useState<number | null>(null);

  function handleConfirm() {
    onConfirm(energy);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(4,6,7,0.82)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onSkip(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 scale-in"
        style={{
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">Como você está?</h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Registre sua energia antes de treinar
          </p>
        </div>

        {/* Nível de energia */}
        <div className="mb-6">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Energia
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setEnergy(energy === n ? null : n)}
                style={{
                  flex: 1, height: 52, minHeight: 52, borderRadius: 10,
                  fontWeight: 700, fontSize: 13,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  background: energy === n ? ENERGY_COLORS[n] + "22" : "var(--surface)",
                  border: `1.5px solid ${energy === n ? ENERGY_COLORS[n] : "var(--border)"}`,
                  color: energy === n ? ENERGY_COLORS[n] : "var(--faint)",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 800 }}>{n}</span>
                <span style={{ fontSize: 9, letterSpacing: "0.04em" }}>{ENERGY_LABELS[n].toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleConfirm}
          style={{
            width: "100%", height: 50,
            background: "var(--primary)", color: "var(--background)",
            borderRadius: 12, fontWeight: 700, fontSize: 15,
            border: "none", cursor: "pointer", marginBottom: 10,
          }}
        >
          Iniciar treino →
        </button>
        <button
          onClick={onSkip}
          style={{
            width: "100%", height: 40, background: "transparent",
            color: "var(--muted)", borderRadius: 10, fontWeight: 600,
            fontSize: 13, border: "none", cursor: "pointer", minHeight: "auto",
          }}
        >
          Pular check-in
        </button>
      </div>
    </div>
  );
}
