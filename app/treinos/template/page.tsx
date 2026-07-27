"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { offlineInsert, offlineDelete } from "@/lib/offline-writes";
import { offlineRead, offlineReadList } from "@/lib/offline-reads";
import { db as offlineDB } from "@/lib/offline-db";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, EmptyState, Input, Spinner } from "@/components/Button";
import { Select } from "@/components/Select";
import { useConfirm, useToast } from "@/components/Toast";
import { WEEKDAY_LABELS } from "@/lib/utils";
import type { Template, TemplateDay } from "@/lib/database.types";

// Rota estática lendo o id da query — ver comentário em /sessao/ativa.
export default function TemplateDetailRoute() {
  return (
    <Suspense fallback={<div className="flex justify-center py-10"><Spinner /></div>}>
      <TemplateDetailPage />
    </Suspense>
  );
}

function TemplateDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const templateId = searchParams.get("id") ?? "";
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
    const [tplData, daysData] = await Promise.all([
      offlineRead<Template>(
        () => supabase.from("templates").select("*").eq("id", templateId).maybeSingle(),
        async () => (offlineDB ? (await offlineDB.templates.get(templateId)) ?? null : null)
      ),
      offlineReadList<TemplateDay>(
        () => supabase.from("template_days").select("*").eq("template_id", templateId).order("day_order"),
        async () =>
          offlineDB
            ? offlineDB.template_days.where("template_id").equals(templateId).sortBy("day_order")
            : null
      ),
    ]);
    setTemplate(tplData);

    // Conta exercicios em cada dia
    const counts = await Promise.all(
      daysData.map(async (d) => {
        const rows = await offlineReadList<{ id: string }>(
          () => supabase.from("template_exercises").select("id").eq("template_day_id", d.id),
          async () =>
            offlineDB ? offlineDB.template_exercises.where("template_day_id").equals(d.id).toArray() : null
        );
        return { ...d, exercise_count: rows.length };
      })
    );
    setDays(counts);
    setLoading(false);
  }

  async function addDay() {
    if (!newDayName.trim()) return;
    await offlineInsert(
      "template_days",
      {
        template_id: templateId,
        name: newDayName.trim(),
        day_order: days.length + 1,
        weekday: newDayWeekday,
      },
      { localTable: "template_days" }
    );
    setNewDayName("");
    setShowAddDay(false);
    loadData();
  }

  async function duplicateTemplate() {
    if (!template) return;
    const newName = `${template.name} (cópia)`;
    // user_id vem da sessão persistida: auth.getUser() bate na rede e devolve null offline
    const userId = getCurrentUserId();
    const newTpl = await offlineInsert(
      "templates",
      { name: newName, description: template.description, split_type: template.split_type, is_active: false, user_id: userId },
      { localTable: "templates" }
    );

    for (const day of days) {
      const newDay = await offlineInsert(
        "template_days",
        { template_id: newTpl.id, name: day.name, day_order: day.day_order, weekday: day.weekday },
        { localTable: "template_days" }
      );

      const exList = await offlineReadList<any>(
        () => supabase.from("template_exercises").select("*").eq("template_day_id", day.id),
        async () =>
          offlineDB ? offlineDB.template_exercises.where("template_day_id").equals(day.id).toArray() : null
      );

      await Promise.all(
        exList.map((ex) =>
          offlineInsert(
            "template_exercises",
            {
              template_day_id: newDay.id,
              exercise_id: ex.exercise_id,
              exercise_order: ex.exercise_order,
              prescribed_sets: ex.prescribed_sets,
              rep_range_min: ex.rep_range_min,
              rep_range_max: ex.rep_range_max,
              target_rir: ex.target_rir,
              rest_seconds: ex.rest_seconds,
              notes: ex.notes,
            },
            { localTable: "template_exercises" }
          )
        )
      );
    }

    toast.success(`Template duplicado`);
    router.push(`/treinos/template?id=${newTpl.id}`);
  }

  async function deleteTemplate() {
    const ok = await confirm({
      title: "Excluir template?",
      message: "Os mesociclos vinculados serão afetados.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    await offlineDelete("templates", { id: templateId }, { localTable: "templates", localId: templateId });
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
            <Link key={day.id} href={`/treinos/dia?id=${day.id}&template=${templateId}`}>
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
            <Select
              value={String(newDayWeekday)}
              options={WEEKDAY_LABELS.map((label, idx) => ({ value: String(idx), label }))}
              onChange={(v) => setNewDayWeekday(Number(v))}
              title="Dia da semana"
            />
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
