"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, Input, Spinner } from "@/components/Button";
import { WEEKDAY_LABELS } from "@/lib/utils";
import type { Template, TemplateDay } from "@/lib/database.types";

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

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

  async function deleteTemplate() {
    if (!confirm("Excluir esse template? Os mesociclos vinculados serão afetados.")) return;
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
    return <div>Template não encontrado</div>;
  }

  return (
    <div className="fade-in">
      <Link href="/treinos" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Treinos
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

      <button
        onClick={deleteTemplate}
        className="text-xs mt-6 block mx-auto"
        style={{ color: "#ff8888", minHeight: "auto" }}
      >
        Excluir template
      </button>
    </div>
  );
}
