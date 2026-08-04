// Estado volátil da sessão que precisa sobreviver a um restart do app.
//
// No iPhone o PWA é despejado da memória o tempo todo — troca pro Spotify,
// tela bloqueia, atende uma mensagem — e ao voltar o app recarrega do zero.
// O cronômetro total se recupera sozinho (é derivado de `started_at` e das
// séries no banco), mas o descanso e o exercício aberto viviam só em `useState`
// e sumiam: você voltava pro app no meio de 90 s de descanso e não havia mais
// descanso nenhum.
//
// Aqui gravamos o mínimo necessário no localStorage. O descanso é guardado como
// **timestamp absoluto de término**, não como "faltam N segundos", então o
// tempo continua correndo com o app morto e a contagem volta certa.
"use client";

const REST_KEY = "fitsec_rest_v1";
const IDX_KEY = "fitsec_active_idx_v1";
const ACTIVE_SESSION_KEY = "fitsec_active_session_v1";

export interface RestState {
  /** Sessão dona do descanso — evita restaurar o descanso de um treino antigo. */
  sessionId: string;
  /** Epoch ms em que o descanso acaba. */
  endAt: number;
  /** Duração total em segundos, para a barra de progresso. */
  total: number;
}

function read(key: string): any {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage cheio ou bloqueado — o descanso segue só em memória */
  }
}

function drop(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function saveRest(state: RestState): void {
  write(REST_KEY, state);
}

/**
 * Descanso em andamento desta sessão, ou null. Já descarta o que expirou
 * enquanto o app estava fechado (não faz sentido bipar um descanso vencido) e
 * o que pertence a outra sessão.
 */
export function loadRest(sessionId: string, now: number = Date.now()): RestState | null {
  const s = read(REST_KEY);
  if (!s || typeof s !== "object") return null;
  if (s.sessionId !== sessionId || typeof s.endAt !== "number") {
    return null;
  }
  if (s.endAt <= now) {
    clearRest();
    return null;
  }
  return {
    sessionId: s.sessionId,
    endAt: s.endAt,
    total: typeof s.total === "number" && s.total > 0 ? s.total : Math.ceil((s.endAt - now) / 1000),
  };
}

export function clearRest(): void {
  drop(REST_KEY);
}

/** Exercício que estava aberto, para reabrir no mesmo ponto após o restart. */
export function saveActiveIdx(sessionId: string, idx: number): void {
  write(IDX_KEY, { sessionId, idx });
}

export function loadActiveIdx(sessionId: string): number | null {
  const s = read(IDX_KEY);
  if (!s || s.sessionId !== sessionId || typeof s.idx !== "number" || s.idx < 0) return null;
  return s.idx;
}

export function clearActiveIdx(): void {
  drop(IDX_KEY);
}

// ────────────────────────────────────────────────────────────────
// Treino em andamento — para reabrir o app já dentro dele
// ────────────────────────────────────────────────────────────────

/**
 * Marca qual treino está em andamento, em localStorage puro.
 *
 * Existe para o cold start não custar nada: quando o iOS mata o PWA e você
 * reabre, o app sabe em qual sessão entrar sem uma única leitura de banco —
 * era um tap ("Continuar →") depois de esperar as leituras da /sessao.
 */
export function saveActiveSession(sessionId: string, startedAt: number): void {
  write(ACTIVE_SESSION_KEY, { sessionId, startedAt });
}

/**
 * Treino em andamento, ou null. Descarta o que passou de `maxAgeMs` — treino
 * esquecido aberto de ontem não deve sequestrar a abertura do app.
 */
export function loadActiveSession(maxAgeMs: number, now: number = Date.now()): { sessionId: string; startedAt: number } | null {
  const s = read(ACTIVE_SESSION_KEY);
  if (!s || typeof s.sessionId !== "string" || typeof s.startedAt !== "number") return null;
  if (now - s.startedAt > maxAgeMs) {
    clearActiveSession();
    return null;
  }
  return { sessionId: s.sessionId, startedAt: s.startedAt };
}

export function clearActiveSession(): void {
  drop(ACTIVE_SESSION_KEY);
}

/** Chamado ao finalizar/descartar o treino — não deixa lixo para a próxima sessão. */
export function clearSessionState(): void {
  clearRest();
  clearActiveIdx();
  clearActiveSession();
}
