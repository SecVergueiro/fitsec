"use client";

import { useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  title?: string;
}

/**
 * Custom dropdown que combina com o tema dark.
 * No mobile abre como bottom sheet, no desktop como modal centralizado.
 * Substitui o <select> nativo que abre picker do sistema (branco no iOS).
 */
export function Select<T extends string>({ value, options, onChange, placeholder, title }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between"
        style={{
          background: "var(--surface)",
          border: "0.5px solid var(--border)",
          borderRadius: 8,
          padding: "10px 12px",
          color: current ? "var(--text)" : "var(--faint)",
          fontSize: 14,
          minHeight: 44,
          outline: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span className="truncate">{current?.label ?? placeholder ?? "Selecionar..."}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--faint)", flexShrink: 0, marginLeft: 8 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(4, 6, 7, 0.82)", backdropFilter: "blur(10px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl scale-in"
            style={{
              background: "var(--background)",
              border: "0.5px solid var(--border-strong)",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div
                className="flex items-center justify-between px-5"
                style={{ paddingTop: 18, paddingBottom: 14, borderBottom: "0.5px solid var(--border)" }}
              >
                <span
                  className="text-xs font-bold"
                  style={{ color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                >
                  {title}
                </span>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  style={{
                    color: "var(--muted)", fontSize: 18, lineHeight: 1,
                    minHeight: 32, width: 32, padding: 0, cursor: "pointer",
                    background: "transparent", border: "none",
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <div className="overflow-auto" style={{ flex: 1 }}>
              {options.map((opt) => {
                const selected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className="w-full flex items-center justify-between tap-feedback"
                    style={{
                      padding: "14px 20px",
                      minHeight: 52,
                      background: selected ? "rgba(68, 147, 224, 0.08)" : "transparent",
                      border: "none",
                      borderBottom: "0.5px solid var(--border)",
                      color: selected ? "var(--accent)" : "var(--text)",
                      fontWeight: selected ? 700 : 500,
                      fontSize: 15,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span>{opt.label}</span>
                    {selected && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
