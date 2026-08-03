// Aviso de fim de descanso que funciona no iPhone — sem parar a sua música.
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
//   2. O tipo da audio session decide o que acontece com o Spotify. Com
//      `"playback"` — como estava — o iOS trata o app como tocador de música e
//      **para** o áudio dos outros apps no instante em que o contexto acorda:
//      era isso que pausava a sua música ao abrir a sessão. `"transient"` é a
//      categoria de bipe curto: a música só abaixa (duck) durante o alerta e
//      volta sozinha, igual GPS.
//   3. Contexto acordado = audio session ativa. Então ele fica **suspenso**
//      entre um descanso e outro e só acorda os ~700 ms do bipe. Sem isso a
//      música ficaria abafada o treino inteiro.
//
// O destravamento do passo 1 vale para sempre: uma vez que o contexto foi
// retomado dentro de um gesto, os `resume()` seguintes funcionam fora de gesto.
"use client";

let ctx: AudioContext | null = null;
let wakeLock: WakeLockSentinel | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Devolve o contexto ao repouso — audio session inativa, música intocada. */
function suspendSoon(delayMs: number): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    try {
      void ctx?.suspend?.();
    } catch {
      /* contexto já fechado */
    }
  }, delayMs);
}

/**
 * Prepara o áudio. **Precisa ser chamado de dentro de um gesto do usuário**
 * (toque/clique), senão o iOS deixa o contexto suspenso para sempre.
 * Chamar várias vezes é inofensivo.
 */
export function armRestAlert(): void {
  if (typeof window === "undefined") return;

  try {
    // "transient" = bipe curto. A música dos outros apps abaixa durante o
    // alerta e volta sozinha. Nunca use "playback" aqui: pausa o Spotify.
    const audioSession = (navigator as any).audioSession;
    if (audioSession && audioSession.type !== "transient") audioSession.type = "transient";
  } catch {
    /* navegador sem audioSession — segue sem isso */
  }

  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor();
    // Destrava dentro do gesto e volta a dormir logo em seguida.
    if (ctx.state === "suspended") void ctx.resume();
    suspendSoon(300);
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
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (ctx.state !== "running") await ctx.resume();
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

    // Devolve o áudio ao Spotify assim que o segundo bipe termina.
    suspendSoon(700);
  } catch {
    /* sem áudio disponível — resta a vibração no Android */
  }
}

/** true se o contexto está acordado (ocupando a audio session). Usado nos testes. */
export function isAudioAwake(): boolean {
  return ctx?.state === "running";
}

/**
 * Segura a tela acesa. Vale para a sessão inteira, não só para o descanso: no
 * iPhone, quando a tela bloqueia o WebKit despeja o PWA da memória e ao voltar
 * o app "reinicia" — perdendo cronômetro, descanso e o que estava digitado.
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
