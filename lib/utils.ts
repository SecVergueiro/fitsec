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

// ============================================================
// Strength Standards — comparação 1RM relativa ao peso corporal
// Baseado em strengthlevel.com (média de homens, ajustável)
// Valores são multiplicadores do peso corporal (1RM / BW)
// ============================================================
export type StrengthLevel = "iniciante" | "novato" | "intermediário" | "avançado" | "elite";

interface StrengthTable {
  iniciante: number;
  novato: number;
  intermediário: number;
  avançado: number;
  elite: number;
}

// Multiplicadores 1RM / peso corporal — homem adulto
const STRENGTH_STANDARDS: Record<string, StrengthTable> = {
  // Push
  supino: { iniciante: 0.5, novato: 0.75, intermediário: 1.0, avançado: 1.5, elite: 2.0 },
  desenvolvimento: { iniciante: 0.35, novato: 0.55, intermediário: 0.8, avançado: 1.1, elite: 1.4 },
  // Pull
  remada: { iniciante: 0.5, novato: 0.75, intermediário: 1.0, avançado: 1.4, elite: 1.8 },
  // Legs
  agachamento: { iniciante: 0.75, novato: 1.25, intermediário: 1.5, avançado: 2.25, elite: 2.75 },
  levantamento: { iniciante: 1.0, novato: 1.5, intermediário: 2.0, avançado: 2.75, elite: 3.25 }, // terra
  // Default fallback usa proporção de supino
};

export function getStrengthLevel(
  exerciseName: string,
  e1rm: number,
  bodyweight: number
): { level: StrengthLevel; ratio: number; nextLevel?: StrengthLevel; nextWeight?: number } | null {
  if (!bodyweight || bodyweight <= 0 || !e1rm || e1rm <= 0) return null;

  // Match por nome (heurística simples)
  const name = exerciseName.toLowerCase();
  let table: StrengthTable | null = null;
  if (name.includes("supino")) table = STRENGTH_STANDARDS.supino;
  else if (name.includes("desenvolvimento") || name.includes("militar")) table = STRENGTH_STANDARDS.desenvolvimento;
  else if (name.includes("remada")) table = STRENGTH_STANDARDS.remada;
  else if (name.includes("agachamento") || name.includes("squat")) table = STRENGTH_STANDARDS.agachamento;
  else if (name.includes("terra") || name.includes("deadlift")) table = STRENGTH_STANDARDS.levantamento;
  else return null;

  const ratio = e1rm / bodyweight;
  const levels: { name: StrengthLevel; min: number }[] = [
    { name: "elite", min: table.elite },
    { name: "avançado", min: table.avançado },
    { name: "intermediário", min: table.intermediário },
    { name: "novato", min: table.novato },
    { name: "iniciante", min: table.iniciante },
  ];

  for (let i = 0; i < levels.length; i++) {
    if (ratio >= levels[i].min) {
      const next = levels[i - 1];
      return {
        level: levels[i].name,
        ratio,
        nextLevel: next?.name,
        nextWeight: next ? Math.round(next.min * bodyweight * 10) / 10 : undefined,
      };
    }
  }
  return {
    level: "iniciante",
    ratio,
    nextLevel: "novato",
    nextWeight: Math.round(table.novato * bodyweight * 10) / 10,
  };
}

export const STRENGTH_LEVEL_COLORS: Record<StrengthLevel, string> = {
  iniciante: "#94a3b8",
  novato: "#22c55e",
  intermediário: "#4493e0",
  avançado: "#a78bfa",
  elite: "#fbbf24",
};

// Streak milestones — para celebrar 7, 30, 100 dias
export function getStreakMilestone(streak: number): { reached: number; next: number; label: string } | null {
  const milestones = [
    { value: 365, label: "Lendário" },
    { value: 100, label: "Centenário" },
    { value: 30, label: "Mês completo" },
    { value: 14, label: "Duas semanas" },
    { value: 7, label: "Primeira semana" },
    { value: 3, label: "Começou bem" },
  ];

  let reached = 0;
  let label = "";
  for (const m of milestones) {
    if (streak >= m.value) {
      reached = m.value;
      label = m.label;
      break;
    }
  }
  const nextMilestone = milestones.reverse().find((m) => m.value > streak);
  const next = nextMilestone?.value ?? 999;
  return reached > 0 || streak > 0 ? { reached, next, label } : null;
}
