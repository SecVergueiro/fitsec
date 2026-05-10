-- =====================================================================
-- FitSec — Migration 003: session_exercises, schema fixes, RLS policies
-- Execute no SQL Editor do Supabase em ordem.
-- =====================================================================

-- =====================================================================
-- 1. Tabela session_exercises (faltava no schema original)
--    Representa cada exercício dentro de uma sessão ativa,
--    copiado dos template_exercises ao iniciar a sessão.
-- =====================================================================
create table if not exists session_exercises (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  template_exercise_id uuid references template_exercises(id) on delete set null,
  exercise_order int not null,
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

-- =====================================================================
-- 2. Coluna completed_at em workout_sessions
--    O código usa completed_at para marcar sessões finalizadas
--    (diferente de ended_at que apenas guarda o horário de fim).
-- =====================================================================
alter table workout_sessions
  add column if not exists completed_at timestamptz;

create index if not exists idx_sessions_completed on workout_sessions(completed_at desc);

-- =====================================================================
-- 3. Coluna session_exercise_id em session_sets
--    Liga cada série ao session_exercise correspondente.
-- =====================================================================
alter table session_sets
  add column if not exists session_exercise_id uuid references session_exercises(id) on delete cascade;

create index if not exists idx_sets_session_exercise on session_sets(session_exercise_id);

-- =====================================================================
-- 4. RLS POLICIES — app single-user sem auth, role anon tem acesso total
--
--    Supabase habilita RLS por default em novas tabelas mas sem policies,
--    o que bloqueia TUDO para o anon. Como não há autenticação,
--    liberamos todas as operações para o anon.
-- =====================================================================

-- exercises
alter table exercises enable row level security;
drop policy if exists "anon_all" on exercises;
create policy "anon_all" on exercises
  for all to anon using (true) with check (true);

-- templates
alter table templates enable row level security;
drop policy if exists "anon_all" on templates;
create policy "anon_all" on templates
  for all to anon using (true) with check (true);

-- template_days
alter table template_days enable row level security;
drop policy if exists "anon_all" on template_days;
create policy "anon_all" on template_days
  for all to anon using (true) with check (true);

-- template_exercises
alter table template_exercises enable row level security;
drop policy if exists "anon_all" on template_exercises;
create policy "anon_all" on template_exercises
  for all to anon using (true) with check (true);

-- mesocycles
alter table mesocycles enable row level security;
drop policy if exists "anon_all" on mesocycles;
create policy "anon_all" on mesocycles
  for all to anon using (true) with check (true);

-- workout_sessions
alter table workout_sessions enable row level security;
drop policy if exists "anon_all" on workout_sessions;
create policy "anon_all" on workout_sessions
  for all to anon using (true) with check (true);

-- session_sets
alter table session_sets enable row level security;
drop policy if exists "anon_all" on session_sets;
create policy "anon_all" on session_sets
  for all to anon using (true) with check (true);

-- session_exercises (nova tabela)
alter table session_exercises enable row level security;
drop policy if exists "anon_all" on session_exercises;
create policy "anon_all" on session_exercises
  for all to anon using (true) with check (true);

-- session_exercise_notes (migration_002)
alter table session_exercise_notes enable row level security;
drop policy if exists "anon_all" on session_exercise_notes;
create policy "anon_all" on session_exercise_notes
  for all to anon using (true) with check (true);
