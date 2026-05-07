"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { fmtTimer, estimate1RM, fmtKg } from "@/lib/utils";
import type { Exercise, SessionExercise, SessionSet, WorkoutSession } from "@/lib/database.types";
import { AddExerciseToSessionModal } from "./AddExerciseModal";

interface ExerciseWithSets extends SessionExercise {
  exercise: Exercise;
  sets: SessionSet[];
  prevBest?: { weight: number; reps: number; e1rm: number };
}

export default function SessaoAtivaPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const restRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    load();
    elapsedRef.current = setInterval(() => {
      if (session?.started_at && !session.completed_at) {
        const start = new Date(session.started_at).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }
    }, 1000);
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      if (restRef.current) clearInterval(restRef.current);
    };
  }, [sessionId, session?.started_at, session?.completed_at]);

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

    // Pra cada exercicio, busca series e melhor sessao anterior
    const enriched = await Promise.all(
      (exData as any[]).map(async (ex) => {
        const { data: sets } = await supabase
          .from("session_sets")
          .select("*")
          .eq("session_exercise_id", ex.id)
          .order("set_number");

        // Busca melhor e1RM anterior desse exercicio
        const { data: prevSets } = await supabase
          .from("session_sets")
          .select("weight_kg, reps")
          .eq("exercise_id", ex.exercise_id)
          .eq("is_warmup", false)
          .neq("session_id", sessionId)
          .order("performed_at", { ascending: false })
          .limit(50);

        let prevBest: any = undefined;
        if (prevSets && prevSets.length > 0) {
          const best = (prevSets as any[]).reduce(
            (acc, s) => {
              const e1 = estimate1RM(s.weight_kg, s.reps);
              return e1 > acc.e1rm ? { weight: s.weight_kg, reps: s.reps, e1rm: e1 } : acc;
            },
            { weight: 0, reps: 0, e1rm: 0 }
          );
          if (best.e1rm > 0) prevBest = best;
        }

        return { ...ex, sets: (sets as SessionSet[]) ?? [], prevBest };
      })
    );

    setExercises(enriched);

    // Define exercicio ativo (primeiro nao-completo)
    const firstIncomplete = enriched.findIndex((e) => !e.is_completed);
    setActiveIdx(firstIncomplete === -1 ? 0 : firstIncomplete);

    setLoading(false);
  }

  async function addSet(exIdx: number, weight: number, reps: number, rir: number | null, isWarmup: boolean) {
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
      alert("Erro ao salvar série: " + error.message);
      return;
    }

    // Atualiza estado local
    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], sets: [...next[exIdx].sets, data as SessionSet] };
      return next;
    });

    // Inicia timer de descanso (se nao for warmup)
    if (!isWarmup && ex.rest_seconds) {
      startRestTimer(ex.rest_seconds);
    }
  }

  async function deleteSet(exIdx: number, setId: string) {
    if (!confirm("Excluir essa série?")) return;
    await supabase.from("session_sets").delete().eq("id", setId);
    setExercises((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], sets: next[exIdx].sets.filter((s) => s.id !== setId) };
      return next;
    });
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
    restRef.current = setInterval(() => {
      setRestRemaining((prev) => {
        if (prev === null || prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          // Vibra se suportado
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function finishSession() {
    if (!confirm("Finalizar essa sessão?")) return;
    const now = new Date().toISOString();
    const start = new Date(session!.started_at).getTime();
    const minutes = Math.floor((Date.now() - start) / 60000);
    await supabase
      .from("workout_sessions")
      .update({
        completed_at: now,
        ended_at: now,
        duration_minutes: minutes,
      } as any)
      .eq("id", sessionId);
    router.push("/sessao");
  }

  async function abandonSession() {
    if (!confirm("Descartar essa sessão? Todas as séries registradas serão perdidas.")) return;
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

  if (!session) return <div>Sessão não encontrada</div>;

  const isCompleted = !!session.completed_at;
  const activeEx = exercises[activeIdx];
  const completedCount = exercises.filter((e) => e.is_completed).length;

  return (
    <div className="fade-in">
      {/* Header sticky com cronometro */}
      <div
        className="sticky -mx-5 px-5 py-3 mb-3 z-10"
        style={{
          top: 0,
          background: "rgba(4, 6, 7, 0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div className="flex justify-between items-center">
          <Link href="/sessao" className="text-xs font-medium" style={{ color: "var(--muted)", minHeight: "auto" }}>
            ← Sessão
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-sm font-bold tabular" style={{ color: isCompleted ? "var(--muted)" : "var(--accent)" }}>
              {fmtTimer(elapsed)}
            </div>
            {!isCompleted && (
              <button
                onClick={finishSession}
                className="text-xs font-bold px-3 py-1.5 rounded-md"
                style={{ background: "var(--primary)", color: "var(--background)", minHeight: "auto" }}
              >
                Finalizar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rest timer */}
      {restRemaining !== null && (
        <div
          className="mb-3 px-4 py-3 rounded-lg flex justify-between items-center"
          style={{ background: "var(--accent)", color: "var(--background)" }}
        >
          <span className="text-sm font-bold">Descansando...</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold tabular">{fmtTimer(restRemaining)}</span>
            <button onClick={() => setRestRemaining(null)} className="text-xs font-bold" style={{ minHeight: "auto" }}>
              Pular
            </button>
          </div>
        </div>
      )}

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
              onDeleteSet={(setId) => deleteSet(idx, setId)}
              onToggleCompleted={() => toggleCompleted(idx)}
            />
          ))}
        </div>
      )}

      {!isCompleted && exercises.length > 0 && (
        <Card variant="ghost" className="text-center cursor-pointer mb-3" onClick={() => setShowAddExercise(true)}>
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
  onDeleteSet,
  onToggleCompleted,
}: {
  exercise: ExerciseWithSets;
  isActive: boolean;
  isCompleted: boolean;
  isReadOnly: boolean;
  onActivate: () => void;
  onAddSet: (weight: number, reps: number, rir: number | null, isWarmup: boolean) => void;
  onDeleteSet: (setId: string) => void;
  onToggleCompleted: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [isWarmup, setIsWarmup] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pre-preenche com valores da serie anterior
  useEffect(() => {
    const lastSet = [...exercise.sets].reverse().find((s) => !s.is_warmup);
    if (lastSet && !weight) {
      setWeight(String(lastSet.weight_kg));
      if (!reps) setReps(String(lastSet.reps));
      if (lastSet.rir != null && !rir) setRir(String(lastSet.rir));
    } else if (!lastSet && exercise.prevBest && !weight) {
      setWeight(String(exercise.prevBest.weight));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.sets.length]);

  async function handleSave() {
    const w = parseFloat(weight);
    const r = parseInt(reps);
    const rirVal = rir ? parseInt(rir) : null;
    if (!w || w <= 0 || !r || r <= 0) {
      alert("Informe peso e reps válidos");
      return;
    }
    setSaving(true);
    onAddSet(w, r, rirVal, isWarmup);
    setReps("");
    setRir("");
    setIsWarmup(false);
    setSaving(false);
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
              gridTemplateColumns: "24px 1fr 1fr 1fr 28px",
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
            <SetRow key={s.id} set={s} setNumber={`A${i + 1}`} onDelete={isReadOnly ? undefined : () => onDeleteSet(s.id)} />
          ))}
          {realSets.map((s, i) => (
            <SetRow key={s.id} set={s} setNumber={String(i + 1)} onDelete={isReadOnly ? undefined : () => onDeleteSet(s.id)} />
          ))}
        </div>
      )}

      {/* Sessão anterior */}
      {exercise.prevBest && (
        <div className="mt-2 text-xs flex justify-between" style={{ color: "var(--muted)" }}>
          <span>Anterior: {fmtKg(exercise.prevBest.weight)}kg × {exercise.prevBest.reps}</span>
          <span className="tabular">e1RM {fmtKg(exercise.prevBest.e1rm)}</span>
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
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--muted)" }}>
              <input
                type="checkbox"
                checked={isWarmup}
                onChange={(e) => setIsWarmup(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              Aquecimento
            </label>
          </div>
          <Button onClick={handleSave} disabled={saving} fullWidth size="sm">
            Salvar série
          </Button>
        </div>
      )}
    </div>
  );
}

function SetRow({ set, setNumber, onDelete }: { set: SessionSet; setNumber: string; onDelete?: () => void }) {
  return (
    <div
      className="grid items-center py-1.5 text-sm"
      style={{
        gridTemplateColumns: "24px 1fr 1fr 1fr 28px",
        gap: "8px",
      }}
    >
      <div className="font-bold text-xs" style={{ color: set.is_warmup ? "var(--muted)" : "var(--accent)" }}>
        {setNumber}
      </div>
      <div className="tabular font-medium">{fmtKg(set.weight_kg)}</div>
      <div className="tabular font-medium">{set.reps}</div>
      <div className="tabular" style={{ color: "var(--muted)" }}>
        {set.rir ?? "—"}
      </div>
      <div>
        {onDelete && (
          <button onClick={onDelete} className="text-xs" style={{ color: "var(--faint)", minHeight: "auto", padding: "2px 4px" }}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
