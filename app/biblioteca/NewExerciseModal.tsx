"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow } from "@/components/ui";
import { MUSCLE_LABELS, EQUIPMENT_LABELS } from "@/lib/utils";
import type { Exercise, MuscleGroup, Equipment, Category } from "@/lib/database.types";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  existingExercises: Exercise[];
}

const MUSCLES: MuscleGroup[] = [
  "peito",
  "costas",
  "ombro",
  "ombro_posterior",
  "biceps",
  "triceps",
  "antebraco",
  "quadriceps",
  "posterior",
  "gluteo",
  "panturrilha",
  "core",
];

const EQUIPMENTS: Equipment[] = ["barra", "halter", "maquina", "cabo", "peso_corporal", "smith"];

export function NewExerciseModal({ onClose, onCreated, existingExercises }: Props) {
  const [name, setName] = useState("");
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>("peito");
  const [equipment, setEquipment] = useState<Equipment>("barra");
  const [category, setCategory] = useState<Category>("composto");
  const [parentId, setParentId] = useState<string>("");
  const [variationLabel, setVariationLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Dá um nome pro exercício");
      return;
    }
    setError(null);
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const payload: Partial<Exercise> = {
      name: name.trim(),
      primary_muscle: primaryMuscle,
      equipment,
      category,
      is_custom: true,
      parent_exercise_id: parentId || null,
      variation_label: parentId ? variationLabel.trim() || null : null,
      secondary_muscles: [],
      user_id: user?.id,
    } as any;

    const { error: err } = await supabase.from("exercises").insert(payload);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onCreated();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(4, 6, 7, 0.7)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 slide-up"
        style={{
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          maxHeight: "90vh",
          overflow: "auto",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <Eyebrow>Novo</Eyebrow>
            <h2 className="text-xl mt-1">Criar exercício</h2>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none p-1"
            style={{ color: "var(--muted)", minHeight: "auto" }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Nome">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Supino inclinado smith"
              className="w-full"
              style={inputStyle}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Músculo">
              <select
                value={primaryMuscle}
                onChange={(e) => setPrimaryMuscle(e.target.value as MuscleGroup)}
                style={inputStyle}
                className="w-full"
              >
                {MUSCLES.map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipamento">
              <select
                value={equipment}
                onChange={(e) => setEquipment(e.target.value as Equipment)}
                style={inputStyle}
                className="w-full"
              >
                {EQUIPMENTS.map((eq) => (
                  <option key={eq} value={eq}>
                    {EQUIPMENT_LABELS[eq]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Tipo">
            <div className="flex gap-2">
              {(["composto", "isolador"] as Category[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium capitalize"
                  style={{
                    background: category === c ? "var(--primary)" : "var(--surface)",
                    color: category === c ? "var(--background)" : "var(--muted)",
                    border: "0.5px solid var(--border)",
                    minHeight: "auto",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          <Field label="É uma variação? (opcional)">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              style={inputStyle}
              className="w-full"
            >
              <option value="">Não, é exercício novo</option>
              {existingExercises
                .filter((e) => e.primary_muscle === primaryMuscle)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    Variação de: {e.name}
                  </option>
                ))}
            </select>
          </Field>

          {parentId && (
            <Field label="Rótulo da variação (opcional)">
              <input
                type="text"
                value={variationLabel}
                onChange={(e) => setVariationLabel(e.target.value)}
                placeholder="Ex: smith, pegada fechada, unilateral"
                style={inputStyle}
                className="w-full"
              />
            </Field>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(255, 80, 80, 0.1)", color: "#ff8888" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-lg font-bold text-sm mt-2"
            style={{
              background: "var(--primary)",
              color: "var(--background)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Salvando..." : "Criar exercício"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "0.5px solid var(--border)",
  borderRadius: "8px",
  padding: "10px 12px",
  fontSize: "14px",
  color: "var(--text)",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
