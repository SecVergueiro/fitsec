"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { ExerciseItem } from "@/components/ExerciseItem";
import { MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise } from "@/lib/database.types";
import { NewExerciseModal } from "./NewExerciseModal";

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
      <PageHeader eyebrow="Biblioteca" title="Exercícios" />

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
                <ExerciseItem exercise={ex} />
                {filtered.variationsByParent[ex.id]?.map((v) => (
                  <ExerciseItem key={v.id} exercise={v} isVariation />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Botao de criar novo */}
      <Card
        variant="ghost"
        className="text-center cursor-pointer"
        onClick={() => setShowNewModal(true)}
      >
        <div className="font-bold" style={{ color: "var(--primary)" }}>
          + Criar novo exercício
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          ou variação a partir de um existente
        </div>
      </Card>

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
    </div>
  );
}
