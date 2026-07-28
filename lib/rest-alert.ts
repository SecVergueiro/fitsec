// Aviso de fim de descanso que funciona no iPhone.
//
// O app avisava só com `navigator.vibrate`, que o WebKit não implementa — os
// quatro pontos que usam vibração nunca dispararam no iOS. Na prática o timer
// de descanso terminava sem nenhum sinal, e com o celular no bolso você não
// ficava sabendo.
//
// A alternativa que funciona é Web Audio, com três cuidados específicos do iOS:
//
//   1. O AudioContext nasce suspenso e só pode ser retomado dentro de um gesto
//      do usuário. Por isso `armRestAlert()` é chamado no primeiro toque na
//      tela da sessão, e não na hora de tocar o som.
//   2. Por padrão o iOS silencia Web Audio quando a chave lateral está no mudo.
//      `navigator.audioSession.type = "playback"` (Safari 16.4+) contorna isso.
//   3. Com a tela apagada o contexto é suspenso e o som não sai. Daí o wake
//      lock enquanto o cronômetro corre.
"use client";

let ctx: AudioContext | null = null;
let wakeLock: WakeLockSentinel | null = null;

/**
 * Prepara o áudio. **Precisa ser chamado de dentro de um gesto do usuário**
 * (toque/clique), senão o iOS deixa o contexto suspenso para sempre.
 * Chamar várias vezes é inofensivo.
 */
export function armRestAlert(): void {
  if (typeof window === "undefined") return;

  try {
    // Deixa o som passar mesmo com o iPhone no silencioso (Safari 16.4+)
    const audioSession = (navigator as any).audioSession;
    if (audioSession && audioSession.type !== "playback") audioSession.type = "playback";
  } catch {
    /* navegador sem audioSession — segue sem isso */
  }

  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Dois bipes curtos, tipo cronômetro de academia. */
export async function playRestAlert(): Promise<void> {
  // Android continua vibrando; no iOS isto é no-op e o som cobre
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    /* ignore */
  }

  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") return;

    const inicio = ctx.currentTime;
    for (const [offset, freq] of [[0, 880], [0.22, 1174.7]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      // Envelope curto — sem isso o corte seco estala
      const t = inicio + offset;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  } catch {
    /* sem áudio disponível — resta a vibração no Android */
  }
}

/**
 * Segura a tela acesa enquanto o descanso corre. Sem isto o iOS bloqueia a
 * tela no meio da contagem, suspende o AudioContext e o bipe não sai.
 */
export async function acquireWakeLock(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await (navigator as any).wakeLock.request("screen");
  } catch {
    // Negado (aba em background, bateria baixa) — o descanso segue sem isso
    wakeLock = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

/** true se há um wake lock ativo — usado para reobter ao voltar do background. */
export function hasWakeLock(): boolean {
  return !!wakeLock && !wakeLock.released;
}
