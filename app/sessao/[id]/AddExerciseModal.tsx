"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Input, Button } from "@/components/Button";
import { ExerciseItem } from "@/components/ExerciseItem";
import type { Exercise } from "@/lib/database.types";

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
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    supabase
      .from("exercises")
      .select("*")
      .order("name")
      .then(({ data }) => setExercises((data as Exercise[]) ?? []));
  }, []);

  const filtered = search.trim()
    ? exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises;

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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4, 6, 7, 0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 fade-in"
        style={{
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          maxHeight: "90vh",
          overflow: "auto",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">Adicionar exercício</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none p-1"
            style={{ color: "var(--muted)", minHeight: "auto" }}
          >
            ×
          </button>
        </div>
        <Input value={search} onChange={setSearch} placeholder="Buscar..." autoFocus />
        <div className="mt-3 max-h-80 overflow-auto -mx-1">
          {filtered.map((ex) => (
            <div key={ex.id} onClick={() => !adding && add(ex)} className="cursor-pointer">
              <ExerciseItem exercise={ex} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
