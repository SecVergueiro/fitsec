-- =====================================================================
-- FitSec — Migration 003: estrutura para sessao ao vivo
-- Rode no SQL Editor do Supabase APOS migration_002.sql
-- =====================================================================

-- 1. session_exercises: rastreia quais exercicios estao em uma sessao
--    Pode vir do template OU ser adicionado extra durante o treino.
create table if not exists session_exercises (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  template_exercise_id uuid references template_exercises(id) on delete set null,
  exercise_order int not null,
  -- Snapshot da prescricao no momento da sessao (pode ser ajustada por sessao)
  prescribed_sets int,
  rep_range_min int,
  rep_range_max int,
  target_rir int,
  rest_seconds int,
  is_completed boolean default false,
  notes text,
  created_at timestamptz default now()
);

create index if not exists idx_session_exercises_session on session_exercises(session_id);
create index if not exists idx_session_exercises_exercise on session_exercises(exercise_id);

-- 2. Vincula session_sets a session_exercises (em vez de soltos)
alter table session_sets
  add column if not exists session_exercise_id uuid references session_exercises(id) on delete cascade;

create index if not exists idx_sets_session_exercise on session_sets(session_exercise_id);

-- 3. Adiciona campo "completed_at" na sessao pra cronometrar duracao corretamente
alter table workout_sessions
  add column if not exists completed_at timestamptz;

-- 4. View atualizada para PRs por exercicio com data
create or replace view personal_records as
select distinct on (s.exercise_id)
  s.exercise_id,
  e.name as exercise_name,
  s.weight_kg,
  s.reps,
  round(s.weight_kg * (1 + s.reps::numeric / 30), 1) as e1rm,
  s.performed_at
from session_sets s
join exercises e on e.id = s.exercise_id
where s.is_warmup = false
order by s.exercise_id, (s.weight_kg * (1 + s.reps::numeric / 30)) desc;
