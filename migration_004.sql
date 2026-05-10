-- =====================================================================
-- FitSec — Migration 004: Multi-user Auth
--
-- O QUE ESSA MIGRATION FAZ:
--   1. Adiciona user_id em todas as tabelas de dados pessoais
--   2. Adiciona is_public em workout_sessions (para link de compartilhamento)
--   3. Dropa as policies antigas (anon_all) que davam acesso total
--   4. Cria novas RLS policies: cada usuário só vê e mexe nos seus dados
--   5. Recreia as views com security_invoker para respeitar RLS
--
-- PRÉ-REQUISITO: habilite o Auth no painel do Supabase antes de rodar.
--   Dashboard → Authentication → Providers → Email → Enable
--
-- ORDEM DE EXECUÇÃO:
--   Passo 1: Execute TODO este arquivo no SQL Editor
--   Passo 2: Crie sua conta pelo novo login do app
--   Passo 3: Copie seu user_id (aparece no Supabase → Auth → Users)
--   Passo 4: Execute o bloco de MIGRAÇÃO DOS DADOS no final deste arquivo
--            substituindo 'SEU-USER-ID-AQUI' pelo seu UUID real
-- =====================================================================


-- =====================================================================
-- PASSO 1 — ADICIONAR user_id NAS TABELAS
-- =====================================================================

-- templates (cada usuário tem seus próprios templates)
alter table templates
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- mesocycles (pertence ao usuário)
alter table mesocycles
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- workout_sessions (pertence ao usuário)
alter table workout_sessions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- workout_sessions: flag para link público (compartilhamento de treino)
alter table workout_sessions
  add column if not exists is_public boolean default false;

-- exercises: apenas exercícios customizados têm user_id
-- (a biblioteca global is_custom=false é compartilhada entre todos)
alter table exercises
  add column if not exists user_id uuid references auth.users(id) on delete cascade;


-- =====================================================================
-- PASSO 2 — ÍNDICES PARA PERFORMANCE
-- =====================================================================

create index if not exists idx_templates_user      on templates(user_id);
create index if not exists idx_mesocycles_user     on mesocycles(user_id);
create index if not exists idx_sessions_user       on workout_sessions(user_id);
create index if not exists idx_sessions_is_public  on workout_sessions(is_public) where is_public = true;
create index if not exists idx_exercises_user      on exercises(user_id);


-- =====================================================================
-- PASSO 3 — DROPAR POLICIES ANTIGAS (anon_all)
-- =====================================================================

drop policy if exists "anon_all" on exercises;
drop policy if exists "anon_all" on templates;
drop policy if exists "anon_all" on template_days;
drop policy if exists "anon_all" on template_exercises;
drop policy if exists "anon_all" on mesocycles;
drop policy if exists "anon_all" on workout_sessions;
drop policy if exists "anon_all" on session_exercises;
drop policy if exists "anon_all" on session_sets;
drop policy if exists "anon_all" on session_exercise_notes;


-- =====================================================================
-- PASSO 4 — NOVAS RLS POLICIES
-- =====================================================================

-- ── exercises ────────────────────────────────────────────────────────
-- Exercícios globais: qualquer usuário autenticado pode ler
-- Exercícios customizados: só o dono lê/escreve/deleta
alter table exercises enable row level security;

create policy "exercises_global_read" on exercises
  for select to authenticated
  using (is_custom = false OR user_id = auth.uid());

create policy "exercises_custom_insert" on exercises
  for insert to authenticated
  with check (is_custom = true and user_id = auth.uid());

create policy "exercises_custom_update" on exercises
  for update to authenticated
  using (is_custom = true and user_id = auth.uid())
  with check (is_custom = true and user_id = auth.uid());

create policy "exercises_custom_delete" on exercises
  for delete to authenticated
  using (is_custom = true and user_id = auth.uid());


-- ── templates ────────────────────────────────────────────────────────
alter table templates enable row level security;

create policy "templates_user_all" on templates
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── template_days ────────────────────────────────────────────────────
-- Acesso via join com templates (dono do template = dono dos dias)
alter table template_days enable row level security;

create policy "template_days_user_all" on template_days
  for all to authenticated
  using (
    exists (
      select 1 from templates t
      where t.id = template_days.template_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from templates t
      where t.id = template_days.template_id
        and t.user_id = auth.uid()
    )
  );


-- ── template_exercises ───────────────────────────────────────────────
-- Acesso via join com template_days → templates
alter table template_exercises enable row level security;

create policy "template_exercises_user_all" on template_exercises
  for all to authenticated
  using (
    exists (
      select 1 from template_days td
      join templates t on t.id = td.template_id
      where td.id = template_exercises.template_day_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from template_days td
      join templates t on t.id = td.template_id
      where td.id = template_exercises.template_day_id
        and t.user_id = auth.uid()
    )
  );


-- ── mesocycles ───────────────────────────────────────────────────────
alter table mesocycles enable row level security;

