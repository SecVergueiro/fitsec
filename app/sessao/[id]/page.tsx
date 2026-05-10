"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { Button, EmptyState, Spinner } from "@/components/Button";
import { useToast, useConfirm } from "@/components/Toast";
import { fmtTimer, estimate1RM, fmtKg } from "@/lib/utils";
import type { Exercise, SessionExercise, SessionSet, WorkoutSession } from "@/lib/database.types";
import { AddExerciseToSessionModal } from "./AddExerciseModal";

interface ExerciseWithSets extends SessionExercise {
  exercise: Exercise;
  sets: SessionSet[];
  prevBest?: { weight: number; reps: number; e1rm: number };
  prevSession?: { sets: { weight_kg: number; reps: number; rir: number | null }[]; maxWeight: number };
}

export default function SessaoAtivaPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState<number>(0);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showSessionInfo, setShowSessionInfo] = useState(false);
  const [mesoWeek, setMesoWeek] = useState<number | null>(null);
  const [mesoTotalWeeks, setMesoTotalWeeks] = useState<number | null>(null);
  const restRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    load();
    return () => {
      if (restRef.current) clearInterval(restRef.current);
    };
  }, [sessionId]);

  useEffect(() => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (!session?.started_at || session.completed_at) return;
    const start = new Date(session.started_at).getTime();
    setElapsed(Math.floor((Date.now() - start) / 1000));
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [session?.started_at, session?.completed_at]);

  async function load() {
    setLoading(true);

    const [{ data: sessionData }, { data: mesoData }] = await Promise.all([
      supabase.from("workout_sessions").select("*").eq("id", sessionId).single(),
      supabase.from("mesocycles").select("start_date, total_weeks").eq("is_active", true).limit(1).maybeSingle(),
    ]);
    setSession(sessionData as WorkoutSession);

    if (mesoData) {
      const start = new Date((mesoData as any).start_date);
      const diffDays = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
      setMesoWeek(Math.floor(diffDays / 7) + 1);
      setMesoTotalWeeks((mesoData as any).total_weeks);
    }

    const { data: exData } = await supabase
      .from("session_exercises")
      .select("*, exercise:exercises(*)")
      .eq("session_id", sessionId)
      .order("exercise_order");

    if (!exData) {
      setLoading(false);
      return;
    }

    const enriched = await Promise.all(
      (exData as any[]).map(async (ex) => {
        const { data: sets } = await supabase
          .from("session_sets")
          .select("*")
          .eq("session_exercise_id", ex.id)
          .order("set_number");

        const { data: prevSets } = await supabase
          .from("session_sets")
          .select("weight_kg, reps, rir, session_id")
          .eq("exercise_id", ex.exercise_id)
          .eq("is_warmup", false)
          .neq("session_id", sessionId)
          .order("performed_at", { ascending: false })
          .limit(500);

        let prevBest: any = undefined;
        let prevSession: ExerciseWithSets["prevSession"] = undefined;

        if (prevSets && prevSets.length > 0) {
          const all = prevSets as any[];

          const best = all.reduce(
            (acc, s) => {
              const e1 = estimate1RM(s.weight_kg, s.reps);
              return e1 > acc.e1rm ? { weight: s.weight_kg, reps: s.reps, e1rm: e1 } : acc;
            },
            { weight: 0, reps: 0, e1rm: 0 }
          );
          if (best.e1rm > 0) prevBest = best;

          const lastId = all[0].session_id;
          const lastSets = all.filter((s) => s.session_id === lastId).reverse();
          prevSession = {
            sets: lastSets,
            maxWeight: Math.max(...lastSets.map((s) => s.weight_kg)),
          };
        }

        return { ...ex, sets: (sets as SessionSet[]) ?? [], prevBest, prevSession };
      })
    );

    setExercises(enriched);

    const firstIncomplete = enriched.findIndex((e) => !e.is_completed);
    setActiveIdx(firstIncomplete === -1 ? 0 : firstIncomplete);

    setLoading(false);
  }

  async function moveExercise(idx: number, dir: "up" | "down") {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= exercises.length) return;
    const next = [...exercises];
    [next[idx], next[target]] = [next[target], next[idx]];
    setExercises(next);
    await Promise.all([
      supabase.from("session_exercises").update({ exercise_order: target } as any).eq("id", next[target].id),
      supabase.from("session_exercises").update({ exercise_order: idx } as any).eq("id", next[idx].id),
    ]);
  }

  async function addSet(
    exIdx: number,
    weight: number,
    reps: number,
    rir: number | null,
    isWarmup: boolean,
    isFailure: boolean = false
  ): Promise<boolean> {
    const ex = exercises[exIdx];
    const setNumber = ex.sets.filter((s) => !s.is_warmup).length + (isWarmup ? 0 : 1);

    const { data, error } = await supabase
      .from("session_sets")
      .insert({
        session_id: sessionId,
        session_exercise_id: ex.id,
        exercise_id: ex.exercise_id,
        set_number: isWarmup ? 0 : setNumber,
        weight_kg: weight,
        reps,
        rir,
        is_warmup: isWarmup,
        is_failure: isFailure,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Erro ao salvar série");
      return false;
    }

    if (!isWarmup) {
      const new1RM = estimate1RM(weight, reps);
      const historicalBest = ex.prevBest?.e1rm ?? 0;
      const sessionBest = ex.sets
        .filter((s) => !s.is_warmup)
        .reduce((best, s) => Math.max(best, estimate1RM(s.weight_kg, s.reps)), 0);
      const overallBest = Math.max(historicalBest, sessionBest);

      if (new1RM > overallBest) {
        toast.pr(`Novo PR — ${fmtKg(new1RM)} e1RM`);
        if ("vibrate" in navigator) navigator.vibrate([100, 50, 200, 50, 300]);
      } else {
        toast.success("Série salva");
      }
    } else {
      toast.success("Aquecimento salvo");
    }

    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], sets: [...next[exIdx].sets, data as SessionSet] };
      return next;
    });

    if (!isWarmup) {
      const savedRest = typeof window !== "undefined" ? localStorage.getItem(`rest_${ex.exercise_id}`) : null;
      const restSecs = savedRest ? parseInt(savedRest) : (ex.rest_seconds ?? 0);
      if (restSecs > 0) startRestTimer(restSecs);
    }

    return true;
  }

  async function editSet(exIdx: number, setId: string, weight: number, reps: number, rir: number | null) {
    const { error } = await supabase
      .from("session_sets")
      .update({ weight_kg: weight, reps, rir } as any)
      .eq("id", setId);
    if (error) { toast.error("Erro ao editar série"); return; }
    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = {
        ...next[exIdx],
        sets: next[exIdx].sets.map((s) =>
          s.id === setId ? { ...s, weight_kg: weight, reps, rir } : s
        ),
      };
      return next;
    });
    toast.success("Série atualizada");
  }

  function deleteSet(exIdx: number, setId: string) {
    const removedSet = exercises[exIdx].sets.find((s) => s.id === setId);
    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], sets: next[exIdx].sets.filter((s) => s.id !== setId) };
      return next;
    });

    let undone = false;
    toast.undo("Série removida", () => {
      undone = true;
      if (removedSet) {
        setExercises((prev) => {
          const next = [...prev];
          next[exIdx] = {
            ...next[exIdx],
            sets: [...next[exIdx].sets, removedSet].sort(
              (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
            ),
          };
          return next;
        });
      }
    });

    setTimeout(async () => {
      if (!undone) {
        await supabase.from("session_sets").delete().eq("id", setId);
      }
    }, 4500);
  }

  async function toggleCompleted(exIdx: number) {
    const ex = exercises[exIdx];
    const newVal = !ex.is_completed;
    await supabase.from("session_exercises").update({ is_completed: newVal } as any).eq("id", ex.id);
    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], is_completed: newVal };
      return next;
    });
    if (newVal && exIdx < exercises.length - 1) {
      setActiveIdx(exIdx + 1);
    }
  }

  function startRestTimer(seconds: number) {
    if (restRef.current) clearInterval(restRef.current);
    setRestRemaining(seconds);
    setRestTotal(seconds);
    restRef.current = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleFinish(energyLevel: number | null, sessionNotes: string, bodyweightKg: number | null) {
    setShowFinishModal(false);
    const now = new Date().toISOString();
    const start = new Date(session!.started_at).getTime();
    const minutes = Math.floor((Date.now() - start) / 60000);
    await supabase
      .from("workout_sessions")
      .update({
        completed_at: now,
        ended_at: now,
        duration_minutes: minutes,
        energy_level: energyLevel,
        notes: sessionNotes || null,
        bodyweight_kg: bodyweightKg,
      } as any)
      .eq("id", sessionId);
    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100, 50, 300]);
    router.push(`/sessao/${sessionId}/resumo`);
  }

  async function abandonSession() {
    const ok = await confirm({
      title: "Descartar sessão?",
      message: "Todas as séries registradas serão perdidas.",
      confirmLabel: "Descartar",
      danger: true,
    });
    if (!ok) return;

    await supabase.from("workout_sessions").delete().eq("id", sessionId);
    router.push("/sessao");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fade-in">
        <Link
          href="/sessao"
          className="text-xs font-medium block mb-4"
          style={{ color: "var(--muted)", minHeight: "auto" }}
        >
          ← Treinos
        </Link>
        <EmptyState
          title="Sessão não encontrada"
          description="Essa sessão não existe ou já foi removida."
          action={
            <Link href="/sessao">
              <Button size="sm" variant="secondary">
                Voltar para treinos
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isCompleted = !!session.completed_at;
  const activeEx = exercises[activeIdx];
  const completedCount = exercises.filter((e) => e.is_completed).length;

  return (
    <div className="fade-in">
      {/* Sticky header */}
      <div
        className="sticky -mx-5 px-5 mb-3 z-10"
        style={{
          top: 0,
          background: "rgba(4, 6, 7, 0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div className="flex justify-between items-center py-3">
          <div className="flex items-center gap-3">
            <Link href="/sessao" className="text-xs font-medium" style={{ color: "var(--muted)", minHeight: "auto" }}>
              ← Treinos
            </Link>
            {!isCompleted && (
              <button
                onClick={() => setShowSessionInfo(true)}
                style={{ color: "var(--faint)", minHeight: "auto", display: "flex", alignItems: "center" }}
                title="Dados da sessão"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div
              className="text-sm font-bold tabular"
              style={{ color: isCompleted ? "var(--muted)" : "var(--accent)" }}
            >
              {fmtTimer(elapsed)}
            </div>
            {!isCompleted && (
              <button
                onClick={() => setShowFinishModal(true)}
                className="text-xs font-bold px-3 py-1.5 rounded-md"
                style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}
              >
                Finalizar
              </button>
            )}
          </div>
        </div>

        {restRemaining !== null && (
          <div className="pb-3">
            <div
              className="rounded-lg px-3 py-2.5 flex items-center gap-3"
              style={{
                background: "rgba(68, 147, 224, 0.10)",
                border: "0.5px solid rgba(68, 147, 224, 0.22)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-bold mb-1.5"
                  style={{ color: "var(--muted)", letterSpacing: "0.1em" }}
                >
                  DESCANSO
                </div>
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: "rgba(68, 147, 224, 0.15)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{
                      background: "var(--accent)",
                      width: `${restTotal > 0 ? (restRemaining / restTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span
                className="text-2xl font-bold tabular flex-shrink-0"
                style={{ color: "var(--accent)" }}
              >
                {fmtTimer(restRemaining)}
              </span>
              <button
                onClick={() => setRestRemaining(null)}
                className="text-xs font-medium flex-shrink-0 px-2.5 py-1.5 rounded-md"
                style={{
                  background: "rgba(68, 147, 224, 0.10)",
                  color: "var(--accent)",
                  border: "0.5px solid rgba(68, 147, 224, 0.2)",
                  minHeight: "auto",
                }}
              >
                Pular
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progresso */}
      <div className="flex justify-between items-center mb-2">
        <Eyebrow>Exercícios · {completedCount}/{exercises.length}</Eyebrow>
        {isCompleted && <Pill variant="primary">FINALIZADA</Pill>}
      </div>

      {exercises.length === 0 ? (
        <Card variant="ghost" className="text-center py-8">
          <div className="text-sm mb-1 font-medium">Sessão vazia</div>
          <div className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            Adicione exercícios para começar
          </div>
          {!isCompleted && (
            <Button onClick={() => setShowAddExercise(true)} fullWidth>
              + Adicionar exercício
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2 mb-3">
          {exercises.map((ex, idx) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              isActive={idx === activeIdx}
              isCompleted={ex.is_completed}
              isReadOnly={isCompleted}
              onActivate={() => setActiveIdx(idx)}
              onAddSet={(weight, reps, rir, isWarmup, isFailure) => addSet(idx, weight, reps, rir, isWarmup, isFailure)}
              onEditSet={(setId, weight, reps, rir) => editSet(idx, setId, weight, reps, rir)}
              onDeleteSet={(setId) => deleteSet(idx, setId)}
              onToggleCompleted={() => toggleCompleted(idx)}
              onMoveUp={!isCompleted && idx > 0 ? () => moveExercise(idx, "up") : undefined}
              onMoveDown={!isCompleted && idx < exercises.length - 1 ? () => moveExercise(idx, "down") : undefined}
              mesoWeek={mesoWeek}
              mesoTotalWeeks={mesoTotalWeeks}
            />
          ))}
        </div>
      )}

      {/* Add exercise button — inline at bottom of list */}
      {!isCompleted && exercises.length > 0 && (
        <button
          onClick={() => setShowAddExercise(true)}
          className="w-full py-3 rounded-xl text-sm font-bold mb-16"
          style={{
            border: "1px dashed var(--border-strong)",
            color: "var(--primary)",
            background: "transparent",
          }}
        >
          + Adicionar exercício
        </button>
      )}

      {!isCompleted && (
        <button
          onClick={abandonSession}
          className="text-xs mt-2 mb-4 block mx-auto"
          style={{ color: "#ff8888", minHeight: "auto" }}
        >
          Descartar sessão
        </button>
      )}

      {/* Floating action button — add exercise */}
      {!isCompleted && exercises.length > 0 && (
        <button
          onClick={() => setShowAddExercise(true)}
          className="fixed z-30 flex items-center justify-center rounded-full"
          style={{
            bottom: "80px",
            right: "20px",
            width: "52px",
            height: "52px",
            background: "var(--primary)",
            color: "var(--background)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
          }}
          aria-label="Adicionar exercício"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {showSessionInfo && session && (
        <SessionInfoModal
          session={session}
          onClose={() => setShowSessionInfo(false)}
          onSaved={(updated) => {
            setSession(updated);
            setShowSessionInfo(false);
          }}
        />
      )}

      {showAddExercise && (
        <AddExerciseToSessionModal
          sessionId={sessionId}
          existingOrder={exercises.length}
          onClose={() => setShowAddExercise(false)}
          onAdded={() => {
            setShowAddExercise(false);
            load();
          }}
        />
      )}

      {showFinishModal && (
        <FinishSessionModal
          onFinish={(energy, notes, bw) => handleFinish(energy, notes, bw)}
          onCancel={() => setShowFinishModal(false)}
        />
      )}
    </div>
  );
}

// Acento por grupo muscular
const MUSCLE_ACCENT: Record<string, string> = {
  peito: "#ef4444",
  costas: "#3b82f6",
  ombro: "#f59e0b",
  ombro_anterior: "#fbbf24",
  ombro_posterior: "#f97316",
  biceps: "#8b5cf6",
  triceps: "#a78bfa",
  antebraco: "#6366f1",
  quadriceps: "#22c55e",
  posterior: "#16a34a",
  gluteo: "#f97316",
  panturrilha: "#10b981",
  core: "#06b6d4",
  lombar: "#0891b2",
};

// ============================================================
// Card de cada exercicio com input de series
// ============================================================
function ExerciseCard({
  exercise,
  isActive,
  isCompleted,
  isReadOnly,
  onActivate,
  onAddSet,
  onEditSet,
  onDeleteSet,
  onToggleCompleted,
  onMoveUp,
  onMoveDown,
  mesoWeek,
  mesoTotalWeeks,
}: {
  exercise: ExerciseWithSets;
  isActive: boolean;
  isCompleted: boolean;
  isReadOnly: boolean;
  onActivate: () => void;
  onAddSet: (weight: number, reps: number, rir: number | null, isWarmup: boolean, isFailure: boolean) => Promise<boolean>;
  onEditSet: (setId: string, weight: number, reps: number, rir: number | null) => void;
  onDeleteSet: (setId: string) => void;
  onToggleCompleted: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  mesoWeek?: number | null;
  mesoTotalWeeks?: number | null;
}) {
  const toast = useToast();
  const [weightNum, setWeightNum] = useState<number>(() => {
    const lastSet = [...exercise.sets].reverse().find((s) => !s.is_warmup);
    if (lastSet) return lastSet.weight_kg;
    if (exercise.prevBest) return exercise.prevBest.weight;
    return 0;
  });
  const [repsNum, setRepsNum] = useState<number>(() => {
    const lastSet = [...exercise.sets].reverse().find((s) => !s.is_warmup);
    if (lastSet) return lastSet.reps;
    if (exercise.prevBest) return exercise.prevBest.reps;
    return exercise.rep_range_min ?? 8;
  });
  const [rirNum, setRirNum] = useState<number | null>(null);
  const [isWarmup, setIsWarmup] = useState(false);
  const [isFailure, setIsFailure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weightEditing, setWeightEditing] = useState(false);
  const [notes, setNotes] = useState(exercise.notes ?? "");
  const [showTips, setShowTips] = useState(false);
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Prescrição editável localmente
  const [editingPrescription, setEditingPrescription] = useState(false);
  const [localSets, setLocalSets] = useState(exercise.prescribed_sets ?? 3);
  const [localRepMin, setLocalRepMin] = useState(exercise.rep_range_min ?? 8);
  const [localRepMax, setLocalRepMax] = useState(exercise.rep_range_max ?? 12);
  const [localRIR, setLocalRIR] = useState(exercise.target_rir ?? 2);
  const [localRest, setLocalRest] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`rest_${exercise.exercise_id}`);
      if (saved) return parseInt(saved);
    }
    return exercise.rest_seconds ?? 90;
  });

  function adjustRest(delta: number) {
    const next = Math.max(15, localRest + delta);
    setLocalRest(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(`rest_${exercise.exercise_id}`, String(next));
    }
  }

  async function savePrescription() {
    await supabase.from("session_exercises").update({
      prescribed_sets: localSets,
      rep_range_min: localRepMin,
      rep_range_max: localRepMax,
      target_rir: localRIR,
      rest_seconds: localRest,
    } as any).eq("id", exercise.id);
    setEditingPrescription(false);
  }

  // Sugestão de carga — RIR-based + meso-aware
  const loadSuggestion = (() => {
    const prev = exercise.prevSession;
    if (!prev || prev.sets.length === 0) return null;
    const base = prev.maxWeight;

    // Deload: mesociclo na última semana
    if (mesoWeek && mesoTotalWeeks && mesoWeek >= mesoTotalWeeks) {
      const deloadKg = Math.round((base * 0.7) / 2.5) * 2.5;
      return { kg: deloadKg, tip: `Sem ${mesoWeek}/${mesoTotalWeeks} · deload → −30% carga` };
    }

    const withRIR = prev.sets.filter((s) => s.rir != null);
    const avgRIR = withRIR.length > 0
      ? withRIR.reduce((sum, s) => sum + s.rir!, 0) / withRIR.length
      : null;

    // Intensificação: segunda metade do meso — prioriza peso sobre volume
    if (mesoWeek && mesoTotalWeeks && mesoWeek > Math.ceil(mesoTotalWeeks / 2)) {
      if (avgRIR !== null && avgRIR >= 1) {
        return { kg: base + 2.5, tip: `Sem ${mesoWeek}/${mesoTotalWeeks} · intensificação → +2.5 kg` };
      }
      return { kg: base, tip: `Sem ${mesoWeek}/${mesoTotalWeeks} · intensificação → manter` };
    }

    if (avgRIR === null) return null;
    if (avgRIR >= 2) return { kg: base + 2.5, tip: `RIR médio ${avgRIR.toFixed(1)} → progredir` };
    if (avgRIR >= 1) return { kg: base + 1.25, tip: `RIR médio ${avgRIR.toFixed(1)} → progressão leve` };
    return { kg: base, tip: `RIR médio ${avgRIR.toFixed(1)} → manter carga` };
  })();

  useEffect(() => {
    const lastSet = [...exercise.sets].reverse().find((s) => !s.is_warmup);
    if (lastSet) {
      setWeightNum(lastSet.weight_kg);
      setRepsNum(lastSet.reps);
      if (lastSet.rir != null) setRirNum(lastSet.rir);
    } else if (exercise.prevBest && exercise.sets.length === 0) {
      setWeightNum(exercise.prevBest.weight);
      setRepsNum(exercise.prevBest.reps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.sets.length]);

  async function handleSave() {
    if (weightNum <= 0 || repsNum <= 0) {
      toast.error("Informe peso e reps válidos");
      return;
    }
    setSaving(true);
    const success = await onAddSet(weightNum, repsNum, rirNum, isWarmup, isFailure);
    if (success) {
      if ("vibrate" in navigator) navigator.vibrate(30);
      setRirNum(null);
      setIsWarmup(false);
      setIsFailure(false);
    }
    setSaving(false);
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(async () => {
      await supabase.from("session_exercises").update({ notes: value || null } as any).eq("id", exercise.id);
    }, 800);
  }

  // Warmup base: last session's top weight, or all-time best
  const warmupBase = exercise.prevSession?.maxWeight ?? exercise.prevBest?.weight ?? 0;

  function fillWarmup(pct: number, warmupReps: number) {
    const w = Math.round((warmupBase * pct) / 2.5) * 2.5;
    setWeightNum(w > 0 ? w : Math.round(warmupBase * pct * 10) / 10);
    setRepsNum(warmupReps);
    setIsWarmup(true);
  }

  const realSets = exercise.sets.filter((s) => !s.is_warmup);
  const warmupSets = exercise.sets.filter((s) => s.is_warmup);
  const muscleColor = MUSCLE_ACCENT[exercise.exercise.primary_muscle ?? ""] ?? "var(--border-strong)";
  const totalExpected = localSets || 3;

  return (
    <div
      onClick={!isActive && !isReadOnly ? onActivate : undefined}
      className="rounded-xl overflow-hidden"
      style={{
        background: isActive ? "var(--surface-strong)" : "var(--surface)",
        borderTop: isActive ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
        borderRight: isActive ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
        borderBottom: isActive ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
        borderLeft: `3px solid ${isActive ? muscleColor : `${muscleColor}44`}`,
        padding: "12px 14px 12px 12px",
        opacity: isCompleted ? 0.65 : 1,
        cursor: !isActive && !isReadOnly ? "pointer" : "default",
        transition: "border-color 0.2s ease, background 0.2s ease",
      }}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="font-bold text-sm">{exercise.exercise.name}</div>
            {exercise.exercise.notes && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowTips((v) => !v); }}
                style={{
                  width: 18, height: 18, minHeight: 18, borderRadius: "50%", flexShrink: 0,
                  background: showTips ? "rgba(68,147,224,0.2)" : "transparent",
                  border: `1px solid ${showTips ? "var(--accent)" : "var(--border-strong)"}`,
                  color: showTips ? "var(--accent)" : "var(--faint)",
                  fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                i
              </button>
            )}
          </div>
          {showTips && exercise.exercise.notes && (
            <div
              className="mt-1.5 px-2.5 py-2 rounded-lg text-xs"
              style={{ background: "rgba(68,147,224,0.06)", border: "0.5px solid rgba(68,147,224,0.2)", color: "var(--muted)", lineHeight: 1.5 }}
            >
              {exercise.exercise.notes}
            </div>
          )}
          {editingPrescription ? (
            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "Séries", val: localSets, set: setLocalSets },
                  { label: "Rep min", val: localRepMin, set: setLocalRepMin },
                  { label: "Rep max", val: localRepMax, set: setLocalRepMax },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <div className="text-xs mb-0.5" style={{ color: "var(--faint)" }}>{label}</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={val}
                      onChange={(e) => set(Number(e.target.value))}
                      className="w-full text-center text-xs font-bold rounded py-1.5"
                      style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none", minHeight: "auto" }}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "RIR alvo", val: localRIR, set: setLocalRIR },
                  { label: "Descanso(s)", val: localRest, set: setLocalRest },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <div className="text-xs mb-0.5" style={{ color: "var(--faint)" }}>{label}</div>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={val}
                      onChange={(e) => set(Number(e.target.value))}
                      className="w-full text-center text-xs font-bold rounded py-1.5"
                      style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--text)", outline: "none", minHeight: "auto" }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={savePrescription} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}>
                  Salvar
                </button>
                <button onClick={() => setEditingPrescription(false)} className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ background: "transparent", border: "0.5px solid var(--border)", color: "var(--muted)", minHeight: "auto" }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1 flex-wrap mt-1.5 items-center">
              {localSets > 0 && (
                <Pill variant="soft">
                  {localSets} × {localRepMin}-{localRepMax}
                </Pill>
              )}
              {localRIR != null && <Pill variant="soft">RIR {localRIR}</Pill>}
              {/* Progress dots */}
              <div className="flex gap-1 items-center ml-0.5">
                {Array.from({ length: Math.max(totalExpected, realSets.length) }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: i < realSets.length ? muscleColor : "var(--border-strong)",
                      transition: "background 0.2s ease",
                    }}
                  />
                ))}
              </div>
              {!isReadOnly && isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingPrescription(true); }}
                  style={{ color: "var(--faint)", fontSize: 11, minHeight: "auto", padding: "1px 4px", cursor: "pointer" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isReadOnly && (onMoveUp || onMoveDown) && (
            <div className="flex flex-col gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
                disabled={!onMoveUp}
                style={{ color: onMoveUp ? "var(--faint)" : "transparent", fontSize: 10, minHeight: "auto", lineHeight: 1, padding: "2px" }}
              >
                ▲
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
                disabled={!onMoveDown}
                style={{ color: onMoveDown ? "var(--faint)" : "transparent", fontSize: 10, minHeight: "auto", lineHeight: 1, padding: "2px" }}
              >
                ▼
              </button>
            </div>
          )}
          {!isReadOnly && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompleted();
              }}
              className="rounded-md flex items-center justify-center"
              style={{
                width: "28px",
                height: "28px",
                minHeight: "28px",
                background: isCompleted ? "var(--primary)" : "var(--surface)",
                color: isCompleted ? "var(--background)" : "var(--muted)",
                border: "0.5px solid var(--border-strong)",
              }}
            >
              ✓
            </button>
          )}
        </div>
      </div>

      {/* Séries registradas */}
      {(realSets.length > 0 || warmupSets.length > 0) && (
        <div className="mt-3 space-y-1">
          <div
            className="grid items-center text-xs font-bold pb-1.5 mb-1"
            style={{
              gridTemplateColumns: "24px 1fr 1fr 1fr 52px",
              gap: "8px",
              color: "var(--faint)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              borderBottom: "0.5px solid var(--border)",
            }}
          >
            <div>#</div>
            <div>kg</div>
            <div>reps</div>
            <div>rir</div>
            <div></div>
          </div>
          {warmupSets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              setNumber={`A${i + 1}`}
              onEdit={isReadOnly ? undefined : (w, r, rir) => onEditSet(s.id, w, r, rir)}
              onDelete={isReadOnly ? undefined : () => onDeleteSet(s.id)}
            />
          ))}
          {realSets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              setNumber={String(i + 1)}
              onEdit={isReadOnly ? undefined : (w, r, rir) => onEditSet(s.id, w, r, rir)}
              onDelete={isReadOnly ? undefined : () => onDeleteSet(s.id)}
            />
          ))}
        </div>
      )}

      {/* Última sessão */}
      {exercise.prevSession && (
        <div className="mt-2 pt-2" style={{ borderTop: "0.5px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-xs font-bold"
              style={{ color: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Última sessão
            </span>
            {(() => {
              if (!weightNum || weightNum <= 0) return null;
              const delta = weightNum - exercise.prevSession!.maxWeight;
              if (delta === 0) return null;
              return (
                <span className="text-xs font-bold tabular" style={{ color: delta > 0 ? "var(--accent)" : "#ff8888" }}>
                  {delta > 0 ? "↑" : "↓"} {delta > 0 ? "+" : ""}{fmtKg(Math.abs(delta))} kg
                </span>
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {exercise.prevSession.sets.map((s, i) => (
              <span key={i} className="text-xs tabular" style={{ color: "var(--muted)" }}>
                {i + 1}. {fmtKg(s.weight_kg)}×{s.reps}
                {s.rir != null ? <span style={{ color: "var(--faint)" }}> @{s.rir}</span> : null}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sugestão de carga */}
      {loadSuggestion && isActive && !isCompleted && !isReadOnly && (
        <div
          className="mt-2 pt-2 flex items-center justify-between"
          style={{ borderTop: "0.5px solid var(--border)" }}
        >
          <div>
            <span className="text-xs font-bold" style={{ color: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Sugestão
            </span>
            <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>{loadSuggestion.tip}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setWeightNum(loadSuggestion.kg); }}
            className="text-xs font-bold tabular px-2.5 py-1 rounded-lg"
            style={{ background: "rgba(68,147,224,0.1)", color: "var(--accent)", border: "0.5px solid rgba(68,147,224,0.25)", minHeight: "auto", cursor: "pointer" }}
          >
            {fmtKg(loadSuggestion.kg)} kg →
          </button>
        </div>
      )}

      {/* Form de adicionar série */}
      {isActive && !isCompleted && !isReadOnly && (
        <div className="mt-3 pt-3" style={{ borderTop: "0.5px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>

          {/* Aquecimento sugerido */}
          {warmupBase > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#fbbf24" }}>
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z" opacity="0"/>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span className="text-xs font-bold" style={{ color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Aquecimento · base {fmtKg(warmupBase)} kg
                </span>
              </div>
              <div className="flex gap-2">
                {[
                  { pct: 0.4, warmupReps: 8, label: "40%" },
                  { pct: 0.6, warmupReps: 5, label: "60%" },
                  { pct: 0.8, warmupReps: 3, label: "80%" },
                ].map(({ pct, warmupReps, label }) => {
                  const w = Math.round((warmupBase * pct) / 2.5) * 2.5;
                  return (
                    <button key={pct} onClick={() => fillWarmup(pct, warmupReps)}
                      className="flex-1 rounded-xl text-xs font-medium"
                      style={{
                        background: "rgba(251,191,36,0.06)",
                        border: "0.5px solid rgba(251,191,36,0.3)",
                        color: "var(--muted)",
                        padding: "9px 4px",
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                      }}>
                      <div style={{ color: "#fbbf24", fontWeight: 800, fontSize: 14 }}>{fmtKg(w)}</div>
                      <div style={{ color: "var(--faint)", marginTop: 2 }}>×{warmupReps} · {label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PESO ── */}
          <div className="mb-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: "var(--faint)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Peso</span>
              {weightEditing ? (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  autoFocus
                  value={weightNum || ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setWeightNum(isNaN(v) ? 0 : Math.max(0, v));
                  }}
                  onBlur={() => setWeightEditing(false)}
                  onKeyDown={(e) => e.key === "Enter" && setWeightEditing(false)}
                  className="text-3xl font-black tabular text-right"
                  style={{
                    color: "var(--text)",
                    letterSpacing: "-0.02em",
                    background: "transparent",
                    border: "none",
                    borderBottom: `2px solid ${muscleColor}`,
                    outline: "none",
                    width: "120px",
                  }}
                />
              ) : (
                <button
                  onClick={() => setWeightEditing(true)}
                  title="Toque para digitar"
                  style={{ minHeight: "auto", cursor: "text", background: "transparent", border: "none", padding: 0 }}
                >
                  {weightNum > 0 ? (
                    <span className="text-3xl font-black tabular" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
                      {fmtKg(weightNum)} <span className="text-base font-bold" style={{ color: "var(--muted)" }}>kg</span>
                    </span>
                  ) : (
                    <span className="text-3xl font-black" style={{ color: "var(--border-strong)" }}>—</span>
                  )}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "−2.5", delta: -2.5, accent: false },
                { label: "−0.5", delta: -0.5, accent: false },
                { label: "+0.5", delta: 0.5, accent: true },
                { label: "+2.5", delta: 2.5, accent: true },
              ].map(({ label, delta, accent }) => (
                <button
                  key={label}
                  onClick={() => setWeightNum((w) => Math.max(0, Math.round((w + delta) * 10) / 10))}
                  className="rounded-xl font-bold text-sm"
                  style={{
                    height: 48,
                    background: accent ? `${muscleColor}18` : "var(--background)",
                    border: `0.5px solid ${accent ? `${muscleColor}44` : "var(--border-strong)"}`,
                    color: accent ? muscleColor : "var(--muted)",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Plate calc */}
            {weightNum > 20 && (() => {
              const hint = calcPlates(weightNum);
              if (!hint) return null;
              return <div className="text-xs mt-2 tabular" style={{ color: "var(--faint)" }}>Barra 20 + {hint} / lado</div>;
            })()}
          </div>

          {/* ── REPS ── */}
          <div className="mb-4">
            <div className="text-xs font-bold mb-2" style={{ color: "var(--faint)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Reps</div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setRepsNum((r) => Math.max(1, r - 1))}
                className="rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0"
                style={{ width: 52, height: 52, background: "var(--background)", border: "0.5px solid var(--border-strong)", color: "var(--muted)", cursor: "pointer" }}
              >
                −
              </button>
              <div className="flex-1 text-center">
                <span className="text-4xl font-black tabular" style={{ color: repsNum > 0 ? "var(--text)" : "var(--border-strong)", letterSpacing: "-0.03em" }}>
                  {repsNum > 0 ? repsNum : "—"}
                </span>
              </div>
              <button
                onClick={() => setRepsNum((r) => Math.min(100, r + 1))}
                className="rounded-xl flex items-center justify-center font-bold text-xl flex-shrink-0"
                style={{ width: 52, height: 52, background: `${muscleColor}18`, border: `0.5px solid ${muscleColor}44`, color: muscleColor, cursor: "pointer" }}
              >
                +
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[6, 8, 10, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => setRepsNum(n)}
                  className="rounded-xl font-bold text-sm"
                  style={{
                    height: 40,
                    background: repsNum === n ? muscleColor : "var(--background)",
                    color: repsNum === n ? "var(--background)" : "var(--muted)",
                    border: `0.5px solid ${repsNum === n ? muscleColor : "var(--border)"}`,
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* ── RIR ── */}
          <div className="mb-4">
            <div className="text-xs font-bold mb-2" style={{ color: "var(--faint)", letterSpacing: "0.1em", textTransform: "uppercase" }}>RIR</div>
            <div className="flex gap-1.5">
              {[
                { label: "Máx", value: 0 },
                { label: "1", value: 1 },
                { label: "2", value: 2 },
                { label: "3", value: 3 },
                { label: "4+", value: 4 },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setRirNum(rirNum === value ? null : value)}
                  className="flex-1 rounded-xl font-bold text-xs"
                  style={{
                    height: 44,
                    background: rirNum === value ? "var(--accent)" : "var(--background)",
                    color: rirNum === value ? "var(--background)" : "var(--muted)",
                    border: `0.5px solid ${rirNum === value ? "var(--accent)" : "var(--border)"}`,
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles: Aquec + Falha */}
          <div className="flex gap-2 items-center mb-2">
            <button
              onClick={() => setIsWarmup((v) => !v)}
              style={{
                fontSize: 11, fontWeight: 700, padding: "6px 14px",
                borderRadius: 8, cursor: "pointer", minHeight: "auto",
                background: isWarmup ? "rgba(251,191,36,0.13)" : "transparent",
                border: `0.5px solid ${isWarmup ? "rgba(251,191,36,0.55)" : "var(--border)"}`,
                color: isWarmup ? "#fbbf24" : "var(--faint)",
                letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              {isWarmup ? "★ Aquec." : "Aquec."}
            </button>
            <button
              onClick={() => setIsFailure((v) => !v)}
              style={{
                fontSize: 11, fontWeight: 700, padding: "6px 14px",
                borderRadius: 8, cursor: "pointer", minHeight: "auto",
                background: isFailure ? "rgba(239,68,68,0.12)" : "transparent",
                border: `0.5px solid ${isFailure ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
                color: isFailure ? "#ef4444" : "var(--faint)",
                letterSpacing: "0.04em",
                transition: "all 0.15s",
              }}
            >
              {isFailure ? "✕ Falha" : "Falha"}
            </button>
          </div>

          {/* Rest timer row */}
          <div
            className="flex items-center justify-between mb-3 px-3 rounded-xl"
            style={{
              background: "rgba(68,147,224,0.06)",
              border: "0.5px solid rgba(68,147,224,0.18)",
              height: 44,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)", flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className="text-xs font-bold" style={{ color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Descanso</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustRest(-30)}
                style={{
                  color: "var(--accent)", fontSize: 11, fontWeight: 700, minHeight: "auto",
                  padding: "4px 9px", border: "0.5px solid rgba(68,147,224,0.25)",
                  borderRadius: 6, cursor: "pointer", background: "rgba(68,147,224,0.08)",
                }}
              >−30</button>
              <span
                className="text-sm font-black tabular"
                style={{ color: "var(--accent)", minWidth: 44, textAlign: "center", letterSpacing: "-0.01em" }}
              >
                {fmtTimer(localRest)}
              </span>
              <button
                onClick={() => adjustRest(30)}
                style={{
                  color: "var(--accent)", fontSize: 11, fontWeight: 700, minHeight: "auto",
                  padding: "4px 9px", border: "0.5px solid rgba(68,147,224,0.25)",
                  borderRadius: 6, cursor: "pointer", background: "rgba(68,147,224,0.08)",
                }}
              >+30</button>
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Notas do exercício..."
            rows={1}
            className="w-full rounded-xl px-3 py-2.5 text-xs resize-none mb-3"
            style={{ background: "var(--background)", border: "0.5px solid var(--border)", color: "var(--muted)", outline: "none" }}
          />

          {/* ── BOTÃO SALVAR ── */}
          <button
            onClick={handleSave}
            disabled={saving || weightNum <= 0 || repsNum <= 0}
            className="w-full rounded-xl flex items-center justify-center gap-2 font-bold"
            style={{
              height: 56,
              background: (saving || weightNum <= 0 || repsNum <= 0) ? "var(--surface-strong)" : "var(--accent)",
              color: (saving || weightNum <= 0 || repsNum <= 0) ? "var(--muted)" : "var(--background)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: 14,
              cursor: (saving || weightNum <= 0 || repsNum <= 0) ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {saving ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {isWarmup ? "Aquecimento" : "Salvar Série"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function calcPlates(targetKg: number): string | null {
  const perSide = (targetKg - 20) / 2;
  if (perSide <= 0) return null;
  const sizes = [20, 15, 10, 5, 2.5, 1.25];
  const used: string[] = [];
  let rem = Math.round(perSide * 1000) / 1000;
  for (const p of sizes) {
    const n = Math.floor(rem / p + 0.001);
    if (n > 0) {
      used.push(`${n}×${p}`);
      rem = Math.round((rem - n * p) * 1000) / 1000;
    }
  }
  if (rem > 0.01) return null;
  return used.join(" + ") || null;
}

// ============================================================
// Modal de dados da sessão (mid-session)
// ============================================================
function SessionInfoModal({
  session,
  onClose,
  onSaved,
}: {
  session: WorkoutSession;
  onClose: () => void;
  onSaved: (updated: WorkoutSession) => void;
}) {
  const [energy, setEnergy] = useState<number | null>(session.energy_level ?? null);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [bodyweight, setBodyweight] = useState(session.bodyweight_kg ? String(session.bodyweight_kg) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const bw = bodyweight ? parseFloat(bodyweight) : null;
    const { data } = await supabase
      .from("workout_sessions")
      .update({ energy_level: energy, notes: notes.trim() || null, bodyweight_kg: bw && bw > 0 ? bw : null } as any)
      .eq("id", session.id)
      .select()
      .single();
    setSaving(false);
    if (data) onSaved(data as WorkoutSession);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-2xl p-5 slide-up"
        style={{ background: "var(--background)", border: "0.5px solid var(--border-strong)", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold">Dados da sessão</h2>
          <button onClick={onClose} style={{ color: "var(--muted)", minHeight: "auto" }}>✕</button>
        </div>

        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Peso corporal (kg)
        </label>
        <input type="number" inputMode="decimal" value={bodyweight} onChange={(e) => setBodyweight(e.target.value)}
          placeholder="Ex: 80.5" step="0.1"
          className="w-full rounded-lg px-3 py-2.5 text-sm mb-4 text-center font-bold"
          style={{ background: "var(--surface)", border: "0.5px solid var(--border)", color: "var(--text)", outline: "none" }} />

        <label className="block text-xs font-bold mb-2" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Energia
        </label>
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} onClick={() => setEnergy(energy === i ? null : i)}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold"
              style={{ minHeight: "44px", background: energy === i ? "var(--primary)" : "var(--surface)", color: energy === i ? "var(--background)" : "var(--muted)", border: `0.5px solid ${energy === i ? "var(--primary)" : "var(--border)"}` }}>
              {i}
            </button>
          ))}
        </div>

        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Notas
        </label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="Como está o treino?"
          className="w-full rounded-lg px-3 py-2.5 text-sm mb-4 resize-none"
          style={{ background: "var(--surface)", border: "0.5px solid var(--border)", color: "var(--text)", outline: "none" }} />

        <Button fullWidth onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Modal de finalização
// ============================================================
function FinishSessionModal({
  onFinish,
  onCancel,
}: {
  onFinish: (energyLevel: number | null, notes: string, bodyweightKg: number | null) => void;
  onCancel: () => void;
}) {
  const [energy, setEnergy] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [bodyweight, setBodyweight] = useState("");

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4, 6, 7, 0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 slide-up"
        style={{
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <h2 className="text-lg font-bold mb-4">Como foi o treino?</h2>

        <div className="mb-4">
          <div
            className="text-xs font-bold mb-2"
            style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Energia
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setEnergy(energy === level ? null : level)}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold"
                style={{
                  background: energy === level ? "var(--primary)" : "var(--surface)",
                  color: energy === level ? "var(--background)" : "var(--muted)",
                  border: `0.5px solid ${energy === level ? "var(--primary)" : "var(--border)"}`,
                  minHeight: "44px",
                }}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div
            className="text-xs font-bold mb-2"
            style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Peso corporal (opcional)
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            placeholder="kg"
            step="0.1"
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              color: "var(--text)",
              outline: "none",
              minHeight: "44px",
            }}
          />
        </div>

        <div className="mb-5">
          <div
            className="text-xs font-bold mb-2"
            style={{ color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            Notas da sessão
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Como foi? O que sentiu?"
            rows={2}
            className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
            style={{
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onFinish(energy, notes, bodyweight ? parseFloat(bodyweight) : null)}
            className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer"
            style={{ background: "var(--primary)", color: "var(--background)" }}
          >
            Finalizar treino
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer"
            style={{
              background: "var(--surface-strong)",
              color: "var(--muted)",
              border: "0.5px solid var(--border)",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function SetRow({
  set,
  setNumber,
  onEdit,
  onDelete,
}: {
  set: SessionSet;
  setNumber: string;
  onEdit?: (weight: number, reps: number, rir: number | null) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [w, setW] = useState(String(set.weight_kg));
  const [r, setR] = useState(String(set.reps));
  const [rirVal, setRirVal] = useState(set.rir != null ? String(set.rir) : "");

  function handleSave() {
    const weight = parseFloat(w);
    const reps = parseInt(r);
    if (!weight || weight <= 0 || !reps || reps <= 0) return;
    onEdit?.(weight, reps, rirVal ? parseInt(rirVal) : null);
    setEditing(false);
  }

  function handleCancel() {
    setW(String(set.weight_kg));
    setR(String(set.reps));
    setRirVal(set.rir != null ? String(set.rir) : "");
    setEditing(false);
  }

  const numStyle = {
    background: "var(--background)",
    border: "0.5px solid var(--border-strong)",
    color: "var(--text)",
    outline: "none",
    minHeight: "auto",
  };

  if (editing) {
    return (
      <div className="grid items-center py-1" style={{ gridTemplateColumns: "24px 1fr 1fr 1fr 52px", gap: "6px" }}>
        <div className="font-bold text-xs" style={{ color: set.is_failure ? "#ef4444" : set.is_warmup ? "var(--muted)" : "var(--accent)" }}>
          {setNumber}
        </div>
        <input type="number" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)}
          step="0.5" className="text-center text-xs font-bold tabular rounded py-1.5"
          style={numStyle} autoFocus />
        <input type="number" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)}
          className="text-center text-xs font-bold tabular rounded py-1.5" style={numStyle} />
        <input type="number" inputMode="numeric" value={rirVal} onChange={(e) => setRirVal(e.target.value)}
          placeholder="—" className="text-center text-xs tabular rounded py-1.5" style={numStyle} />
        <div className="flex gap-1.5 justify-end">
          <button onClick={handleSave} style={{ color: "var(--accent)", fontSize: "15px", minHeight: "auto" }}>✓</button>
          <button onClick={handleCancel} style={{ color: "var(--muted)", fontSize: "15px", minHeight: "auto" }}>×</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-center py-1.5 text-sm" style={{ gridTemplateColumns: "24px 1fr 1fr 1fr 52px", gap: "8px" }}>
      <div className="font-bold text-xs" style={{ color: set.is_failure ? "#ef4444" : set.is_warmup ? "var(--muted)" : "var(--accent)" }}>
        {setNumber}{set.is_failure ? "!" : ""}
      </div>
      <div className="tabular font-medium">{fmtKg(set.weight_kg)}</div>
      <div className="tabular font-medium">{set.reps}</div>
      <div className="tabular" style={{ color: "var(--muted)" }}>{set.rir ?? "—"}</div>
      <div className="flex gap-1.5 justify-end">
        {onEdit && (
          <button
            onClick={() => setEditing(true)}
            style={{ color: "var(--faint)", minHeight: "auto", padding: "2px 3px", fontSize: "12px" }}
          >
            ✎
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            style={{ color: "var(--faint)", minHeight: "auto", padding: "2px 3px", fontSize: "13px" }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
