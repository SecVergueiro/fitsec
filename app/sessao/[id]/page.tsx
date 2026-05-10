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

    const { data: sessionData } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    setSession(sessionData as WorkoutSession);

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

          // Best e1RM across all history
          const best = all.reduce(
            (acc, s) => {
              const e1 = estimate1RM(s.weight_kg, s.reps);
              return e1 > acc.e1rm ? { weight: s.weight_kg, reps: s.reps, e1rm: e1 } : acc;
            },
            { weight: 0, reps: 0, e1rm: 0 }
          );
          if (best.e1rm > 0) prevBest = best;

          // Last session's sets (first session_id in desc order, reversed to chronological)
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

  async function addSet(
    exIdx: number,
    weight: number,
    reps: number,
    rir: number | null,
    isWarmup: boolean
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
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Erro ao salvar série");
      return false;
    }

    // Detecção de PR — comparar e1RM da série nova com melhor histórico + melhor da sessão atual
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
      }
    }

    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], sets: [...next[exIdx].sets, data as SessionSet] };
      return next;
    });

    if (!isWarmup && ex.rest_seconds) {
      startRestTimer(ex.rest_seconds);
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
          ← Sessão
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
      {/* Header sticky — contém cronômetro e timer de descanso (persiste ao rolar) */}
      <div
        className="sticky -mx-5 px-5 mb-3 z-10"
        style={{
          top: 0,
          background: "rgba(4, 6, 7, 0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        {/* Linha de navegação */}
        <div className="flex justify-between items-center py-3">
          <Link
            href="/sessao"
            className="text-xs font-medium"
            style={{ color: "var(--muted)", minHeight: "auto" }}
          >
            ← Sessão
          </Link>
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

        {/* Timer de descanso integrado ao sticky — sempre visível ao rolar */}
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
        <Card variant="ghost" className="text-center py-5">
          <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Nenhum exercício na sessão ainda
          </div>
          {!isCompleted && (
            <Button onClick={() => setShowAddExercise(true)}>+ Adicionar exercício</Button>
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
              onAddSet={(weight, reps, rir, isWarmup) => addSet(idx, weight, reps, rir, isWarmup)}
              onEditSet={(setId, weight, reps, rir) => editSet(idx, setId, weight, reps, rir)}
              onDeleteSet={(setId) => deleteSet(idx, setId)}
              onToggleCompleted={() => toggleCompleted(idx)}
            />
          ))}
        </div>
      )}

      {!isCompleted && exercises.length > 0 && (
        <Card
          variant="ghost"
          className="text-center cursor-pointer mb-3"
          onClick={() => setShowAddExercise(true)}
        >
          <div className="font-bold" style={{ color: "var(--primary)" }}>
            + Adicionar exercício extra
          </div>
        </Card>
      )}

      {!isCompleted && (
        <button
          onClick={abandonSession}
          className="text-xs mt-6 block mx-auto"
          style={{ color: "#ff8888", minHeight: "auto" }}
        >
          Descartar sessão
        </button>
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
}: {
  exercise: ExerciseWithSets;
  isActive: boolean;
  isCompleted: boolean;
  isReadOnly: boolean;
  onActivate: () => void;
  onAddSet: (weight: number, reps: number, rir: number | null, isWarmup: boolean) => Promise<boolean>;
  onEditSet: (setId: string, weight: number, reps: number, rir: number | null) => void;
  onDeleteSet: (setId: string) => void;
  onToggleCompleted: () => void;
}) {
  const toast = useToast();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [isWarmup, setIsWarmup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(exercise.notes ?? "");
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-preenche com valores da serie anterior
  useEffect(() => {
    const lastSet = [...exercise.sets].reverse().find((s) => !s.is_warmup);
    if (lastSet && !weight) {
      setWeight(String(lastSet.weight_kg));
      if (!reps) setReps(String(lastSet.reps));
      if (lastSet.rir != null && !rir) setRir(String(lastSet.rir));
    } else if (!lastSet && exercise.prevBest && !weight) {
      setWeight(String(exercise.prevBest.weight));
      if (!reps) setReps(String(exercise.prevBest.reps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.sets.length]);

  async function handleSave() {
    const w = parseFloat(weight);
    const r = parseInt(reps);
    const rirVal = rir ? parseInt(rir) : null;
    if (!w || w <= 0 || !r || r <= 0) {
      toast.error("Informe peso e reps válidos");
      return;
    }
    setSaving(true);
    const success = await onAddSet(w, r, rirVal, isWarmup);
    if (success) {
      toast.success(isWarmup ? "Aquecimento salvo" : "Série salva");
      if ("vibrate" in navigator) navigator.vibrate(30);
      setReps("");
      setRir("");
      setIsWarmup(false);
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

  const realSets = exercise.sets.filter((s) => !s.is_warmup);
  const warmupSets = exercise.sets.filter((s) => s.is_warmup);

  return (
    <div
      onClick={!isActive && !isReadOnly ? onActivate : undefined}
      className="rounded-xl"
      style={{
        background: isActive ? "var(--surface-strong)" : "var(--surface)",
        border: isActive ? "0.5px solid var(--border-strong)" : "0.5px solid var(--border)",
        padding: "12px 14px",
        opacity: isCompleted ? 0.65 : 1,
        cursor: !isActive && !isReadOnly ? "pointer" : "default",
      }}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{exercise.exercise.name}</div>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {exercise.prescribed_sets && (
              <Pill variant="soft">
                {exercise.prescribed_sets} × {exercise.rep_range_min}-{exercise.rep_range_max}
              </Pill>
            )}
            {exercise.target_rir != null && <Pill variant="soft">RIR {exercise.target_rir}</Pill>}
            <Pill variant="ghost">
              {realSets.length}/{exercise.prescribed_sets ?? "?"}
            </Pill>
          </div>
        </div>
        {!isReadOnly && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompleted();
            }}
            className="rounded-md flex-shrink-0 flex items-center justify-center"
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

      {/* Lista de series feitas */}
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
        <div
          className="mt-2 pt-2"
          style={{ borderTop: "0.5px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-xs font-bold"
              style={{ color: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              Última sessão
            </span>
            {(() => {
              const w = parseFloat(weight);
              if (!weight || isNaN(w)) return null;
              const delta = w - exercise.prevSession!.maxWeight;
              if (delta === 0) return null;
              return (
                <span
                  className="text-xs font-bold tabular"
                  style={{ color: delta > 0 ? "var(--accent)" : "#ff8888" }}
                >
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

      {/* Form de adicionar serie */}
      {isActive && !isCompleted && !isReadOnly && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <div
            className="grid items-center mb-2"
            style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}
          >
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="kg"
              step="0.5"
              className="text-center font-bold tabular text-sm rounded-md py-2"
              style={{
                background: "var(--background)",
                border: "0.5px solid var(--border-strong)",
                color: "var(--text)",
                outline: "none",
                minHeight: "44px",
              }}
            />
            <input
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="reps"
              className="text-center font-bold tabular text-sm rounded-md py-2"
              style={{
                background: "var(--background)",
                border: "0.5px solid var(--border-strong)",
                color: "var(--text)",
                outline: "none",
                minHeight: "44px",
              }}
            />
            <input
              type="number"
              inputMode="numeric"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              placeholder="RIR"
              className="text-center font-bold tabular text-sm rounded-md py-2"
              style={{
                background: "var(--background)",
                border: "0.5px solid var(--border-strong)",
                color: "var(--text)",
                outline: "none",
                minHeight: "44px",
              }}
            />
          </div>
          <div className="flex gap-2 items-center mb-2">
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer"
              style={{ color: "var(--muted)" }}
            >
              <input
                type="checkbox"
                checked={isWarmup}
                onChange={(e) => setIsWarmup(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              Aquecimento
            </label>
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Notas do exercício (opcional)"
            rows={2}
            className="w-full rounded-md px-3 py-2 text-xs resize-none mb-2"
            style={{
              background: "var(--background)",
              border: "0.5px solid var(--border)",
              color: "var(--muted)",
              outline: "none",
            }}
          />
          {/* Calculadora de anilhas inline */}
          {(() => {
            const w = parseFloat(weight);
            if (!w || w <= 20) return null;
            const hint = calcPlates(w);
            if (!hint) return null;
            return (
              <div className="text-xs mb-2 tabular" style={{ color: "var(--faint)" }}>
                Barra 20 + {hint} / lado
              </div>
            );
          })()}
          <Button onClick={handleSave} disabled={saving} fullWidth size="sm">
            {saving ? "Salvando..." : "Salvar série"}
          </Button>
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
// Modal de finalização — energia + notas
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
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 fade-in"
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
      <div
        className="grid items-center py-1"
        style={{ gridTemplateColumns: "24px 1fr 1fr 1fr 52px", gap: "6px" }}
      >
        <div className="font-bold text-xs" style={{ color: set.is_warmup ? "var(--muted)" : "var(--accent)" }}>
          {setNumber}
        </div>
        <input
          type="number" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)}
          step="0.5" className="text-center text-xs font-bold tabular rounded py-1.5"
          style={numStyle} autoFocus
        />
        <input
          type="number" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)}
          className="text-center text-xs font-bold tabular rounded py-1.5"
          style={numStyle}
        />
        <input
          type="number" inputMode="numeric" value={rirVal} onChange={(e) => setRirVal(e.target.value)}
          placeholder="—" className="text-center text-xs tabular rounded py-1.5"
          style={numStyle}
        />
        <div className="flex gap-1.5 justify-end">
          <button onClick={handleSave} style={{ color: "var(--accent)", fontSize: "15px", minHeight: "auto" }}>✓</button>
          <button onClick={handleCancel} style={{ color: "var(--muted)", fontSize: "15px", minHeight: "auto" }}>×</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid items-center py-1.5 text-sm"
      style={{ gridTemplateColumns: "24px 1fr 1fr 1fr 52px", gap: "8px" }}
    >
      <div className="font-bold text-xs" style={{ color: set.is_warmup ? "var(--muted)" : "var(--accent)" }}>
        {setNumber}
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
