// Sync engine — bridge entre Supabase e IndexedDB local.
// Operações:
//   1. pullSnapshot(userId)  — baixa dados essenciais para uso offline
//   2. enqueue(...)           — registra uma mutação na fila local
//   3. flushQueue()           — envia mutações pendentes ao Supabase
"use client";

import { supabase } from "./supabase";
import { db, bulkPut, type MutationOp, type PendingMutation } from "./offline-db";

const PULL_LOOKBACK_DAYS = 60;
const MAX_RETRIES = 5;

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ─────────────────────────────────────────────────────────────
// PULL — baixa snapshot do servidor para o IndexedDB
// ─────────────────────────────────────────────────────────────
export async function pullSnapshot(userId: string): Promise<void> {
  if (!db) return;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - PULL_LOOKBACK_DAYS);
  const cutoff = cutoffDate.toISOString().slice(0, 10);

  try {
    // Profile
    const { data: profile } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (profile) await db.user_profile.put(profile as any);

    // Catálogo de exercícios (todos os públicos + do usuário)
    const { data: exercises } = await supabase.from("exercises").select("*");
    if (exercises) {
      await db.exercises.clear();
      await bulkPut(db.exercises, exercises as any[]);
    }

    // Templates + dias + exercícios prescritos
    const { data: templates } = await supabase.from("templates").select("*");
    if (templates) {
      await db.templates.clear();
      await bulkPut(db.templates, templates as any[]);
    }

    const { data: days } = await supabase.from("template_days").select("*");
    if (days) {
      await db.template_days.clear();
      await bulkPut(db.template_days, days as any[]);
    }

    const { data: tplExs } = await supabase.from("template_exercises").select("*");
    if (tplExs) {
      await db.template_exercises.clear();
      await bulkPut(db.template_exercises, tplExs as any[]);
    }

    // Mesociclos
    const { data: mesos } = await supabase.from("mesocycles").select("*");
    if (mesos) {
      await db.mesocycles.clear();
      await bulkPut(db.mesocycles, mesos as any[]);
    }

    // Sessões dos últimos N dias
    const { data: sessions } = await supabase
      .from("workout_sessions")
      .select("*")
      .gte("session_date", cutoff);
    if (sessions) {
      const ids = (sessions as any[]).map((s) => s.id);
      await db.workout_sessions.clear();
      await bulkPut(db.workout_sessions, sessions as any[]);

      if (ids.length > 0) {
        const { data: setRows } = await supabase.from("session_sets").select("*").in("session_id", ids);
        const { data: exRows } = await supabase.from("session_exercises").select("*").in("session_id", ids);
        await db.session_sets.clear();
        await db.session_exercises.clear();
        if (setRows) await bulkPut(db.session_sets, setRows as any[]);
        if (exRows) await bulkPut(db.session_exercises, exRows as any[]);
      }
    }
  } catch (err) {
    console.warn("[sync] pullSnapshot falhou:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// ENQUEUE — registra mutação para flush posterior
// ─────────────────────────────────────────────────────────────
export async function enqueue(
  table: string,
  op: MutationOp,
  payload: Record<string, unknown>,
  match?: Record<string, unknown>
): Promise<void> {
  if (!db) return;
  const mutation: PendingMutation = {
    table,
    op,
    payload,
    match,
    created_at: Date.now(),
    attempts: 0,
    last_error: null,
  };
  await db.pending_mutations.add(mutation);
  scheduleFlush();
}

// ─────────────────────────────────────────────────────────────
// FLUSH — envia mutações pendentes ao servidor
// ─────────────────────────────────────────────────────────────
export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  if (!db || flushing || typeof navigator !== "undefined" && !navigator.onLine) {
    return { flushed: 0, failed: 0 };
  }
  flushing = true;
  let flushed = 0;
  let failed = 0;

  try {
    const pending = await db.pending_mutations.orderBy("created_at").toArray();
    for (const m of pending) {
      if (m.attempts >= MAX_RETRIES) {
        failed++;
        continue;
      }

      try {
        const table = supabase.from(m.table);
        if (m.op === "insert") {
          const { error } = await table.insert(m.payload as any);
          if (error) throw error;
        } else if (m.op === "update") {
          let q = table.update(m.payload as any);
          Object.entries(m.match ?? {}).forEach(([k, v]) => { q = q.eq(k, v as any); });
          const { error } = await q;
          if (error) throw error;
        } else if (m.op === "delete") {
          let q = table.delete();
          Object.entries(m.match ?? {}).forEach(([k, v]) => { q = q.eq(k, v as any); });
          const { error } = await q;
          if (error) throw error;
        }
        await db.pending_mutations.delete(m.id!);
        flushed++;
      } catch (err: any) {
        failed++;
        await db.pending_mutations.update(m.id!, {
          attempts: m.attempts + 1,
          last_error: err?.message ?? String(err),
        });
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, failed };
}

// Debounce do flush
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushQueue(); }, 800);
}

// ─────────────────────────────────────────────────────────────
// HOOK — escuta eventos online/offline
// ─────────────────────────────────────────────────────────────
export function attachSyncListeners() {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => { flushQueue(); };
  window.addEventListener("online", onOnline);
  // Tenta flush periódico enquanto online (a cada 30s)
  const interval = setInterval(() => {
    if (navigator.onLine) flushQueue();
  }, 30000);
  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}

// ─────────────────────────────────────────────────────────────
// HELPER — quantas mutações pendentes
// ─────────────────────────────────────────────────────────────
export async function pendingCount(): Promise<number> {
  if (!db) return 0;
  return db.pending_mutations.count();
}
