"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { Button, EmptyState, Input, Spinner } from "@/components/Button";
import { useConfirm } from "@/components/Toast";
import { ExerciseItem } from "@/components/ExerciseItem";
import { SortableList, DragHandle } from "@/components/SortableList";
import { WEEKDAY_LABELS } from "@/lib/utils";
import type { Exercise, TemplateDay, TemplateExercise } from "@/lib/database.types";

interface ExerciseWithDetails extends TemplateExercise {
  exercise: Exercise;
}

export default function DiaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;
  const dayId = params.dayId as string;
  const confirm = useConfirm();

  const [day, setDay] = useState<TemplateDay | null>(null);
  const [exercises, setExercises] = useState<ExerciseWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState<ExerciseWithDetails | null>(null);

  useEffect(() => {
    loadData();
  }, [dayId]);

  async function loadData() {
    setLoading(true);
    const [dayRes, exRes] = await Promise.all([
      supabase.from("template_days").select("*").eq("id", dayId).single(),
      supabase
        .from("template_exercises")
        .select("*, exercise:exercises(*)")
        .eq("template_day_id", dayId)
        .order("exercise_order"),
    ]);
    setDay(dayRes.data as TemplateDay);
    setExercises((exRes.data as ExerciseWithDetails[]) ?? []);
    setLoading(false);
  }

  async function reorderExercises(orderedIds: string[]) {
    // Reordena localmente
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const reordered = orderedIds.map((id, idx) => ({ ...byId.get(id)!, exercise_order: idx + 1 }));
    setExercises(reordered);

    // Persiste no banco em paralelo
    await Promise.all(
      reordered.map((e) =>
        supabase.from("template_exercises").update({ exercise_order: e.exercise_order } as any).eq("id", e.id)
      )
    );
  }

  async function deleteExercise(id: string) {
    const ok = await confirm({
      title: "Remover exercício?",
      confirmLabel: "Remover",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("template_exercises").delete().eq("id", id);
    loadData();
  }

  async function deleteDay() {
    const ok = await confirm({
      title: "Excluir esse dia?",
      message: "Todos os exercícios do dia serão removidos.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("template_days").delete().eq("id", dayId);
    router.push(`/treinos/template/${templateId}`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!day) {
    return (
      <div className="fade-in">
        <Link
          href={`/treinos/template/${templateId}`}
          className="text-xs font-medium block mb-4"
          style={{ color: "var(--muted)", minHeight: "auto" }}
        >
          ← Template
        </Link>
        <EmptyState
          title="Dia não encontrado"
          description="Esse dia de treino não existe ou foi removido."
          action={
            <Link href={`/treinos/template/${templateId}`}>
              <Button size="sm" variant="secondary">
                Voltar para o template
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Link
        href={`/treinos/template/${templateId}`}
        className="text-xs font-medium block mb-3"
        style={{ color: "var(--muted)", minHeight: "auto" }}
      >
        ← Template
      </Link>
      <div className="mb-5">
        <Eyebrow>{day.weekday !== null ? WEEKDAY_LABELS[day.weekday] : "Sem dia fixo"}</Eyebrow>
        <h1 className="text-2xl mt-1">{day.name}</h1>
      </div>

      <Eyebrow className="mb-2">Exercícios · {exercises.length}</Eyebrow>

      {exercises.length === 0 ? (
        <Card variant="ghost" className="text-center py-5 mb-3">
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Sem exercícios ainda
          </div>
        </Card>
      ) : (
        <div className="space-y-2 mb-3">
          <div className="text-xs mb-2" style={{ color: "var(--faint)" }}>
            Arraste pelo ícone <span style={{ color: "var(--muted)" }}>⋮⋮</span> para reordenar
          </div>
          <SortableList items={exercises} onReorder={reorderExercises}>
            {(ex, handle) => {
              const idx = exercises.findIndex((e) => e.id === ex.id);
              return (
                <Card className="!p-3 mb-2">
                  <div className="flex items-start gap-2">
                    <DragHandle {...handle} />
                    <div
                      className="rounded-md flex items-center justify-center font-bold flex-shrink-0"
                      style={{
                        width: "28px",
                        height: "28px",
                        background: "rgba(152, 181, 210, 0.1)",
                        color: "var(--primary)",
                        fontSize: "13px",
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{ex.exercise.name}</div>
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        <Pill variant="soft">
                          {ex.prescribed_sets} × {ex.rep_range_min}-{ex.rep_range_max}
                        </Pill>
                        <Pill variant="soft">RIR {ex.target_rir}</Pill>
                        <Pill variant="ghost">{ex.rest_seconds}s</Pill>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditing(ex)}
                        className="text-xs"
                        style={{ color: "var(--accent)", minHeight: "auto", padding: "4px 8px" }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deleteExercise(ex.id)}
                        className="text-xs"
                        style={{ color: "#ff8888", minHeight: "auto", padding: "4px 8px" }}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </Card>
              );
            }}
          </SortableList>
        </div>
      )}

      <Card variant="ghost" className="text-center cursor-pointer mb-3" onClick={() => setShowPicker(true)}>
        <div className="font-bold" style={{ color: "var(--primary)" }}>
          + Adicionar exercício
        </div>
      </Card>

      <button onClick={deleteDay} className="text-xs mt-6 block mx-auto" style={{ color: "#ff8888", minHeight: "auto" }}>
        Excluir dia
      </button>

      {showPicker && (
        <ExercisePickerModal
          dayId={dayId}
          existingOrder={exercises.length}
          onClose={() => setShowPicker(false)}
          onAdded={() => {
            setShowPicker(false);
            loadData();
          }}
        />
      )}

      {editing && (
        <EditPrescriptionModal
          templateExercise={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ===========================================================
// Modal de adicionar exercicio
// ===========================================================
function ExercisePickerModal({
  dayId,
  existingOrder,
  onClose,
  onAdded,
}: {
  dayId: string;
  existingOrder: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [sets, setSets] = useState("3");
  const [repMin, setRepMin] = useState("8");
  const [repMax, setRepMax] = useState("12");
  const [rir, setRir] = useState("2");
  const [rest, setRest] = useState("90");
  const [saving, setSaving] = useState(false);

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

  async function save() {
    if (!selected) return;
    setSaving(true);
    await supabase.from("template_exercises").insert({
      template_day_id: dayId,
      exercise_id: selected.id,
      exercise_order: existingOrder + 1,
      prescribed_sets: parseInt(sets) || 3,
      rep_range_min: parseInt(repMin) || 8,
      rep_range_max: parseInt(repMax) || 12,
      target_rir: parseInt(rir) || 2,
      rest_seconds: parseInt(rest) || 90,
    } as any);
    setSaving(false);
    onAdded();
  }

  return (
    <ModalShell onClose={onClose} title={selected ? "Configurar prescrição" : "Adicionar exercício"}>
      {!selected ? (
        <>
          <Input value={search} onChange={setSearch} placeholder="Buscar..." autoFocus />
          <div className="mt-3 max-h-80 overflow-auto -mx-1">
            {filtered.map((ex) => (
              <div key={ex.id} onClick={() => setSelected(ex)} className="cursor-pointer">
                <ExerciseItem exercise={ex} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium">{selected.name}</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Séries">
              <Input value={sets} onChange={setSets} type="number" inputMode="numeric" />
            </Field>
            <Field label="Rep min">
              <Input value={repMin} onChange={setRepMin} type="number" inputMode="numeric" />
            </Field>
            <Field label="Rep max">
              <Input value={repMax} onChange={setRepMax} type="number" inputMode="numeric" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="RIR alvo">
              <Input value={rir} onChange={setRir} type="number" inputMode="numeric" />
            </Field>
            <Field label="Descanso (s)">
              <Input value={rest} onChange={setRest} type="number" inputMode="numeric" />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} fullWidth>
              {saving ? "Salvando..." : "Adicionar"}
            </Button>
            <Button onClick={() => setSelected(null)} variant="ghost" fullWidth>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ===========================================================
// Modal de edicao de prescricao
// ===========================================================
function EditPrescriptionModal({
  templateExercise,
  onClose,
  onSaved,
}: {
  templateExercise: ExerciseWithDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sets, setSets] = useState(String(templateExercise.prescribed_sets));
  const [repMin, setRepMin] = useState(String(templateExercise.rep_range_min));
  const [repMax, setRepMax] = useState(String(templateExercise.rep_range_max));
  const [rir, setRir] = useState(String(templateExercise.target_rir));
  const [rest, setRest] = useState(String(templateExercise.rest_seconds));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase
      .from("template_exercises")
      .update({
        prescribed_sets: parseInt(sets),
        rep_range_min: parseInt(repMin),
        rep_range_max: parseInt(repMax),
        target_rir: parseInt(rir),
        rest_seconds: parseInt(rest),
      } as any)
      .eq("id", templateExercise.id);
    setSaving(false);
    onSaved();
  }

  return (
    <ModalShell onClose={onClose} title="Editar prescrição">
      <div className="space-y-3">
        <div className="text-sm font-medium">{templateExercise.exercise.name}</div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Séries">
            <Input value={sets} onChange={setSets} type="number" inputMode="numeric" />
          </Field>
          <Field label="Rep min">
            <Input value={repMin} onChange={setRepMin} type="number" inputMode="numeric" />
          </Field>
          <Field label="Rep max">
            <Input value={repMax} onChange={setRepMax} type="number" inputMode="numeric" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="RIR alvo">
            <Input value={rir} onChange={setRir} type="number" inputMode="numeric" />
          </Field>
          <Field label="Descanso (s)">
            <Input value={rest} onChange={setRest} type="number" inputMode="numeric" />
          </Field>
        </div>
        <Button onClick={save} disabled={saving} fullWidth>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </ModalShell>
  );
}

// ===========================================================
// Modal Shell reutilizavel
// ===========================================================
function ModalShell({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
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
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none p-1"
            style={{ color: "var(--muted)", minHeight: "auto" }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
