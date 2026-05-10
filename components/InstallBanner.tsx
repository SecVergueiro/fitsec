"use client";

import { useEffect, useState } from "react";

const DISMISSED_KEY = "fitsec_install_dismissed";

// BeforeInstallPromptEvent só existe em Chromium
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    const wasDismissed = localStorage.getItem(DISMISSED_KEY);
    if (wasDismissed) {
      const days = (Date.now() - parseInt(wasDismissed)) / (1000 * 60 * 60 * 24);
      if (days < 14) {
        setDismissed(true);
        return;
      }
    }

    // Chromium: captura o evento e mostra botão custom
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: não dispara beforeinstallprompt. Mostra hint manual.
    if (isIOS()) {
      const t = setTimeout(() => setShowIOSHint(true), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSHint(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      dismiss();
    }
    setDeferredPrompt(null);
  }

  if (dismissed) return null;

  // Banner Chromium
  if (deferredPrompt) {
    return (
      <div
        className="fixed left-3 right-3 z-30 rounded-2xl p-4 scale-in"
        style={{
          bottom: "calc(72px + env(safe-area-inset-bottom))",
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          maxWidth: "calc(28rem - 24px)",
          margin: "0 auto",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ width: 40, height: 40, background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v8m0 0 3-3m-3 3-3-3"/><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm mb-0.5">Instalar FitSec</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Acesso rápido pela tela inicial · funciona offline
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-lg text-sm font-bold"
            style={{ background: "var(--primary)", color: "var(--background)", padding: "10px 14px", minHeight: 40 }}
          >
            Instalar
          </button>
          <button
            onClick={dismiss}
            className="rounded-lg text-sm font-medium"
            style={{ background: "transparent", color: "var(--muted)", padding: "10px 14px", minHeight: 40, border: "0.5px solid var(--border)" }}
          >
            Agora não
          </button>
        </div>
      </div>
    );
  }

  // Banner iOS — instrução manual
  if (showIOSHint) {
    return (
      <div
        className="fixed left-3 right-3 z-30 rounded-2xl p-4 scale-in"
        style={{
          bottom: "calc(72px + env(safe-area-inset-bottom))",
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          maxWidth: "calc(28rem - 24px)",
          margin: "0 auto",
        }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div
            className="rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ width: 40, height: 40, background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v8m0 0 3-3m-3 3-3-3"/><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm mb-0.5">Instalar como app</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Tela inicial · funciona offline · sem barra do navegador
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Fechar"
            style={{ color: "var(--faint)", minHeight: "auto", fontSize: 18, padding: "0 4px", cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div className="text-xs" style={{ color: "var(--muted)", lineHeight: 1.5 }}>
          1. Toque em{" "}
          <span className="inline-flex items-center" style={{ color: "var(--accent)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </span>{" "}
          (compartilhar) na barra inferior do Safari
          <br />
          2. Role e toque em <strong style={{ color: "var(--text)" }}>Adicionar à Tela de Início</strong>
        </div>
      </div>
    );
  }

  return null;
}
