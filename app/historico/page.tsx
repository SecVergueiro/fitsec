"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, Eyebrow, PageHeader, Pill } from "@/components/ui";
import { Spinner } from "@/components/Button";
import { useConfirm } from "@/components/Toast";
import { estimate1RM, fmtDuration, fmtTonnage } from "@/lib/utils";
import { offlineRead } from "@/lib/offline-reads";
import { db as offlineDB } from "@/lib/offline-db";
import type { WorkoutSession } from "@/lib/database.types";

interface SessionWithDay extends WorkoutSession {
  day_name?: string;
  tonnage?: number;
  setCount?: number;
  hasPR?: boolean;
  failureCount?: number;
}

interface MonthGroup {
  label: string;
  sessions: SessionWithDay[];
}

type ViewMode = "list" | "calendar";
type Period = "all" | "30d" | "90d";

export default function HistoricoPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionWithDay[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [period, setPeriod] = useState<Period>("all");
  const [onlyPRs, setOnlyPRs] = useState(false);
  const confirm = useConfirm();

  async function deleteSession(id: string) {
    const ok = await confirm({
      title: "Apagar treino?",
      message: "Todas as séries registradas serão removidas permanentemente.",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    await supabase.from("session_sets").delete().eq("session_id", id);
    await supabase.from("session_exercises").delete().eq("session_id", id);
    await supabase.from("workout_sessions").delete().eq("id", id);
    load();
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await offlineRead<any[]>(
      () => supabase.from("workout_sessions").select("*, template_days(name)").not("completed_at", "is", null).order("session_date", { ascending: false }),
      async () => {
        if (!offlineDB) return [];
        const all = await offlineDB.workout_sessions.filter((s) => s.completed_at != null).toArray();
        all.sort((a, b) => b.session_date.localeCompare(a.session_date));
        return Promise.all(all.map(async (s) => {
          if (!s.template_day_id) return { ...s, template_days: null };
          const d = await offlineDB.template_days.get(s.template_day_id);
          return { ...s, template_days: d ? { name: d.name } : null };
        }));
      }
    );

    const baseList: SessionWithDay[] = ((data as any[]) ?? []).map((s) => ({
      ...s,
      day_name: s.template_days?.name ?? null,
    }));

    if (baseList.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }

    // Volume + séries por sessão (uma query agregada)
    const ids = baseList.map((s) => s.id);
    const allSets = await offlineRead<any[]>(
      () => supabase.from("session_sets").select("session_id, exercise_id, weight_kg, reps, is_warmup, performed_at").in("session_id", ids),
      async () => {
        if (!offlineDB) return [];
        return offlineDB.session_sets.where("session_id").anyOf(ids).toArray();
      }
    );

    const setMap: Record<string, { tonnage: number; setCount: number; failureCount: number; sets: any[] }> = {};
    (allSets as any[])?.forEach((s) => {
      if (!setMap[s.session_id]) setMap[s.session_id] = { tonnage: 0, setCount: 0, failureCount: 0, sets: [] };
      setMap[s.session_id].sets.push(s);
      if (!s.is_warmup) {
        setMap[s.session_id].tonnage += s.weight_kg * s.reps;
        setMap[s.session_id].setCount += 1;
        if (s.is_failure) setMap[s.session_id].failureCount += 1;
      }
    });

    // PRs por sessão — calcula o e1RM da sessão e compara com o melhor anterior por exercício
    // Para performance: agrupa por exercício e percorre cronologicamente
    const allWorkingSets = (allSets as any[])?.filter((s) => !s.is_warmup) ?? [];
    const byExercise: Record<string, { date: string; sessionId: string; e1rm: number }[]> = {};
    allWorkingSets.forEach((s) => {
      if (!byExercise[s.exercise_id]) byExercise[s.exercise_id] = [];
      byExercise[s.exercise_id].push({
        date: s.performed_at,
        sessionId: s.session_id,
        e1rm: estimate1RM(s.weight_kg, s.reps),
      });
    });

    const sessionsWithPR = new Set<string>();
    Object.values(byExercise).forEach((records) => {
      records.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let bestSoFar = 0;
      const seenInSession: Record<string, number> = {};
      records.forEach((r) => {
        if (r.e1rm > bestSoFar) {
          // novo melhor — marca a sessão como tendo PR (uma vez por exercício)
          if (!seenInSession[r.sessionId]) {
            sessionsWithPR.add(r.sessionId);
            seenInSession[r.sessionId] = 1;
          }
          bestSoFar = r.e1rm;
        }
      });
    });

    const enriched = baseList.map((s) => ({
      ...s,
      tonnage: setMap[s.id]?.tonnage ?? 0,
      setCount: setMap[s.id]?.setCount ?? 0,
      failureCount: setMap[s.id]?.failureCount ?? 0,
      hasPR: sessionsWithPR.has(s.id),
    }));

    setSessions(enriched);
    setLoading(false);
  }

  // ─── Filtros ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const cutoff = (() => {
      if (period === "all") return null;
      const d = new Date();
      d.setDate(d.getDate() - (period === "30d" ? 30 : 90));
      return d.toISOString().slice(0, 10);
    })();

    const term = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (cutoff && s.session_date < cutoff) return false;
      if (onlyPRs && !s.hasPR) return false;
      if (term) {
        const haystack = `${s.day_name ?? "treino livre"} ${s.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [sessions, period, onlyPRs, search]);

  // ─── Agrupamento por mês ─────────────────────────────
  const groups: MonthGroup[] = useMemo(() => {
    const map: Record<string, SessionWithDay[]> = {};
    filtered.forEach((s) => {
      const d = new Date(s.session_date + "T12:00:00");
      const key = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return Object.entries(map).map(([label, sessions]) => ({ label, sessions }));
  }, [filtered]);

  return (
    <div className="fade-in">
      <Link href="/sessao" className="text-xs font-medium block mb-3" style={{ color: "var(--muted)", minHeight: "auto" }}>
        ← Treinos
      </Link>
      <PageHeader
        eyebrow="Histórico"
        title={`${filtered.length} treino${filtered.length === 1 ? "" : "s"}`}
        subtitle={loading ? undefined : period === "all" ? "Todos os treinos concluídos" : period === "30d" ? "Últimos 30 dias" : "Últimos 90 dias"}
      />

      {/* Toolbar */}
      {!loading && sessions.length > 0 && (
        <>
          {/* Busca + Toggle de vista */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou nota..."
                className="w-full rounded-xl px-3 py-2.5 pl-9 text-sm"
                style={{
                  background: "var(--surface)",
                  border: "0.5px solid var(--border)",
                  color: "var(--text)",
                  outline: "none",
                  minHeight: 44,
                }}
              />
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--faint)" }}
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <button
              onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}
              className="rounded-xl flex items-center justify-center flex-shrink-0"
              aria-label={viewMode === "list" ? "Ver como calendário" : "Ver como lista"}
              style={{
                width: 44, height: 44, minHeight: 44,
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              {viewMode === "list" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              )}
            </button>
          </div>

          {/* Chips de filtro */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {([
              { key: "all", label: "Tudo" },
              { key: "30d", label: "30 dias" },
              { key: "90d", label: "90 dias" },
            ] as { key: Period; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className="rounded-full text-xs font-bold"
                style={{
                  padding: "6px 14px",
                  minHeight: "auto",
                  background: period === key ? "var(--primary)" : "var(--surface)",
                  color: period === key ? "var(--background)" : "var(--muted)",
                  border: `0.5px solid ${period === key ? "var(--primary)" : "var(--border)"}`,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setOnlyPRs((v) => !v)}
              className="rounded-full text-xs font-bold flex items-center gap-1"
              style={{
                padding: "6px 14px",
                minHeight: "auto",
                background: onlyPRs ? "rgba(251,191,36,0.18)" : "var(--surface)",
                color: onlyPRs ? "#fbbf24" : "var(--muted)",
                border: `0.5px solid ${onlyPRs ? "rgba(251,191,36,0.6)" : "var(--border)"}`,
                cursor: "pointer",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M17 3H7L8.5 10.5A4.5 4.5 0 0 0 12 14a4.5 4.5 0 0 0 3.5-3.5L17 3Z"/>
                <path d="M7 3H4a1 1 0 0 0-1 1v1a4 4 0 0 0 4 4M17 3h3a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4"/>
              </svg>
              Com PR
            </button>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : sessions.length === 0 ? (
        <Card variant="ghost" className="text-center py-10">
          <div className="font-bold mb-1" style={{ color: "var(--primary)" }}>Nenhum treino ainda</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>Complete sua primeira sessão para aparecer aqui</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card variant="ghost" className="text-center py-8">
          <div className="text-sm" style={{ color: "var(--muted)" }}>Nenhum treino com esses filtros</div>
        </Card>
      ) : viewMode === "calendar" ? (
        <CalendarView sessions={filtered} />
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
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-4"
                    style={{ borderBottom: idx < group.sessions.length - 1 ? "0.5px solid var(--border)" : "none", paddingTop: 12, paddingBottom: 12 }}
                  >
                    {/* Data */}
                    <div
                      className="flex-shrink-0 flex flex-col items-center justify-center rounded-lg"
                      style={{ width: 44, height: 48, background: "var(--surface-strong)" }}
                    >
                      <div className="text-xs font-medium capitalize" style={{ color: "var(--muted)" }}>{weekday}</div>
                      <div className="text-lg font-bold tabular leading-none">{day}</div>
                    </div>

                    {/* Info */}
                    <Link href={`/sessao/${s.id}/resumo`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">{s.day_name ?? "Treino livre"}</span>
                        {s.hasPR && (
                          <span
                            className="flex-shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold tabular"
                            style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 21h8M12 17v4M17 3H7L8.5 10.5A4.5 4.5 0 0 0 12 14a4.5 4.5 0 0 0 3.5-3.5L17 3Z"/>
                            </svg>
                            PR
                          </span>
                        )}
                        {s.failureCount! > 0 && (
                          <span
                            className="flex-shrink-0 px-1.5 py-0.5 rounded-md text-xs font-bold tabular"
                            style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}
                            title={`${s.failureCount} séries à falha`}
                          >
                            Falha {s.failureCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
                        {s.duration_minutes ? <span>{fmtDuration(s.duration_minutes)}</span> : null}
                        {s.setCount ? <span className="tabular">{s.setCount} séries</span> : null}
                        {s.tonnage && s.tonnage > 0 ? <span className="tabular">{fmtTonnage(s.tonnage)}</span> : null}
                        {s.energy_level ? <span>energia {s.energy_level}/5</span> : null}
                      </div>
                    </Link>

                    {/* Ações */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Link
                        href={`/sessao/${s.id}/resumo`}
                        className="rounded-md flex items-center justify-center"
                        style={{ width: 32, height: 32, minHeight: 32, color: "var(--accent)" }}
                        aria-label="Ver resumo"
                      >
                        →
                      </Link>
                      <button
                        onClick={() => deleteSession(s.id)}
                        aria-label="Apagar treino"
                        className="rounded-md flex items-center justify-center"
                        style={{ width: 32, height: 32, minHeight: 32, color: "var(--faint)", cursor: "pointer" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================
// Calendar view — grade mensal com sessões marcadas
// ============================================================
function CalendarView({ sessions }: { sessions: SessionWithDay[] }) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const sessionByDate = useMemo(() => {
    const m: Record<string, SessionWithDay> = {};
    sessions.forEach((s) => { m[s.session_date] = s; });
    return m;
  }, [sessions]);

  const monthStart = new Date(viewMonth.year, viewMonth.month, 1);
  const monthEnd = new Date(viewMonth.year, viewMonth.month + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const startWeekday = monthStart.getDay(); // 0 = domingo

  function prev() {
    setViewMonth((v) => {
      const m = v.month - 1;
      return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m };
    });
  }
  function next() {
    setViewMonth((v) => {
      const m = v.month + 1;
      return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m };
    });
  }

  const monthLabel = monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <Card className="!p-3">
      {/* Header com nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="rounded-lg flex items-center justify-center" aria-label="Mês anterior"
          style={{ width: 36, height: 36, minHeight: 36, background: "var(--surface)", border: "0.5px solid var(--border)", color: "var(--muted)", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="text-sm font-bold capitalize tabular">{monthLabel}</span>
        <button onClick={next} className="rounded-lg flex items-center justify-center" aria-label="Próximo mês"
          style={{ width: 36, height: 36, minHeight: 36, background: "var(--surface)", border: "0.5px solid var(--border)", color: "var(--muted)", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Labels dos dias */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-xs font-bold" style={{ color: "var(--faint)" }}>{d}</div>
        ))}
      </div>

      {/* Grade */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startWeekday }, (_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = new Date(viewMonth.year, viewMonth.month, day);
          const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const session = sessionByDate[dateStr];
          const isToday =
            day === today.getDate() &&
            viewMonth.month === today.getMonth() &&
            viewMonth.year === today.getFullYear();

          if (session) {
            return (
              <Link key={day} href={`/sessao/${session.id}/resumo`}>
                <div
                  className="aspect-square rounded-md flex items-center justify-center text-xs font-bold relative cursor-pointer"
                  style={{
                    background: "var(--primary)",
                    color: "var(--background)",
                    border: isToday ? "1.5px solid var(--accent)" : "none",
                  }}
                >
                  {day}
                  {session.hasPR && (
                    <div
                      style={{
                        position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%",
                        background: "#fbbf24",
                      }}
                    />
                  )}
                </div>
              </Link>
            );
          }

          return (
            <div
              key={day}
              className="aspect-square rounded-md flex items-center justify-center text-xs"
              style={{
                background: "var(--surface)",
                color: isToday ? "var(--accent)" : "var(--muted)",
                fontWeight: isToday ? 700 : 500,
                border: isToday ? "1.5px solid var(--accent)" : "none",
              }}
            >
              {day}
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-3" style={{ borderTop: "0.5px solid var(--border)" }}>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "var(--primary)" }} />
          <span className="text-xs" style={{ color: "var(--muted)" }}>Treino</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "var(--primary)", position: "relative" }}>
            <div style={{ position: "absolute", top: -1, right: -1, width: 5, height: 5, borderRadius: "50%", background: "#fbbf24" }} />
          </div>
          <span className="text-xs" style={{ color: "var(--muted)" }}>com PR</span>
        </div>
      </div>
    </Card>
  );
}
