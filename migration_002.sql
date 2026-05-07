-- =====================================================================
-- FitSec — Migration 002: variações, tempo, notas por exercício
-- Rode no SQL Editor do Supabase APÓS o schema.sql inicial.
-- =====================================================================

-- 1. Suporte a variações de exercício (relação self-referencing)
alter table exercises
  add column if not exists parent_exercise_id uuid references exercises(id) on delete set null,
  add column if not exists variation_label text;

create index if not exists idx_exercises_parent on exercises(parent_exercise_id);

-- 2. Marcador opcional pra distinguir exercícios criados pelo usuário
alter table exercises
  add column if not exists is_custom boolean default false;

-- 3. Tempo de execução por série (cadência: ex "3-1-1-0")
alter table session_sets
  add column if not exists tempo text;

-- 4. Notas livres por exercício dentro de uma sessão
--    (separado das notas de série individual — útil pra "ombro travando hoje")
create table if not exists session_exercise_notes (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  notes text not null,
  created_at timestamptz default now()
);

create index if not exists idx_sen_session on session_exercise_notes(session_id);

-- 5. View útil: exercícios com info do pai (pra montar a Biblioteca)
create or replace view exercises_with_parent as
select
  e.id,
  e.name,
  e.primary_muscle,
  e.secondary_muscles,
  e.equipment,
  e.category,
  e.notes,
  e.is_custom,
  e.parent_exercise_id,
  e.variation_label,
  p.name as parent_name,
  e.created_at
from exercises e
left join exercises p on p.id = e.parent_exercise_id;

-- 6. Exemplo: como adicionar uma variação manualmente
--    (não execute, só pra referência)
--
-- insert into exercises (name, primary_muscle, equipment, category, parent_exercise_id, variation_label, is_custom)
-- select
--   'Supino inclinado smith',
--   'peito',
--   'maquina',
--   'composto',
--   id,
--   'smith',
--   true
-- from exercises where name = 'Supino inclinado com halteres';
