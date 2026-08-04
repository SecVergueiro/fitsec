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

export type WriteOp = "insert" | "update" | "delete";

/**
 * Erro que o servidor recusou de vez — repetir não vai adiantar.
 *
 * Carrega tabela e operação para que o handler global
 * (components/WriteErrorToast) monte a mensagem sem que cada chamada
 * precise do seu próprio try/catch.
 */
export class ServerRejectedError extends Error {
  constructor(
    public readonly table: string,
    public readonly op: WriteOp,
    public readonly cause: any
  ) {
    super(cause?.message ?? "Erro do servidor");
    this.name = "ServerRejectedError";
  }
}

const NOUNS: Record<string, string> = {
  session_sets: "a série",
  session_exercises: "o exercício da sessão",
  workout_sessions: "o treino",
  templates: "o template",
  template_days: "o dia do treino",
  template_exercises: "o exercício do treino",
  mesocycles: "o mesociclo",
  exercises: "o exercício",
  user_profiles: "o perfil",
};

const VERBS: Record<string, string> = {
  insert: "criar",
  update: "salvar",
  delete: "remover",
};

/**
 * Mensagem pro usuário a partir de um ServerRejectedError.
 *
 * Fonte única para os dois caminhos: o toast global e as telas que já tratam o
 * erro na mão. A mensagem crua do PostgREST ("duplicate key value violates
 * unique constraint...") não serve pra ninguém.
 */
export function describeWriteError(err: any): string {
  const noun = NOUNS[err?.table] ?? "a alteração";
  const verb = VERBS[err?.op] ?? "salvar";
  const code = err?.cause?.code;

  if (code === "23505") return `${noun[0].toUpperCase()}${noun.slice(1)} já existe com esse nome`;
  if (code === "23503") return `Não deu pra ${verb} ${noun} — depende de um registro que não existe mais`;
  if (err?.name !== "ServerRejectedError") return err?.message ?? `Não deu pra ${verb} ${noun}`;

  return `Não deu pra ${verb} ${noun} — o servidor recusou`;
}

/**
 * Vale a pena enfileirar e tentar de novo?
 *
 * O supabase-js resolve erros de rede com `status: 0`. Erros reais do PostgREST
 * (violação de constraint, coluna inexistente, RLS) vêm com 4xx e nunca vão
 * passar num retry — enfileirá-los faz o registro sumir em silêncio depois de
 * cinco tentativas. 401/403/429/5xx ficam na fila porque o token pode renovar
 * e o servidor pode voltar.
 */
function isRetriable(error: any): boolean {
  if (!error) return false;
  if (!isOnline()) return true;

  const status = typeof error.status === "number" ? error.status : null;
  if (status === null || status === 0) return true;
  if (status === 401 || status === 403 || status === 408 || status === 429) return true;
  if (status >= 500) return true;

  const message = String(error.message ?? "");
  if (/TypeError|AbortError|FetchError|NetworkError|Failed to fetch|timeout/i.test(message)) return true;

  return false;
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
  options: {
    localTable?: keyof NonNullable<typeof db>;
    /**
     * Não espera a resposta do servidor: grava local, devolve na hora e manda
     * pra rede em background.
     *
     * É o modo do caminho crítico do treino (salvar série). Sem isso o `await`
     * do insert online segura o botão em spinner e — pior — atrasa o início do
     * descanso pelo tempo do round-trip. Na academia isso é o app perdendo pro
     * timer nativo do iPhone.
     *
     * O envio vai pela fila do IndexedDB, não por um fire-and-forget: o iOS
     * pode matar o PWA no segundo seguinte, e aí uma requisição em vôo morreria
     * com ela. Na fila, a série sobrevive e sai no próximo flush.
     */
    optimistic?: boolean;
  } = {}
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

  if (options.optimistic) {
    // Fila + flush debounced (800 ms) cuidam da rede. O OfflineBadge mostra o
    // pendente, então o envio nunca é invisível.
    await enqueue(table, "insert", recordWithId);
    return recordWithId;
  }

  if (isOnline()) {
    const { data, error } = await supabase.from(table).insert(recordWithId as any).select().single();
    if (!error) {
      // Substitui o registro local pelo retornado do servidor (caso o servidor enriqueça campos)
      if (db && options.localTable && data) {
        try { await (db as any)[options.localTable].put(data); } catch {/* */}
      }
      return data as T & { id: string };
    }
    if (!isRetriable(error)) {
      // Recusa definitiva: desfaz o registro local e devolve o erro pra UI
      if (db && options.localTable) {
        try { await (db as any)[options.localTable].delete(id); } catch {/* */}
      }
      throw new ServerRejectedError(table, "insert", error);
    }
    await enqueue(table, "insert", recordWithId);
    return recordWithId;
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
    let q = supabase.from(table).update(patch);
    Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
    const { error } = await q;
    if (!error) return;
    if (!isRetriable(error)) throw new ServerRejectedError(table, "update", error);
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
    let q = supabase.from(table).delete();
    Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
    const { error } = await q;
    if (!error) return;
    if (!isRetriable(error)) throw new ServerRejectedError(table, "delete", error);
  }

  await enqueue(table, "delete", {}, match);
}

/** Força flush manual (útil em finalização de sessão) */
export async function forceSyncNow() {
  return flushQueue();
}
