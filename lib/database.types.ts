// Tipos do banco de dados FitSec
// Mantenha sincronizado com schema.sql + migrations

export type MuscleGroup =
  | "peito"
  | "costas"
  | "ombro"
  | "ombro_anterior"
  | "ombro_posterior"
  | "biceps"
  | "triceps"
  | "antebraco"
  | "quadriceps"
  | "posterior"
  | "gluteo"
  | "panturrilha"
  | "core"
  | "lombar";

export type Equipment =
  | "barra"
  | "halter"
  | "maquina"
  | "cabo"
  | "peso_corporal"
  | "smith";

export type Category = "composto" | "isolador";

export interface Exercise {
  id: string;
  name: string;
  primary_muscle: MuscleGroup;
  secondary_muscles: MuscleGroup[];
  equipment: Equipment | null;
  category: Category;
  notes: string | null;
  is_custom: boolean;
  parent_exercise_id: string | null;
  variation_label: string | null;
  parent_name?: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  split_type: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TemplateDay {
  id: string;
  template_id: string;
  name: string;
  day_order: number;
  weekday: number | null;
  notes: string | null;
  created_at: string;
}

export interface TemplateExercise {
  id: string;
  template_day_id: string;
  exercise_id: string;
  exercise_order: number;
  prescribed_sets: number;
  rep_range_min: number;
  rep_range_max: number;
  target_rir: number;
  rest_seconds: number;
  notes: string | null;
  created_at: string;
  exercise?: Exercise;
}

export interface Mesocycle {
  id: string;
  template_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  total_weeks: number;
  deload_week: number | null;
  goal: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WorkoutSession {
  id: string;
  template_day_id: string | null;
  mesocycle_id: string | null;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  bodyweight_kg: number | null;
  energy_level: number | null;
  notes: string | null;
  custom_name: string | null;
  created_at: string;
}

export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  template_exercise_id: string | null;
  exercise_order: number;
  prescribed_sets: number | null;
  rep_range_min: number | null;
  rep_range_max: number | null;
  target_rir: number | null;
  rest_seconds: number | null;
  is_completed: boolean;
  notes: string | null;
  superset_group: number | null;
  created_at: string;
  exercise?: Exercise;
}

export interface SessionSet {
  id: string;
  session_id: string;
  session_exercise_id: string | null;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rir: number | null;
  is_warmup: boolean;
  is_failure: boolean;
  tempo: string | null;
  notes: string | null;
  performed_at: string;
}

export interface PersonalRecord {
  exercise_id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  e1rm: number;
  performed_at: string;
}

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  weekly_goal: number;
  units: "kg" | "lb";
  current_bodyweight_kg: number | null;
  rest_overrides: Record<string, number>;
  created_at: string;
  updated_at: string;
}
