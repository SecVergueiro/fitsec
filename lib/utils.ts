// Formula de Epley pra estimar 1RM
export function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Tonelagem (volume) de uma serie
export function setTonnage(weight: number, reps: number): number {
  return weight * reps;
}

// Formata kg com 1 casa quando necessario
export function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1);
}

// Formata duracao em "Xh Ym" ou "Y min"
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Formata tonelagem em kg ou ton
export function fmtTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  if (kg < 1) return "0kg";
  return `${Math.round(kg)}kg`;
}

// Formata data relativa em pt-BR ("hoje", "ontem", "ha 3 dias")
export function fmtRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  if (diffDays < 30) return `há ${Math.floor(diffDays / 7)} sem`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// Formata cronometro mm:ss
export function fmtTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Mapeia muscle group enum -> label PT-BR
export const MUSCLE_LABELS: Record<string, string> = {
  peito: "Peito",
  costas: "Costas",
  ombro: "Ombro",
  ombro_anterior: "Ombro ant.",
  ombro_posterior: "Ombro post.",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  quadriceps: "Quadríceps",
  posterior: "Posterior",
  gluteo: "Glúteo",
  panturrilha: "Panturrilha",
  core: "Core",
  lombar: "Lombar",
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  barra: "Barra",
  halter: "Halter",
  maquina: "Máquina",
  cabo: "Cabo",
  peso_corporal: "Peso corporal",
  smith: "Smith",
};

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];

// Iniciais pra avatar do exercicio (max 3 letras)
export function exerciseInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Numero da semana atual relativa a uma data inicial
export function weekNumber(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}
