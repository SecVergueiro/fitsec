// Manda o descanso para o timer nativo do iPhone, via app Atalhos.
//
// Um PWA não alcança Live Activities (Dynamic Island / card vivo na tela
// bloqueada) — isso é ActivityKit, API nativa. Mas o timer do app Relógio
// aparece exatamente ali, e o app Atalhos pode iniciá-lo por URL scheme. Então
// o FitSec dispara `shortcuts://run-shortcut` no começo do descanso e quem
// mostra a contagem na tela bloqueada é o próprio iOS.
//
// Custa um atalho criado uma vez no iPhone (Receber número da entrada →
// "Iniciar timer") e uma piscada de ~1 s no app Atalhos ao iniciar o descanso.
// Por isso vem desligado: quem quer, liga no Perfil.
"use client";

const ENABLED_KEY = "fitsec_ios_timer_v1";
const NAME_KEY = "fitsec_ios_timer_name_v1";

/** Nome padrão do atalho no iPhone — precisa bater exatamente com o que o usuário criou. */
export const DEFAULT_SHORTCUT_NAME = "Descanso";

export function isIosTimerEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setIosTimerEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage bloqueado */
  }
}

export function getShortcutName(): string {
  if (typeof window === "undefined") return DEFAULT_SHORTCUT_NAME;
  try {
    return window.localStorage.getItem(NAME_KEY)?.trim() || DEFAULT_SHORTCUT_NAME;
  } catch {
    return DEFAULT_SHORTCUT_NAME;
  }
}

export function setShortcutName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAME_KEY, name.trim() || DEFAULT_SHORTCUT_NAME);
  } catch {
    /* storage bloqueado */
  }
}

/**
 * URL que o app Atalhos entende. `input=text&text=<segundos>` chega no atalho
 * como "Entrada do atalho", que o passo "Iniciar timer" consome.
 */
export function buildShortcutUrl(seconds: number, name: string = DEFAULT_SHORTCUT_NAME): string {
  const secs = Math.max(1, Math.round(seconds));
  return `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${secs}`;
}

/** true se parece um iPhone/iPad — o atalho não existe em outro lugar. */
export function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

/**
 * Dispara o timer nativo. Devolve false quando nem tentou (desligado, fora do
 * iPhone, sem window) — assim quem chama sabe que o descanso segue só no app.
 */
export function startIosTimer(seconds: number, force = false): boolean {
  if (typeof window === "undefined") return false;
  if (!force && !isIosTimerEnabled()) return false;
  if (!force && !isApple()) return false;
  try {
    window.location.href = buildShortcutUrl(seconds, getShortcutName());
    return true;
  } catch {
    return false;
  }
}
