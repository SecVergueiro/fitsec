// IndexedDB local store — espelho parcial do Supabase
// Usado para leitura offline e cache persistente.
//
// Tabelas espelhadas (priorizando o que o usuário precisa offline):
//   - workout_sessions (últimas 30 dias)
//   - session_exercises + session_sets de sessões em andamento
//   - exercises (catálogo completo)
//   - templates + template_days + template_exercises
//   - mesocycles
//   - user_profile
//   - mutation queue
"use client";

import Dexie, { type Table } from "dexie";
import type {
  Exercise,
  Mesocycle,
  SessionExercise,
  SessionSet,
  Template,
  TemplateDay,
  TemplateExercise,
  UserProfile,
  WorkoutSession,
} from "./database.types";

export type MutationOp = "insert" | "update" | "delete";

export interface PendingMutation {
  id?: number;
  table: string;
  op: MutationOp;
  payload: Record<string, unknown>;
  match?: Record<string, unknown>;   // critério WHERE para update/delete
  created_at: number;                 // timestamp ms
  attempts: number;
  last_error?: string | null;
}

class FitsecDB extends Dexie {
  workout_sessions!: Table<WorkoutSession, string>;
  session_exercises!: Table<SessionExercise, string>;
  session_sets!: Table<SessionSet, string>;
  exercises!: Table<Exercise, string>;
  templates!: Table<Template, string>;
  template_days!: Table<TemplateDay, string>;
  template_exercises!: Table<TemplateExercise, string>;
  mesocycles!: Table<Mesocycle, string>;
  user_profile!: Table<UserProfile, string>;
  pending_mutations!: Table<PendingMutation, number>;

  constructor() {
    super("fitsec");
    this.version(1).stores({
      workout_sessions: "id, session_date, completed_at",
      session_exercises: "id, session_id, exercise_id, exercise_order",
      session_sets: "id, session_id, session_exercise_id, exercise_id, performed_at",
      exercises: "id, primary_muscle, name",
      templates: "id, is_active",
      template_days: "id, template_id, weekday",
      template_exercises: "id, template_day_id, exercise_order",
      mesocycles: "id, is_active, start_date",
      user_profile: "user_id",
      pending_mutations: "++id, table, created_at",
    });
  }
}

export const db = typeof window !== "undefined" ? new FitsecDB() : (null as unknown as FitsecDB);

/**
 * Solicita armazenamento persistente — importante no iOS, que pode
 * limpar IndexedDB de PWAs após ~7 dias sem uso.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    const already = await navigator.storage.persisted?.();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Helpers para upsert em lote — usados pelo sync ao baixar do Supabase */
export async function bulkPut<T>(table: Table<T, string>, rows: T[]): Promise<void> {
  if (!db || rows.length === 0) return;
  await table.bulkPut(rows);
}

/** Limpa todos os dados locais (logout / apagar conta) */
export async function clearLocalDB(): Promise<void> {
  if (!db) return;
  await Promise.all([
    db.workout_sessions.clear(),
    db.session_exercises.clear(),
    db.session_sets.clear(),
    db.exercises.clear(),
    db.templates.clear(),
    db.template_days.clear(),
    db.template_exercises.clear(),
    db.mesocycles.clear(),
    db.user_profile.clear(),
    db.pending_mutations.clear(),
  ]);
}
