// Helpers de leitura offline-first.
// Padrão: detecta offline → vai direto pro Dexie. Online → tenta Supabase,
// se falhar (timeout, network error) também cai pro Dexie.
"use client";

const NETWORK_TIMEOUT_MS = 6000;

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

/**
 * Tenta executar a query online primeiro. Se offline ou erro, usa fallback.
 *
 * @param online função que retorna { data, error } do Supabase
 * @param offline função que retorna dados do Dexie
 */
export async function offlineRead<T>(
  online: () => PromiseLike<{ data: T | null; error?: unknown }>,
  offline: () => Promise<T | null>
): Promise<T | null> {
  if (!isOnline()) {
    try { return await offline(); } catch { return null; }
  }

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
      try { return await offline(); } catch { return null; }
    }
    return result.data;
  } catch {
    try { return await offline(); } catch { return null; }
  }
}
