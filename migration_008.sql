-- ============================================================
-- Migration 008: Custom name em workout_sessions
-- ============================================================
-- Permite renomear o treino ("Treino livre" → "Push 1B", etc).
-- NULL = usa nome do template_day ou fallback "Treino livre".
-- ============================================================

alter table workout_sessions
  add column if not exists custom_name text;

comment on column workout_sessions.custom_name is
  'Nome custom da sessão. Sobrepõe template_day name quando preenchido.';

notify pgrst, 'reload schema';
