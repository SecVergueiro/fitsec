-- ============================================================
-- Migration 005: Supersets
-- ============================================================
-- Adiciona coluna superset_group em session_exercises.
-- Exercícios com o mesmo valor pertencem ao mesmo superset.
-- NULL = exercício solo (default).
-- ============================================================

alter table session_exercises
  add column if not exists superset_group smallint;

comment on column session_exercises.superset_group is
  'Exercícios com mesmo número pertencem ao mesmo superset. NULL = solo.';

-- Index para queries por superset_group
create index if not exists idx_session_exercises_superset
  on session_exercises (session_id, superset_group)
  where superset_group is not null;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
