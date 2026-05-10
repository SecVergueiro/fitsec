import { ReactNode } from "react";

export function Eyebrow({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`eyebrow ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
  variant = "default",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "strong" | "ghost";
  onClick?: () => void;
}) {
  const variants = {
    default: {
      background: "var(--surface)",
      border: "0.5px solid var(--border)",
    },
    strong: {
      background: "linear-gradient(135deg, rgba(37, 84, 128, 0.45) 0%, rgba(68, 147, 224, 0.18) 100%)",
      border: "0.5px solid var(--border-strong)",
    },
    ghost: {
      background: "transparent",
      border: "0.5px dashed var(--border-strong)",
    },
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-4 ${className}`}
      style={{
        ...variants[variant],
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  variant = "soft",
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "soft" | "ghost" | "accent";
  className?: string;
}) {
  const variants = {
    primary: { background: "var(--primary)", color: "var(--background)" },
    accent: { background: "var(--accent)", color: "var(--background)" },
    soft: { background: "rgba(152, 181, 210, 0.12)", color: "var(--primary)" },
    ghost: { background: "rgba(237, 238, 239, 0.05)", color: "var(--muted)" },
  };
  return (
    <span
      className={`inline-block px-2 py-[3px] rounded text-xs font-bold ${className}`}
      style={{
        ...variants[variant],
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontSize: "10px",
      }}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1
        className="text-3xl mt-1"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, letterSpacing: "0.01em" }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
