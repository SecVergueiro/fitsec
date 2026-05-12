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
  core: "Abdômen",
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

// ============================================================
// Volume Landmarks (Renaissance Periodization)
// Séries efetivas por semana por grupo muscular
// MEV  = Minimum Effective Volume (mínimo pra crescer)
// MV   = Maintenance Volume
// MAV  = Maximum Adaptive Volume (zona ótima)
// MRV  = Maximum Recoverable Volume (limite)
// ============================================================
export type VolumeStatus = "abaixo_mev" | "manutencao" | "otimo" | "alto" | "excessivo";

interface VolumeRange {
  mev: number;
  mv: number;
  mav: number;
  mrv: number;
}

export const VOLUME_LANDMARKS: Record<string, VolumeRange> = {
  peito:        { mev: 8,  mv: 12, mav: 18, mrv: 22 },
  costas:       { mev: 10, mv: 14, mav: 20, mrv: 25 },
  ombro:        { mev: 8,  mv: 12, mav: 18, mrv: 26 },
  ombro_anterior:  { mev: 6,  mv: 10, mav: 14, mrv: 20 },
  ombro_posterior: { mev: 8,  mv: 12, mav: 18, mrv: 26 },
  biceps:       { mev: 8,  mv: 12, mav: 18, mrv: 26 },
  triceps:      { mev: 6,  mv: 10, mav: 16, mrv: 22 },
  antebraco:    { mev: 0,  mv: 6,  mav: 12, mrv: 20 },
  quadriceps:   { mev: 8,  mv: 12, mav: 18, mrv: 25 },
  posterior:    { mev: 6,  mv: 10, mav: 14, mrv: 20 },
  gluteo:       { mev: 6,  mv: 10, mav: 14, mrv: 16 },
  panturrilha:  { mev: 8,  mv: 12, mav: 16, mrv: 25 },
  core:         { mev: 0,  mv: 8,  mav: 16, mrv: 25 },
  lombar:       { mev: 0,  mv: 6,  mav: 12, mrv: 18 },
};

export function classifyVolume(muscle: string, setsThisWeek: number): {
  status: VolumeStatus; label: string; color: string; range: VolumeRange
} | null {
  const range = VOLUME_LANDMARKS[muscle];
  if (!range) return null;

  let status: VolumeStatus;
  let label: string;
  let color: string;

  if (setsThisWeek < range.mev) {
    status = "abaixo_mev"; label = "Abaixo do MEV"; color = "#f59e0b";
  } else if (setsThisWeek < range.mv) {
    status = "manutencao"; label = "Manutenção"; color = "#94a3b8";
  } else if (setsThisWeek <= range.mav) {
    status = "otimo"; label = "Ótimo"; color = "#22c55e";
  } else if (setsThisWeek <= range.mrv) {
    status = "alto"; label = "Alto"; color = "#4493e0";
  } else {
    status = "excessivo"; label = "Excessivo"; color = "#ef4444";
  }
  return { status, label, color, range };
}

// ============================================================
// Plateau Detection
// Detecta se um exercício está estagnado: melhor e1RM das últimas
// N sessões não cresceu vs as N sessões anteriores
// ============================================================
export interface PlateauResult {
  isPlateau: boolean;
  weeks: number;
  exerciseId: string;
  exerciseName: string;
  currentE1RM: number;
  bestE1RM: number;
}

export function detectPlateau(
  sets: { exercise_id: string; weight_kg: number; reps: number; performed_at: string; is_warmup: boolean }[],
  exerciseName: string,
  exerciseId: string
): PlateauResult | null {
  const real = sets
    .filter((s) => !s.is_warmup && s.exercise_id === exerciseId)
    .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());

  if (real.length < 6) return null;

  // Agrupa por dia (data simples), pega melhor e1RM por dia
  const byDate: Record<string, number> = {};
  real.forEach((s) => {
    const d = s.performed_at.slice(0, 10);
    const e1 = estimate1RM(s.weight_kg, s.reps);
    byDate[d] = Math.max(byDate[d] ?? 0, e1);
  });

  const sortedDays = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e1]) => ({ date, e1 }));

  if (sortedDays.length < 4) return null;

  // Últimas 3 sessões vs all-time best
  const last3 = sortedDays.slice(-3);
  const currentMax = Math.max(...last3.map((d) => d.e1));
  const bestE1RM = Math.max(...sortedDays.map((d) => d.e1));

  // Se o pico foi há mais de 4 sessões e o current está <= 102% do best, é platô
  const bestIdx = sortedDays.findIndex((d) => d.e1 === bestE1RM);
  const sessionsSinceBest = sortedDays.length - 1 - bestIdx;

  if (sessionsSinceBest >= 3 && currentMax <= bestE1RM * 1.02) {
    // Estima semanas baseado em diferença de datas
    const firstDate = new Date(sortedDays[bestIdx].date);
    const lastDate = new Date(sortedDays[sortedDays.length - 1].date);
    const weeks = Math.round((lastDate.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return {
      isPlateau: true,
      weeks: Math.max(1, weeks),
      exerciseId,
      exerciseName,
      currentE1RM: currentMax,
      bestE1RM,
    };
  }

  return null;
}

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
