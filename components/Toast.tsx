"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error" | "warning" | "pr";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    pr: (message: string) => void;
    undo: (message: string, onUndo: () => void) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const addToast = useCallback((message: string, variant: ToastVariant, duration = 3500, action?: { label: string; onClick: () => void }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-2), { id, message, variant, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => setConfirmState({ options, resolve })),
    []
  );

  const contextValue = useMemo(
    () => ({
      toast: {
        success: (message: string) => addToast(message, "success"),
        error: (message: string) => addToast(message, "error"),
        warning: (message: string) => addToast(message, "warning"),
        pr: (message: string) => addToast(message, "pr", 5000),
        undo: (message: string, onUndo: () => void) =>
          addToast(message, "warning", 4500, { label: "Desfazer", onClick: onUndo }),
      },
      confirm,
    }),
    [addToast, confirm]
  );

  function resolve(value: boolean) {
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Toast stack — above BottomNav */}
      <div
        className="fixed left-0 right-0 z-50 flex flex-col gap-2 items-center pointer-events-none"
        style={{ bottom: "88px", padding: "0 20px" }}
      >
        {toasts.map((t) => (
          <ToastBubble
            key={t.id}
            toast={t}
            onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          />
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <ConfirmDialog
          options={confirmState.options}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de ToastProvider");
  return ctx.toast;
}

export function useConfirm() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useConfirm deve ser usado dentro de ToastProvider");
  return ctx.confirm;
}

// ─── Toast bubble ──────────────────────────────────────────────────────────

const VARIANTS: Record<ToastVariant, { bg: string; color: string; border: string; icon: string }> = {
  success: {
    bg: "rgba(34, 197, 94, 0.10)",
    color: "#4ade80",
    border: "0.5px solid rgba(34, 197, 94, 0.28)",
    icon: "✓",
  },
  error: {
    bg: "rgba(255, 80, 80, 0.10)",
    color: "#ff8888",
    border: "0.5px solid rgba(255, 80, 80, 0.28)",
    icon: "✕",
  },
  warning: {
    bg: "rgba(251, 191, 36, 0.10)",
    color: "#fbbf24",
    border: "0.5px solid rgba(251, 191, 36, 0.28)",
    icon: "!",
  },
  pr: {
    bg: "rgba(251, 191, 36, 0.14)",
    color: "#fbbf24",
    border: "0.5px solid rgba(251, 191, 36, 0.42)",
    icon: "★",
  },
};

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const v = VARIANTS[toast.variant];
  const isPR = toast.variant === "pr";

  return (
    <div
      className="w-full max-w-md rounded-xl px-4 flex items-center gap-3 text-sm font-medium pointer-events-auto fade-in"
      style={{
        background: v.bg,
        color: v.color,
        border: v.border,
        backdropFilter: "blur(16px)",
        boxShadow: isPR
          ? "0 4px 28px rgba(251, 191, 36, 0.18), 0 2px 8px rgba(0,0,0,0.5)"
          : "0 4px 24px rgba(0,0,0,0.5)",
        paddingTop: isPR ? "14px" : "12px",
        paddingBottom: isPR ? "14px" : "12px",
      }}
    >
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-full"
        style={{
          width: isPR ? "22px" : "18px",
          height: isPR ? "22px" : "18px",
          fontSize: isPR ? "11px" : "10px",
          fontWeight: "bold",
          background: v.color,
          color: "#040607",
          flexShrink: 0,
        }}
      >
        {isPR ? (
          <StarIcon />
        ) : (
          v.icon
        )}
      </span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onDismiss(); }}
          className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-md"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: v.color,
            border: `0.5px solid ${v.color}`,
            minHeight: "auto",
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#040607">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

// ─── Confirm dialog ─────────────────────────────────────────────────────────

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(4, 6, 7, 0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 fade-in"
        style={{
          background: "var(--background)",
          border: "0.5px solid var(--border-strong)",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <h2 className="text-lg font-bold mb-2">{options.title}</h2>
        {options.message && (
          <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
            {options.message}
          </p>
        )}
        {!options.message && <div className="mb-4" />}
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer"
            style={
              options.danger
                ? {
                    background: "rgba(255, 80, 80, 0.12)",
                    color: "#ff8888",
                    border: "0.5px solid rgba(255, 80, 80, 0.3)",
                  }
                : {
                    background: "var(--primary)",
                    color: "var(--background)",
                  }
            }
          >
            {options.confirmLabel ?? "Confirmar"}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer"
            style={{
              background: "var(--surface-strong)",
              color: "var(--muted)",
              border: "0.5px solid var(--border)",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
