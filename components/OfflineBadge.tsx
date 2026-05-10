"use client";

import { useOnlineStatus } from "@/lib/use-online-status";

export function OfflineBadge() {
  const { online, pending } = useOnlineStatus();

  // Tudo bem e tudo sincronizado — não mostra nada
  if (online && pending === 0) return null;

  if (!online) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-40 text-xs text-center font-bold"
        style={{
          background: "rgba(239, 68, 68, 0.92)",
          color: "white",
          padding: "calc(env(safe-area-inset-top, 0px) + 6px) 12px 6px 12px",
          letterSpacing: "0.06em",
        }}
      >
        <div className="max-w-md mx-auto flex items-center justify-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
          <span>OFFLINE{pending > 0 ? ` · ${pending} pendente${pending > 1 ? "s" : ""}` : ""}</span>
        </div>
      </div>
    );
  }

  // Online com pendências
  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 text-xs text-center font-bold"
      style={{
        background: "rgba(68, 147, 224, 0.92)",
        color: "white",
        padding: "6px 12px",
        letterSpacing: "0.06em",
      }}
    >
      <div className="max-w-md mx-auto flex items-center justify-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1.2s linear infinite" }}>
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span>SINCRONIZANDO {pending} {pending === 1 ? "ITEM" : "ITENS"}</span>
      </div>
    </div>
  );
}
