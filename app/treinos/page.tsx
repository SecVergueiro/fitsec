"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Button, Spinner } from "@/components/Button";
import { weekNumber } from "@/lib/utils";
import type { Template, Mesocycle } from "@/lib/database.types";

export default function TreinosPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeMeso, setActiveMeso] = useState<(Mesocycle & { template_name?: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [tplRes, mesoRes] = await Promise.all([
      supabase.from("templates").select("*").order("created_at", { ascending: false }),
      supabase
        .from("mesocycles")
        .select("*, templates(name)")
        .eq("is_active", true)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setTemplates((tplRes.data as Template[]) ?? []);
    if (mesoRes.data) {
      const meso = mesoRes.data as any;
      setActiveMeso({ ...meso, template_name: meso.templates?.name });
    }
    setLoading(false);
  }

  async function setTemplateActive(templateId: string) {
    // Desativa todos os outros
    await supabase.from("templates").update({ is_active: false } as any).neq("id", templateId);
    // Ativa o selecionado
    await supabase.from("templates").update({ is_active: true } as any).eq("id", templateId);
    loadData();
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Planejamento" title="Treinos" />

      {/* Mesociclo ativo */}
      <Eyebrow className="mb-2">Mesociclo ativo</Eyebrow>
      {loading ? (
        <Card className="mb-5 h-24 animate-pulse">{" "}</Card>
      ) : activeMeso ? (
        <Link href="/treinos/mesociclo">
          <Card variant="strong" className="mb-5">
            <div className="flex justify-between items-start mb-2">
              <div className="font-bold">{activeMeso.name}</div>
              <Pill variant="primary">SEM {weekNumber(activeMeso.start_date)}</Pill>
            </div>
            <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
              {activeMeso.template_name} · {activeMeso.total_weeks} semanas
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(237, 238, 239, 0.08)" }}>
              <div
                className="h-full"
                style={{
                  background: "var(--accent)",
                  width: `${Math.min(100, (weekNumber(activeMeso.start_date) / activeMeso.total_weeks) * 100)}%`,
                }}
              />
            </div>
          </Card>
        </Link>
      ) : (
        <Link href="/treinos/mesociclo/novo">
          <Card variant="ghost" className="mb-5 text-center">
            <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>
              + Iniciar mesociclo
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Periodização com fases (acumulação → intensificação → deload)
            </div>
          </Card>
        </Link>
      )}

      {/* Templates */}
      <div className="flex justify-between items-end mb-2">
        <Eyebrow>Templates · {templates.length}</Eyebrow>
        <Link href="/treinos/novo" className="text-xs font-bold" style={{ color: "var(--accent)", minHeight: "auto" }}>
          + Novo
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <Card variant="ghost" className="text-center py-6">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>
            Sem templates ainda
          </div>
          <div className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Crie tua primeira ficha de treino
          </div>
          <Link href="/treinos/novo">
            <Button>Criar template</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <Link key={tpl.id} href={`/treinos/template/${tpl.id}`}>
              <Card className="!p-3 mb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{tpl.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {tpl.split_type ?? "Sem split"} {tpl.description && `· ${tpl.description}`}
                    </div>
                  </div>
                  {tpl.is_active && <Pill variant="primary">ATIVO</Pill>}
                </div>
                {!tpl.is_active && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setTemplateActive(tpl.id);
                    }}
                    className="text-xs font-medium mt-2"
                    style={{ color: "var(--accent)", minHeight: "auto" }}
                  >
                    Ativar →
                  </button>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Atalho pra criar mesociclo */}
      {!loading && templates.length > 0 && !activeMeso && (
        <Link href="/treinos/mesociclo/novo">
          <Card variant="ghost" className="text-center mt-4">
            <div className="font-bold" style={{ color: "var(--primary)" }}>
              + Iniciar mesociclo
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Use um template ativo num bloco com periodização
            </div>
          </Card>
        </Link>
      )}
    </div>
  );
}
