// Helpers de escrita offline-first.
// Padrão: tenta gravar online → se offline ou erro de rede, grava no
// IndexedDB local + enfileira pra sincronizar depois.
"use client";

import { supabase } from "./supabase";
import { db } from "./offline-db";
import { enqueue, flushQueue } from "./sync-engine";

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function localUUID(): string {
  // RFC4122 v4 simples — não precisa ser criptograficamente seguro
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Insere um registro com fallback offline.
 * Retorna o registro com id (real ou temporário) — UI atualiza imediatamente.
 */
export async function offlineInsert<T extends Record<string, any>>(
  table: string,
  payload: T,
  options: { localTable?: keyof NonNullable<typeof db> } = {}
): Promise<T & { id: string }> {
  // Gera id local — Supabase aceitará no insert (a maioria das tabelas tem default gen_random_uuid mas aceita id explícito)
  const id = (payload as any).id ?? localUUID();
  const recordWithId = { ...payload, id } as T & { id: string };

  // Grava local imediatamente
  if (db && options.localTable) {
    try {
      await (db as any)[options.localTable].put(recordWithId);
    } catch {/* ignore */}
  }

  if (isOnline()) {
    try {
      const { data, error } = await supabase.from(table).insert(recordWithId as any).select().single();
      if (error) throw error;
      // Substitui o registro local pelo retornado do servidor (caso o servidor enriqueça campos)
      if (db && options.localTable && data) {
        try { await (db as any)[options.localTable].put(data); } catch {/* */}
      }
      return data as T & { id: string };
    } catch {
      // Cai pro modo offline
      await enqueue(table, "insert", recordWithId);
      return recordWithId;
    }
  }

  await enqueue(table, "insert", recordWithId);
  return recordWithId;
}

/**
 * Update com fallback offline.
 */
export async function offlineUpdate(
  table: string,
  patch: Record<string, any>,
  match: Record<string, any>,
  options: { localTable?: keyof NonNullable<typeof db>; localId?: string } = {}
): Promise<void> {
  // Atualiza local imediatamente
  if (db && options.localTable && options.localId) {
    try {
      const current = await (db as any)[options.localTable].get(options.localId);
      if (current) {
        await (db as any)[options.localTable].put({ ...current, ...patch });
      }
    } catch {/* */}
  }

  if (isOnline()) {
    try {
      let q = supabase.from(table).update(patch);
      Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      const { error } = await q;
      if (error) throw error;
      return;
    } catch {/* cai offline */}
  }

  await enqueue(table, "update", patch, match);
}

/**
 * Delete com fallback offline.
 */
export async function offlineDelete(
  table: string,
  match: Record<string, any>,
  options: { localTable?: keyof NonNullable<typeof db>; localId?: string } = {}
): Promise<void> {
  if (db && options.localTable && options.localId) {
    try { await (db as any)[options.localTable].delete(options.localId); } catch {/* */}
  }

  if (isOnline()) {
    try {
      let q = supabase.from(table).delete();
      Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      const { error } = await q;
      if (error) throw error;
      return;
    } catch {/* cai offline */}
  }

  await enqueue(table, "delete", {}, match);
}

/** Força flush manual (útil em finalização de sessão) */
export async function forceSyncNow() {
  return flushQueue();
}
