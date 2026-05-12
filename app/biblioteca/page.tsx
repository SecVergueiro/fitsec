"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { ExerciseItem } from "@/components/ExerciseItem";
import { MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise } from "@/lib/database.types";
import { NewExerciseModal } from "./NewExerciseModal";
import { EditExerciseModal } from "./EditExerciseModal";

const MUSCLE_FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "peito", label: "Peito" },
  { value: "costas", label: "Costas" },
  { value: "quadriceps", label: "Pernas" },
  { value: "ombro", label: "Ombro" },
  { value: "biceps", label: "Braço" },
  { value: "core", label: "Core" },
];

export default function BibliotecaPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string>("todos");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    loadExercises();
  }, []);

  async function loadExercises() {
    setLoading(true);
    const { data, error } = await supabase
      .from("exercises")
      .select("*")
      .order("name");

    if (!error && data) {
      setExercises(data as Exercise[]);
    }
    setLoading(false);
  }

  // Agrupa exercicios pais com suas variacoes
  const filtered = useMemo(() => {
    let list = exercises;

    if (muscleFilter !== "todos") {
      list = list.filter((e) => {
        if (muscleFilter === "biceps") {
          return ["biceps", "triceps", "antebraco"].includes(e.primary_muscle);
        }
        if (muscleFilter === "quadriceps") {
          return ["quadriceps", "posterior", "gluteo", "panturrilha"].includes(e.primary_muscle);
        }
        if (muscleFilter === "ombro") {
          return ["ombro", "ombro_anterior", "ombro_posterior"].includes(e.primary_muscle);
        }
        return e.primary_muscle === muscleFilter;
      });
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          MUSCLE_LABELS[e.primary_muscle]?.toLowerCase().includes(q)
      );
    }

    // Estrutura: parents primeiro, depois variations agrupadas por parent
    const parents = list.filter((e) => !e.parent_exercise_id);
    const variationsByParent: Record<string, Exercise[]> = {};
    list
      .filter((e) => e.parent_exercise_id)
      .forEach((v) => {
        if (!variationsByParent[v.parent_exercise_id!]) {
          variationsByParent[v.parent_exercise_id!] = [];
        }
        variationsByParent[v.parent_exercise_id!].push(v);
      });

    // Inclui pais que correspondem a buscas mesmo se filtrados pra fora pelos filhos
    return { parents, variationsByParent };
  }, [exercises, search, muscleFilter]);

  return (
    <div className="fade-in">
      <div className="flex items-start justify-between mb-5">
        <PageHeader eyebrow="Biblioteca" title="Exercícios" />
        <button
          onClick={() => setShowNewModal(true)}
          className="rounded-xl font-bold text-sm flex items-center gap-1.5 flex-shrink-0"
          style={{
            background: "var(--primary)",
            color: "var(--background)",
            padding: "10px 14px",
            minHeight: 44,
            marginTop: 8,
            boxShadow: "0 4px 14px rgba(152, 181, 210, 0.25)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Novo
        </button>
      </div>

      {/* Busca */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar exercício..."
        className="w-full rounded-lg px-3 py-2.5 text-sm mb-3"
        style={{
          background: "rgba(237, 238, 239, 0.05)",
          border: "0.5px solid var(--border)",
          color: "var(--text)",
          outline: "none",
        }}
      />

      {/* Filtros por musculo */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {MUSCLE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setMuscleFilter(f.value)}
            className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
            style={{
              minHeight: "auto",
              border: "0.5px solid var(--border-strong)",
              background: muscleFilter === f.value ? "var(--primary)" : "transparent",
              color: muscleFilter === f.value ? "var(--background)" : "var(--muted)",
              fontWeight: muscleFilter === f.value ? 700 : 500,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Resultados */}
      <Eyebrow className="mb-2">
        {loading ? "Exercícios" : `Resultados · ${filtered.parents.length}`}
      </Eyebrow>

      {loading ? (
        <div className="mb-4">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-3 rounded-xl mb-1 animate-pulse"
              style={{ background: "var(--surface)" }}
            >
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0"
                style={{ background: "var(--surface-strong)" }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="h-3 rounded mb-1.5"
                  style={{ background: "var(--surface-strong)", width: `${55 + (i % 4) * 12}%` }}
                />
                <div
                  className="h-2 rounded"
                  style={{ background: "var(--surface-strong)", width: "35%" }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {filtered.parents.length === 0 && (
            <Card className="text-center py-6">
              <div style={{ color: "var(--muted)" }}>Nenhum exercício encontrado</div>
            </Card>
          )}
          <div className="mb-4">
            {filtered.parents.map((ex) => (
              <div key={ex.id}>
                <ExerciseItem
                  exercise={ex}
                  rightSlot={
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingExercise(ex); }}
                      style={{ color: "var(--muted)", minHeight: "auto", padding: "4px 6px", fontSize: "14px" }}
                    >
                      ✎
                    </button>
                  }
                />
                {filtered.variationsByParent[ex.id]?.map((v) => (
                  <ExerciseItem
                    key={v.id}
                    exercise={v}
                    isVariation
                    rightSlot={
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingExercise(v); }}
                        style={{ color: "var(--muted)", minHeight: "auto", padding: "4px 6px", fontSize: "14px" }}
                      >
                        ✎
                      </button>
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Card destacado de criar novo */}
      <button
        onClick={() => setShowNewModal(true)}
        className="w-full rounded-xl text-center cursor-pointer mb-6 tap-feedback"
        style={{
          border: "1px dashed var(--primary)",
          background: "rgba(152, 181, 210, 0.05)",
          padding: 16,
        }}
      >
        <div className="flex items-center justify-center gap-2 font-bold" style={{ color: "var(--primary)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Criar novo exercício
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          ou variação de um existente
        </div>
      </button>

      {/* FAB flutuante — sempre acessível */}
      <button
        onClick={() => setShowNewModal(true)}
        aria-label="Criar novo exercício"
        className="fixed z-30 flex items-center justify-center rounded-full"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 86px)",
          right: 20,
          width: 56,
          height: 56,
          background: "var(--primary)",
          color: "var(--background)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(152, 181, 210, 0.3)",
          cursor: "pointer",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {showNewModal && (
        <NewExerciseModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            loadExercises();
          }}
          existingExercises={exercises.filter((e) => !e.parent_exercise_id)}
        />
      )}

      {editingExercise && (
        <EditExerciseModal
          exercise={editingExercise}
          onClose={() => setEditingExercise(null)}
          onSaved={(updated) => {
            setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditingExercise(null);
          }}
        />
      )}
    </div>
  );
}
