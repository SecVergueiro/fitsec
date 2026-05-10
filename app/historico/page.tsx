"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { Spinner } from "@/components/Button";
import { fmtDuration } from "@/lib/utils";
import type { WorkoutSession } from "@/lib/database.types";

interface SessionWithDay extends WorkoutSession {
  day_name?: string;
}

interface MonthGroup {
  label: string;
  sessions: SessionWithDay[];
}

export default function HistoricoPage() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<MonthGroup[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("workout_sessions")
      .select("*, template_days(name)")
      .not("completed_at", "is", null)
      .order("session_date", { ascending: false });

    const sessions: SessionWithDay[] = ((data as any[]) ?? []).map((s) => ({
      ...s,
      day_name: s.template_days?.name ?? null,
    }));

    // Agrupa por mês
    const map: Record<string, SessionWithDay[]> = {};
    sessions.forEach((s) => {
      const d = new Date(s.session_date + "T12:00:00");
      const key = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });

    setGroups(Object.entries(map).map(([label, sessions]) => ({ label, sessions })));
    setLoading(false);
  }

  const totalSessions = groups.reduce((sum, g) => sum + g.sessions.length, 0);

  return (
    <div className="fade-in">
      <Link href="/sessao" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Sessão
      </Link>
      <PageHeader
        eyebrow="Histórico"
        title={`${totalSessions} treinos`}
        subtitle={loading ? undefined : "Todos os treinos concluídos"}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <Card variant="ghost" className="text-center py-10">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>Nenhum treino ainda</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>Complete sua primeira sessão para aparecer aqui</div>
        </Card>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="mb-5">
            <Eyebrow className="mb-2 capitalize">{group.label}</Eyebrow>
            <Card className="!p-0">
              {group.sessions.map((s, idx) => {
                const date = new Date(s.session_date + "T12:00:00");
                const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" });
                const day = date.getDate();
                return (
                  <Link key={s.id} href={`/sessao/${s.id}/resumo`}>
                    <div
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: idx < group.sessions.length - 1 ? "0.5px solid var(--border)" : "none" }}
                    >
                      {/* Data */}
                      <div
                        className="flex-shrink-0 flex flex-col items-center justify-center rounded-lg"
                        style={{ width: "40px", height: "44px", background: "var(--surface-strong)" }}
                      >
                        <div className="text-xs font-medium capitalize" style={{ color: "var(--muted)" }}>{weekday}</div>
                        <div className="text-lg font-bold tabular leading-none">{day}</div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {s.day_name ?? "Treino livre"}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                          {s.duration_minutes ? fmtDuration(s.duration_minutes) : "—"}
                          {s.energy_level ? ` · energia ${s.energy_level}/5` : ""}
                        </div>
                      </div>

                      {/* Seta */}
                      <div className="text-xs flex-shrink-0" style={{ color: "var(--accent)" }}>→</div>
                    </div>
                  </Link>
                );
              })}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
