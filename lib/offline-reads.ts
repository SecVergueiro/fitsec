// Helpers de leitura offline-first.
//
// IMPORTANTE — por que não dá pra usar try/catch com o supabase-js:
// em erro de rede o PostgrestBuilder **resolve** com `{ data: null, error }`
// em vez de rejeitar. Todo bloco `try { await supabase.from(...) } catch { ... }`
// é código morto: o catch nunca dispara e a tela fica vazia offline.
// Sempre passe a query por `offlineRead`, que inspeciona `error` explicitamente.
"use client";

const NETWORK_TIMEOUT_MS = 6000;

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function isEmpty(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

interface OfflineReadOptions {
  /**
   * Lê o cache local primeiro e só consulta o servidor se ele não tiver nada.
   *
   * Use quando houver mutações na fila: o servidor ainda não conhece a sessão
   * criada offline e responderia `[]`, apagando da tela séries que existem
   * localmente — e levando o usuário a registrá-las de novo.
   */
  preferLocal?: boolean;
}

/**
 * Lê do Supabase com fallback para o cache local (Dexie).
 *
 * Cai para o cache quando: está offline, a query devolveu `error` (inclui falha
 * de rede e timeout) ou o servidor não tem a linha.
 *
 * @param online  função que devolve `{ data, error }` do Supabase
 * @param offline função que devolve os dados do Dexie
 */
export async function offlineRead<T>(
  online: () => PromiseLike<{ data: T | null; error?: unknown }>,
  offline: () => Promise<T | null>,
  options: OfflineReadOptions = {}
): Promise<T | null> {
  const readLocal = async (): Promise<T | null> => {
    try {
      return await offline();
    } catch {
      return null;
    }
  };

  if (options.preferLocal) {
    const local = await readLocal();
    if (!isEmpty(local)) return local;
  }

  if (!isOnline()) return readLocal();

  try {
    const result = await Promise.race([
      Promise.resolve(online()),
      new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS)
      ),
    ]);
    if ((result as any).error) throw (result as any).error;
    if (result.data == null) {
      // Sem dados online — talvez tenha cache local
      return readLocal();
    }
    return result.data;
  } catch {
    return readLocal();
  }
}

/** Igual ao offlineRead, mas devolve `[]` em vez de null — evita `?? []` no chamador. */
export async function offlineReadList<T>(
  online: () => PromiseLike<{ data: T[] | null; error?: unknown }>,
  offline: () => Promise<T[] | null>,
  options: OfflineReadOptions = {}
): Promise<T[]> {
  return (await offlineRead<T[]>(online, offline, options)) ?? [];
}
