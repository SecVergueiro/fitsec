"use client";

import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  fullWidth?: boolean;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  type = "button",
  fullWidth = false,
}: ButtonProps) {
  const variants = {
    primary: { background: "var(--primary)", color: "var(--background)", border: "none" },
    secondary: { background: "var(--surface-strong)", color: "var(--primary)", border: "0.5px solid var(--border-strong)" },
    ghost: { background: "transparent", color: "var(--muted)", border: "0.5px solid var(--border)" },
    danger: { background: "rgba(255, 80, 80, 0.1)", color: "#ff8888", border: "0.5px solid rgba(255, 80, 80, 0.3)" },
  };

  const sizes = {
    sm: { padding: "8px 14px", fontSize: "13px", minHeight: "36px" },
    md: { padding: "12px 18px", fontSize: "14px", minHeight: "44px" },
    lg: { padding: "14px 20px", fontSize: "15px", minHeight: "52px" },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-bold transition-opacity ${fullWidth ? "w-full" : ""} ${className}`}
      style={{
        ...variants[variant],
        ...sizes[size],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </button>
  );
}

interface InputProps {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "date";
  inputMode?: "text" | "numeric" | "decimal";
  className?: string;
  autoFocus?: boolean;
  step?: string;
  min?: string | number;
  max?: string | number;
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  className = "",
  autoFocus,
  step,
  min,
  max,
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      autoFocus={autoFocus}
      step={step}
      min={min}
      max={max}
      className={`w-full rounded-lg px-3 py-2.5 text-sm ${className}`}
      style={{
        background: "var(--surface)",
        border: "0.5px solid var(--border)",
        color: "var(--text)",
        outline: "none",
        minHeight: "44px",
      }}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="text-center py-10 px-5 rounded-xl"
      style={{ border: "0.5px dashed var(--border-strong)" }}
    >
      <div className="font-bold mb-1.5" style={{ color: "var(--primary)", fontSize: "15px" }}>
        {title}
      </div>
      <div className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        {description}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="var(--border-strong)"
        strokeWidth="2.5"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
