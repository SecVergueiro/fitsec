"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input, Button } from "@/components/Button";
import { ExerciseItem } from "@/components/ExerciseItem";
import { MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise } from "@/lib/database.types";
import { NewExerciseModal } from "@/app/biblioteca/NewExerciseModal";

const MUSCLE_FILTER_KEYS = [
  "peito", "costas", "ombro", "quadriceps", "posterior",
  "biceps", "triceps", "gluteo", "core",
] as const;

export function AddExerciseToSessionModal({
  sessionId,
  existingOrder,
  onClose,
  onAdded,
}: {
  sessionId: string;
  existingOrder: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showNewExercise, setShowNewExercise] = useState(false);

  async function loadExercises() {
    const { data } = await supabase.from("exercises").select("*").order("name");
    setExercises((data as Exercise[]) ?? []);
  }

  useEffect(() => {
    loadExercises();
  }, []);

  const filtered = exercises.filter((e) => {
    const matchesMuscle = muscleFilter ? e.primary_muscle === muscleFilter : true;
    const matchesSearch = search.trim()
      ? e.name.toLowerCase().includes(search.toLowerCase())
      : true;
    return matchesMuscle && matchesSearch;
  });

  async function add(ex: Exercise) {
    setAdding(true);
    await supabase.from("session_exercises").insert({
      session_id: sessionId,
      exercise_id: ex.id,
      exercise_order: existingOrder + 1,
      prescribed_sets: 3,
      rep_range_min: 8,
      rep_range_max: 12,
      target_rir: 2,
      rest_seconds: 90,
    } as any);
    setAdding(false);
    onAdded();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(4, 6, 7, 0.82)", backdropFilter: "blur(10px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-5 scale-in"
        style={{
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          height: "82vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <h2 className="text-lg font-bold">Adicionar exercício</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none p-1"
            style={{ color: "var(--muted)", minHeight: "auto" }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 mb-3">
          <Input value={search} onChange={setSearch} placeholder="Buscar exercício..." autoFocus />
        </div>

        {/* Muscle filter chips */}
        <div className="flex-shrink-0 mb-3">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setMuscleFilter(null)}
              className="text-xs px-3 py-1.5 rounded-full font-bold"
              style={{
                background: !muscleFilter ? "var(--primary)" : "var(--surface)",
                color: !muscleFilter ? "var(--background)" : "var(--muted)",
                border: `0.5px solid ${!muscleFilter ? "var(--primary)" : "var(--border)"}`,
                minHeight: "auto",
              }}
            >
              Todos
            </button>
            {MUSCLE_FILTER_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setMuscleFilter(muscleFilter === key ? null : key)}
                className="text-xs px-3 py-1.5 rounded-full font-bold"
                style={{
                  background: muscleFilter === key ? "var(--primary)" : "var(--surface)",
                  color: muscleFilter === key ? "var(--background)" : "var(--muted)",
                  border: `0.5px solid ${muscleFilter === key ? "var(--primary)" : "var(--border)"}`,
                  minHeight: "auto",
                }}
              >
                {MUSCLE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        {/* Count + criar novo */}
        <div className="flex-shrink-0 mb-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--faint)" }}>
            {filtered.length} exercício{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setShowNewExercise(true)}
            className="rounded-full text-xs font-bold flex items-center gap-1"
            style={{
              padding: "5px 12px",
              minHeight: "auto",
              background: "rgba(152, 181, 210, 0.1)",
              color: "var(--primary)",
              border: "1px dashed var(--primary)",
              cursor: "pointer",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Criar novo
          </button>
        </div>

        {/* Exercise list */}
        <div className="overflow-auto flex-1 -mx-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8" style={{ color: "var(--muted)" }}>
              <div className="text-sm mb-3">Nenhum exercício encontrado</div>
              <button
                onClick={() => setShowNewExercise(true)}
                className="rounded-lg font-bold text-sm"
                style={{
                  padding: "10px 18px", minHeight: 44, cursor: "pointer",
                  background: "var(--primary)", color: "var(--background)",
                }}
              >
                + Criar &quot;{search.trim() || "novo exercício"}&quot;
              </button>
            </div>
          ) : (
            filtered.map((ex) => (
              <div
                key={ex.id}
                onClick={() => !adding && add(ex)}
                className="cursor-pointer"
                style={{ opacity: adding ? 0.5 : 1 }}
              >
                <ExerciseItem exercise={ex} />
              </div>
            ))
          )}
        </div>
      </div>

      {showNewExercise && (
        <NewExerciseModal
          existingExercises={exercises.filter((e) => !e.parent_exercise_id)}
          onClose={() => setShowNewExercise(false)}
          onCreated={async () => {
            setShowNewExercise(false);
            // Recarrega lista e pega o mais recente (acabou de criar)
            const { data } = await supabase
              .from("exercises").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
            await loadExercises();
            if (data) {
              await add(data as Exercise);
            }
          }}
        />
      )}
    </div>
  );
}
