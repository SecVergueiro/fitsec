"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { Button, Input } from "@/components/Button";
import Link from "next/link";

// Template UL+PPL pre-construido (baseado no treino que a gente conversou)
const UL_PPL_PRESET = {
  name: "UL+PPL Recomposição",
  description: "5 dias/sem · Upper, Lower, Push, Pull, Legs",
  split_type: "UL+PPL",
  days: [
    {
      name: "Upper",
      day_order: 1,
      weekday: 1, // segunda
      exercises: [
        { name: "Supino reto com barra", sets: 4, reps: [6, 8], rir: 2, rest: 180 },
        { name: "Remada curvada com barra", sets: 4, reps: [6, 8], rir: 2, rest: 180 },
        { name: "Desenvolvimento militar com barra", sets: 3, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Puxada alta na polia", sets: 3, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Elevação lateral com halteres", sets: 3, reps: [12, 15], rir: 1, rest: 75 },
        { name: "Rosca direta com barra W", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Tríceps na polia (corda)", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
      ],
    },
    {
      name: "Lower",
      day_order: 2,
      weekday: 2, // terça
      exercises: [
        { name: "Agachamento livre", sets: 4, reps: [6, 8], rir: 2, rest: 180 },
        { name: "Leg press 45°", sets: 3, reps: [10, 12], rir: 2, rest: 120 },
        { name: "Stiff", sets: 3, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Cadeira extensora", sets: 3, reps: [12, 15], rir: 1, rest: 75 },
        { name: "Mesa flexora", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Panturrilha em pé", sets: 4, reps: [12, 15], rir: 1, rest: 60 },
        { name: "Abdominal infra (elevação de pernas)", sets: 3, reps: [12, 15], rir: 1, rest: 60 },
      ],
    },
    {
      name: "Push",
      day_order: 3,
      weekday: 3, // quarta
      exercises: [
        { name: "Supino inclinado com halteres", sets: 4, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Crucifixo na máquina (peck deck)", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Desenvolvimento Arnold", sets: 3, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Elevação lateral na polia", sets: 4, reps: [12, 15], rir: 1, rest: 75 },
        { name: "Tríceps testa", sets: 3, reps: [8, 10], rir: 2, rest: 90 },
        { name: "Tríceps francês", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
      ],
    },
    {
      name: "Pull",
      day_order: 4,
      weekday: 4, // quinta
      exercises: [
        { name: "Barra fixa", sets: 4, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Remada cavalinho (T-bar)", sets: 3, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Pulldown pegada neutra", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Crucifixo invertido (peck deck inverso)", sets: 3, reps: [12, 15], rir: 1, rest: 75 },
        { name: "Rosca alternada com halter", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Rosca martelo", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
      ],
    },
    {
      name: "Legs",
      day_order: 5,
      weekday: 5, // sexta
      exercises: [
        { name: "Levantamento terra romeno (RDL)", sets: 4, reps: [8, 10], rir: 2, rest: 120 },
        { name: "Hack squat", sets: 3, reps: [10, 12], rir: 2, rest: 120 },
        { name: "Cadeira flexora sentada", sets: 4, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Avanço (afundo) com halteres", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Elevação pélvica (hip thrust)", sets: 3, reps: [10, 12], rir: 1, rest: 90 },
        { name: "Panturrilha sentado", sets: 4, reps: [15, 20], rir: 1, rest: 60 },
        { name: "Prancha abdominal", sets: 3, reps: [30, 60], rir: 1, rest: 60 },
      ],
    },
  ],
};

export default function NovoTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [splitType, setSplitType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBlank() {
    if (!name.trim()) {
      setError("Dá um nome pro template");
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("templates")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        split_type: splitType.trim() || null,
        is_active: false,
      } as any)
      .select()
      .single();

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push(`/treinos/template/${(data as any).id}`);
  }

  async function importPreset() {
    setSaving(true);
    setError(null);

    try {
      // 1. Cria template
      const { data: tpl, error: tplErr } = await supabase
        .from("templates")
        .insert({
          name: UL_PPL_PRESET.name,
          description: UL_PPL_PRESET.description,
          split_type: UL_PPL_PRESET.split_type,
          is_active: true,
        } as any)
        .select()
        .single();
      if (tplErr) throw tplErr;
      const templateId = (tpl as any).id;

      // 2. Busca todos os exercicios pelo nome (precisamos dos IDs)
      const allExerciseNames = UL_PPL_PRESET.days.flatMap((d) => d.exercises.map((e) => e.name));
      const { data: exercises } = await supabase
        .from("exercises")
        .select("id, name")
        .in("name", allExerciseNames);

      const exerciseMap = new Map<string, string>();
      (exercises as any[])?.forEach((e) => exerciseMap.set(e.name, e.id));

      // 3. Cria os dias e exercicios
      for (const day of UL_PPL_PRESET.days) {
        const { data: dayData, error: dayErr } = await supabase
          .from("template_days")
          .insert({
            template_id: templateId,
            name: day.name,
            day_order: day.day_order,
            weekday: day.weekday,
          } as any)
          .select()
          .single();
        if (dayErr) throw dayErr;
        const dayId = (dayData as any).id;

        const dayExercises = day.exercises
          .map((ex, idx) => {
            const exId = exerciseMap.get(ex.name);
            if (!exId) {
              console.warn(`Exercício não encontrado: ${ex.name}`);
              return null;
            }
            return {
              template_day_id: dayId,
              exercise_id: exId,
              exercise_order: idx + 1,
              prescribed_sets: ex.sets,
              rep_range_min: ex.reps[0],
              rep_range_max: ex.reps[1],
              target_rir: ex.rir,
              rest_seconds: ex.rest,
            };
          })
          .filter(Boolean);

        if (dayExercises.length > 0) {
          await supabase.from("template_exercises").insert(dayExercises as any);
        }
      }

      router.push(`/treinos/template/${templateId}`);
    } catch (e: any) {
      setError(e.message ?? "Erro ao importar");
      setSaving(false);
    }
  }

  return (
    <div className="fade-in">
      <Link href="/treinos" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Voltar
      </Link>
      <PageHeader eyebrow="Novo template" title="Criar ficha" />

      {/* Atalho UL+PPL */}
      <Card variant="strong" className="mb-5">
        <div className="flex justify-between items-start mb-1">
          <div>
            <div className="font-bold text-sm">UL+PPL · Recomposição</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              5 dias · 5 dias da ficha pronta com séries/reps
            </div>
          </div>
        </div>
        <Button onClick={importPreset} disabled={saving} fullWidth size="sm" className="mt-3">
          {saving ? "Importando..." : "Importar pronto →"}
        </Button>
      </Card>

      <Eyebrow className="mb-3">Ou criar do zero</Eyebrow>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Nome
          </label>
          <Input value={name} onChange={setName} placeholder="Ex: PPL custom" autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Tipo de split
          </label>
          <Input value={splitType} onChange={setSplitType} placeholder="Ex: ABC, PPL, UL+PPL, Full Body" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
            Descrição (opcional)
          </label>
          <Input value={description} onChange={setDescription} placeholder="Foco, frequência, objetivo..." />
        </div>

        {error && (
          <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(255, 80, 80, 0.1)", color: "#ff8888" }}>
            {error}
          </div>
        )}

        <Button onClick={createBlank} disabled={saving} fullWidth>
          {saving ? "Criando..." : "Criar template"}
        </Button>
      </div>
    </div>
  );
}