create policy "mesocycles_user_all" on mesocycles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── workout_sessions ─────────────────────────────────────────────────
-- Usuário gerencia os seus; sessões públicas podem ser lidas por qualquer um
alter table workout_sessions enable row level security;

create policy "sessions_user_all" on workout_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Leitura pública (página de compartilhamento /public/sessao/[id])
-- Qualquer pessoa com o link pode ver sessões marcadas como públicas
create policy "sessions_public_read" on workout_sessions
  for select
  using (is_public = true);


-- ── session_exercises ────────────────────────────────────────────────
alter table session_exercises enable row level security;

create policy "session_exercises_user_all" on session_exercises
  for all to authenticated
  using (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercises.session_id
        and ws.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercises.session_id
        and ws.user_id = auth.uid()
    )
  );

-- Leitura pública para sessões compartilhadas
create policy "session_exercises_public_read" on session_exercises
  for select
  using (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercises.session_id
        and ws.is_public = true
    )
  );


-- ── session_sets ─────────────────────────────────────────────────────
alter table session_sets enable row level security;

create policy "session_sets_user_all" on session_sets
  for all to authenticated
  using (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_sets.session_id
        and ws.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_sets.session_id
        and ws.user_id = auth.uid()
    )
  );

-- Leitura pública para sessões compartilhadas
create policy "session_sets_public_read" on session_sets
  for select
  using (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_sets.session_id
        and ws.is_public = true
    )
  );


-- ── session_exercise_notes ───────────────────────────────────────────
alter table session_exercise_notes enable row level security;

create policy "session_notes_user_all" on session_exercise_notes
  for all to authenticated
  using (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercise_notes.session_id
        and ws.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workout_sessions ws
      where ws.id = session_exercise_notes.session_id
        and ws.user_id = auth.uid()
    )
  );


-- =====================================================================
-- PASSO 5 — RECREAR VIEWS COM security_invoker
-- (garante que as views respeitem o RLS do usuário logado)
-- =====================================================================

create or replace view set_estimated_1rm
  with (security_invoker = on)
as
select
  s.id,
  s.session_id,
  s.exercise_id,
  s.weight_kg,
  s.reps,
  s.performed_at,
  round(s.weight_kg * (1 + s.reps::numeric / 30), 2) as e1rm
from session_sets s
where s.is_warmup = false;

create or replace view personal_records
  with (security_invoker = on)
as
select distinct on (exercise_id)
  exercise_id,
  weight_kg,
  reps,
  e1rm,
  performed_at
from set_estimated_1rm
order by exercise_id, e1rm desc;

create or replace view weekly_volume
  with (security_invoker = on)
as
select
  date_trunc('week', s.performed_at)::date as week_start,
  e.primary_muscle,
  count(*) as total_sets,
  sum(s.weight_kg * s.reps) as total_tonnage_kg
from session_sets s
join exercises e on e.id = s.exercise_id
where s.is_warmup = false
group by 1, 2
order by 1 desc, 2;

create or replace view exercises_with_parent
  with (security_invoker = on)
as
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


-- =====================================================================
-- PASSO 6 — MIGRAÇÃO DOS DADOS EXISTENTES
--
-- Execute DEPOIS de criar sua conta no app.
-- Substitua 'SEU-USER-ID-AQUI' pelo seu UUID real.
-- Você encontra o UUID em: Supabase Dashboard → Auth → Users
--
-- ATENÇÃO: execute UM bloco por vez e confirme que funcionou.
-- =====================================================================

/*

-- Substitua em todos os lugares abaixo:
do $$
declare
  meu_user_id uuid := 'SEU-USER-ID-AQUI';
begin

  -- Seus templates
  update templates
  set user_id = meu_user_id
  where user_id is null;

  -- Seus mesociclos
  update mesocycles
  set user_id = meu_user_id
  where user_id is null;

  -- Suas sessões de treino
  update workout_sessions
  set user_id = meu_user_id
  where user_id is null;

  -- Seus exercícios customizados
  update exercises
  set user_id = meu_user_id
  where is_custom = true and user_id is null;

  raise notice 'Dados migrados com sucesso para o usuário %', meu_user_id;
end;
$$;

*/

-- =====================================================================
-- PASSO 7 (OPCIONAL) — TORNAR user_id NOT NULL
-- Execute APENAS depois de rodar o bloco de migração acima
-- e confirmar que nenhuma linha ficou com user_id null nas tabelas
-- de dados pessoais.
-- =====================================================================

/*

-- Verificar antes de aplicar NOT NULL:
select 'templates'        as tabela, count(*) as sem_user from templates        where user_id is null
union all
select 'mesocycles',               count(*) from mesocycles               where user_id is null
union all
select 'workout_sessions',         count(*) from workout_sessions         where user_id is null;

-- Se todos zerados, aplique:
alter table templates        alter column user_id set not null;
alter table mesocycles       alter column user_id set not null;
alter table workout_sessions alter column user_id set not null;

*/
