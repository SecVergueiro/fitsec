"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, EmptyState, Input, Spinner } from "@/components/Button";
import { useConfirm, useToast } from "@/components/Toast";
import { WEEKDAY_LABELS } from "@/lib/utils";
import type { Template, TemplateDay } from "@/lib/database.types";

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;
  const confirm = useConfirm();
  const toast = useToast();

  const [template, setTemplate] = useState<Template | null>(null);
  const [days, setDays] = useState<(TemplateDay & { exercise_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayName, setNewDayName] = useState("");
  const [newDayWeekday, setNewDayWeekday] = useState<number>(1);

  useEffect(() => {
    loadData();
  }, [templateId]);

  async function loadData() {
    setLoading(true);
    const [tplRes, daysRes] = await Promise.all([
      supabase.from("templates").select("*").eq("id", templateId).single(),
      supabase.from("template_days").select("*").eq("template_id", templateId).order("day_order"),
    ]);
    setTemplate(tplRes.data as Template);

    const daysData = (daysRes.data as TemplateDay[]) ?? [];
    // Conta exercicios em cada dia
    const counts = await Promise.all(
      daysData.map(async (d) => {
        const { count } = await supabase
          .from("template_exercises")
          .select("*", { count: "exact", head: true })
          .eq("template_day_id", d.id);
        return { ...d, exercise_count: count ?? 0 };
      })
    );
    setDays(counts);
    setLoading(false);
  }

  async function addDay() {
    if (!newDayName.trim()) return;
    await supabase.from("template_days").insert({
      template_id: templateId,
      name: newDayName.trim(),
      day_order: days.length + 1,
      weekday: newDayWeekday,
    } as any);
    setNewDayName("");
    setShowAddDay(false);
    loadData();
  }

  async function duplicateTemplate() {
    if (!template) return;
    const newName = `${template.name} (cópia)`;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newTpl, error } = await supabase
      .from("templates")
      .insert({ name: newName, description: template.description, split_type: template.split_type, is_active: false, user_id: user?.id } as any)
      .select()
      .single();
    if (error || !newTpl) { toast.error("Erro ao duplicar template"); return; }

    for (const day of days) {
      const { data: newDay } = await supabase
        .from("template_days")
        .insert({ template_id: (newTpl as any).id, name: day.name, day_order: day.day_order, weekday: day.weekday } as any)
        .select()
        .single();
      if (!newDay) continue;

      const { data: exList } = await supabase
        .from("template_exercises")
        .select("*")
        .eq("template_day_id", day.id);
      if (exList && exList.length > 0) {
        await supabase.from("template_exercises").insert(
          (exList as any[]).map((ex) => ({
            template_day_id: (newDay as any).id,
            exercise_id: ex.exercise_id,
            exercise_order: ex.exercise_order,
            prescribed_sets: ex.prescribed_sets,
            rep_range_min: ex.rep_range_min,
            rep_range_max: ex.rep_range_max,
            target_rir: ex.target_rir,
            rest_seconds: ex.rest_seconds,
            notes: ex.notes,
          }))
        );
      }
    }

    toast.success(`Template duplicado`);
    router.push(`/treinos/template/${(newTpl as any).id}`);
  }

  async function deleteTemplate() {
    const ok = await confirm({
      title: "Excluir template?",
      message: "Os mesociclos vinculados serão afetados.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("templates").delete().eq("id", templateId);
    router.push("/treinos");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="fade-in">
        <Link
          href="/treinos"
          className="text-xs font-medium block mb-4"
          style={{ color: "var(--muted)", minHeight: "auto" }}
        >
          ← Fichas
        </Link>
        <EmptyState
          title="Template não encontrado"
          description="Esse template não existe ou foi removido."
          action={
            <Link href="/treinos">
              <Button size="sm" variant="secondary">
                Voltar para treinos
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <Link href="/treinos" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Fichas
      </Link>
      <div className="flex justify-between items-start mb-5">
        <div>
          <Eyebrow>Template</Eyebrow>
          <h1 className="text-2xl mt-1">{template.name}</h1>
          {template.description && (
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {template.description}
            </p>
          )}
        </div>
        {template.is_active && <Pill variant="primary">ATIVO</Pill>}
      </div>

      <Eyebrow className="mb-2">Dias · {days.length}</Eyebrow>

      {days.length === 0 ? (
        <Card variant="ghost" className="text-center py-6 mb-3">
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Nenhum dia cadastrado ainda
          </div>
        </Card>
      ) : (
        <div className="space-y-2 mb-3">
          {days.map((day) => (
            <Link key={day.id} href={`/treinos/template/${templateId}/dia/${day.id}`}>
              <Card className="!p-3 mb-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-sm">{day.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {day.weekday !== null ? WEEKDAY_LABELS[day.weekday] : "Sem dia fixo"} · {day.exercise_count} exercícios
                    </div>
                  </div>
                  <div className="text-xs" style={{ color: "var(--accent)" }}>
                    →
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {showAddDay ? (
        <Card className="mb-3">
          <div className="space-y-2">
            <Input value={newDayName} onChange={setNewDayName} placeholder="Nome do dia (Upper, Push...)" autoFocus />
            <select
              value={newDayWeekday}
              onChange={(e) => setNewDayWeekday(Number(e.target.value))}
              className="w-full rounded-lg px-3 py-2.5 text-sm"
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                color: "var(--text)",
                outline: "none",
                minHeight: "44px",
              }}
            >
              <option value="">Sem dia fixo</option>
              {WEEKDAY_LABELS.map((label, idx) => (
                <option key={idx} value={idx}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button onClick={addDay} fullWidth>
                Adicionar
              </Button>
              <Button onClick={() => setShowAddDay(false)} variant="ghost" fullWidth>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="ghost" className="text-center cursor-pointer mb-3" onClick={() => setShowAddDay(true)}>
          <div className="font-bold" style={{ color: "var(--primary)" }}>
            + Adicionar dia
          </div>
        </Card>
      )}

      <div className="flex flex-col items-center gap-3 mt-6">
        <button
          onClick={duplicateTemplate}
          className="text-xs font-medium"
          style={{ color: "var(--muted)", minHeight: "auto" }}
        >
          Duplicar template
        </button>
        <button
          onClick={deleteTemplate}
          className="text-xs"
          style={{ color: "#ff8888", minHeight: "auto" }}
        >
          Excluir template
        </button>
      </div>
    </div>
  );
}
