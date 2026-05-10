"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, Spinner } from "@/components/Button";
import { MUSCLE_LABELS } from "@/lib/utils";
import type { Exercise, MuscleGroup, Equipment, Category } from "@/lib/database.types";

const MUSCLES: MuscleGroup[] = [
  "peito", "costas", "ombro", "ombro_anterior", "ombro_posterior",
  "biceps", "triceps", "antebraco", "quadriceps", "posterior", "gluteo",
  "panturrilha", "core", "lombar",
];

const EQUIPMENTS: Equipment[] = ["barra", "halter", "maquina", "cabo", "peso_corporal", "smith"];
const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barra: "Barra", halter: "Halteres", maquina: "Máquina",
  cabo: "Cabo", peso_corporal: "Peso corporal", smith: "Smith",
};

const CATEGORIES: Category[] = ["composto", "isolador"];

interface Props {
  exercise: Exercise;
  onClose: () => void;
  onSaved: (updated: Exercise) => void;
}

export function EditExerciseModal({ exercise, onClose, onSaved }: Props) {
  const [name, setName] = useState(exercise.name);
  const [muscle, setMuscle] = useState<MuscleGroup>(exercise.primary_muscle);
  const [equipment, setEquipment] = useState<Equipment | null>(exercise.equipment);
  const [category, setCategory] = useState<Category>(exercise.category);
  const [notes, setNotes] = useState(exercise.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError("Nome obrigatório"); return; }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("exercises")
      .update({
        name: name.trim(),
        primary_muscle: muscle,
        equipment: equipment ?? null,
        category,
        notes: notes.trim() || null,
      } as any)
      .eq("id", exercise.id)
      .select()
      .single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved(data as Exercise);
  }

  async function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleting(true);
    await supabase.from("exercises").delete().eq("id", exercise.id);
    setDeleting(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl p-5 pb-8"
        style={{ background: "var(--surface)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-bold">Editar exercício</h2>
          <button onClick={onClose} style={{ color: "var(--muted)", minHeight: "auto" }}>✕</button>
        </div>

        {error && (
          <div className="mb-3 text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
            {error}
          </div>
        )}

        {/* Name */}
        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-sm mb-4"
          style={{ background: "var(--surface-strong)", border: "0.5px solid var(--border)", color: "var(--text)", outline: "none" }}
        />

        {/* Muscle */}
        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Músculo principal</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {MUSCLES.map((m) => (
            <button
              key={m}
              onClick={() => setMuscle(m)}
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                minHeight: "auto",
                border: "0.5px solid var(--border-strong)",
                background: muscle === m ? "var(--primary)" : "transparent",
                color: muscle === m ? "var(--background)" : "var(--muted)",
              }}
            >
              {MUSCLE_LABELS[m] ?? m}
            </button>
          ))}
        </div>

        {/* Equipment */}
        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Equipamento</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {EQUIPMENTS.map((eq) => (
            <button
              key={eq}
              onClick={() => setEquipment(equipment === eq ? null : eq)}
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                minHeight: "auto",
                border: "0.5px solid var(--border-strong)",
                background: equipment === eq ? "var(--primary)" : "transparent",
                color: equipment === eq ? "var(--background)" : "var(--muted)",
              }}
            >
              {EQUIPMENT_LABELS[eq]}
            </button>
          ))}
        </div>

        {/* Category */}
        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Categoria</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="text-xs px-2.5 py-1 rounded-full font-medium capitalize"
              style={{
                minHeight: "auto",
                border: "0.5px solid var(--border-strong)",
                background: category === cat ? "var(--primary)" : "transparent",
                color: category === cat ? "var(--background)" : "var(--muted)",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Notes / Tips */}
        <label className="block text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Dicas de execução</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Ex: manter cotovelos próximos ao corpo..."
          className="w-full rounded-lg px-3 py-2.5 text-sm mb-5 resize-none"
          style={{ background: "var(--surface-strong)", border: "0.5px solid var(--border)", color: "var(--text)", outline: "none" }}
        />

        <Button fullWidth onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size={16} /> : "Salvar alterações"}
        </Button>

        {exercise.is_custom && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs mt-4 block mx-auto"
            style={{ color: deleteConfirm ? "#ef4444" : "var(--muted)", minHeight: "auto" }}
          >
            {deleting ? "Excluindo..." : deleteConfirm ? "Confirmar exclusão" : "Excluir exercício"}
          </button>
        )}
      </div>
    </div>
  );
}
