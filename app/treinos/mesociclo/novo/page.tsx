"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { Button, Input } from "@/components/Button";
import type { Template } from "@/lib/database.types";

export default function NovoMesociclo() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("Bloco 1");
  const [templateId, setTemplateId] = useState<string>("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalWeeks, setTotalWeeks] = useState("8");
  const [deloadWeek, setDeloadWeek] = useState("8");
  const [goal, setGoal] = useState("recomposição");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("templates")
      .select("*")
      .order("is_active", { ascending: false })
      .then(({ data }) => {
        const tpls = (data as Template[]) ?? [];
        setTemplates(tpls);
        if (tpls.length > 0) setTemplateId(tpls[0].id);
      });
  }, []);

  async function save() {
    if (!templateId) {
      setError("Selecione um template");
      return;
    }
    setSaving(true);
    setError(null);

    // Desativa outros mesociclos
    await supabase.from("mesocycles").update({ is_active: false } as any).eq("is_active", true);

    const { data, error: err } = await supabase
      .from("mesocycles")
      .insert({
        template_id: templateId,
        name: name.trim(),
        start_date: startDate,
        total_weeks: parseInt(totalWeeks),
        deload_week: deloadWeek ? parseInt(deloadWeek) : null,
        goal: goal.trim() || null,
        is_active: true,
      } as any)
      .select()
      .single();

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/treinos/mesociclo");
  }

  return (
    <div className="fade-in">
      <Link href="/treinos" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Fichas
      </Link>
      <PageHeader eyebrow="Novo bloco" title="Iniciar mesociclo" />

      {templates.length === 0 ? (
        <Card variant="ghost" className="text-center py-6">
          <div className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Você precisa de pelo menos um template
          </div>
          <Link href="/treinos/novo">
            <Button>Criar template</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
              Nome do bloco
            </label>
            <Input value={name} onChange={setName} placeholder="Ex: Bloco 1 — Recomp" />
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
              Template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm"
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                color: "var(--text)",
                outline: "none",
                minHeight: "44px",
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
              Início
            </label>
            <Input value={startDate} onChange={setStartDate} type="date" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
                Total semanas
              </label>
              <Input value={totalWeeks} onChange={setTotalWeeks} type="number" inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
                Semana deload
              </label>
              <Input value={deloadWeek} onChange={setDeloadWeek} type="number" inputMode="numeric" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
              Objetivo
            </label>
            <Input value={goal} onChange={setGoal} placeholder="recomposição, hipertrofia, força..." />
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(255, 80, 80, 0.1)", color: "#ff8888" }}>
              {error}
            </div>
          )}

          <Button onClick={save} disabled={saving} fullWidth>
            {saving ? "Iniciando..." : "Iniciar mesociclo"}
          </Button>
        </div>
      )}
    </div>
  );
}
