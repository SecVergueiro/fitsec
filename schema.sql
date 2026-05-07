-- =====================================================================
-- LIFTLOG — Schema do banco de dados
-- Single-user, sem auth. Hospedado no Supabase.
-- =====================================================================

-- Extensões úteis
create extension if not exists "uuid-ossp";

-- =====================================================================
-- 1. EXERCISES — biblioteca de exercícios
-- =====================================================================
create table exercises (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  primary_muscle text not null,           -- ex: 'peito', 'costas', 'quadriceps'
  secondary_muscles text[] default '{}',  -- ex: ['triceps', 'ombro_anterior']
  equipment text,                         -- 'barra', 'halter', 'maquina', 'cabo', 'peso_corporal'
  category text not null,                 -- 'composto' ou 'isolador'
  notes text,                             -- dicas de execução
  created_at timestamptz default now()
);

create index idx_exercises_muscle on exercises(primary_muscle);

-- =====================================================================
-- 2. TEMPLATES — fichas de treino (UL+PPL, ABC, etc.)
-- =====================================================================
create table templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  split_type text,  -- 'UL+PPL', 'ABC', 'Full Body', etc.
  is_active boolean default true,  -- template "atual" do usuário
  created_at timestamptz default now()
);

-- =====================================================================
-- 3. TEMPLATE_DAYS — dias dentro de um template (Upper, Lower, Push...)
-- =====================================================================
create table template_days (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references templates(id) on delete cascade,
  name text not null,                    -- 'Upper', 'Lower', 'Push', etc.
  day_order int not null,                -- 1, 2, 3, 4, 5
  weekday int,                           -- 1=seg, 2=ter, ..., 7=dom (opcional)
  notes text,
  created_at timestamptz default now()
);

create index idx_template_days_template on template_days(template_id);

-- =====================================================================
-- 4. TEMPLATE_EXERCISES — exercícios prescritos em cada dia
-- =====================================================================
create table template_exercises (
  id uuid primary key default uuid_generate_v4(),
  template_day_id uuid not null references template_days(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  exercise_order int not null,
  prescribed_sets int not null,          -- ex: 4
  rep_range_min int not null,            -- ex: 6
  rep_range_max int not null,            -- ex: 8
  target_rir int default 2,              -- reps in reserve alvo
  rest_seconds int default 120,          -- descanso prescrito
  notes text,
  created_at timestamptz default now()
);

create index idx_template_exercises_day on template_exercises(template_day_id);

-- =====================================================================
-- 5. MESOCYCLES — blocos de periodização (ex: "Bloco 1 - 8 semanas")
-- =====================================================================
create table mesocycles (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references templates(id) on delete cascade,
  name text not null,                    -- 'Bloco 1 — Recomp Nov/2025'
  start_date date not null,
  end_date date,                         -- pode ser null se ainda em andamento
  total_weeks int not null,              -- ex: 8 (sendo a última deload)
  deload_week int,                       -- semana de deload (ex: 8)
  goal text,                             -- 'recomposição', 'hipertrofia', etc.
  notes text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- =====================================================================
-- 6. WORKOUT_SESSIONS — sessões executadas de fato
-- =====================================================================
create table workout_sessions (
  id uuid primary key default uuid_generate_v4(),
  template_day_id uuid references template_days(id) on delete set null,
  mesocycle_id uuid references mesocycles(id) on delete set null,
  session_date date not null default current_date,
  started_at timestamptz default now(),
  ended_at timestamptz,
  duration_minutes int,                  -- pode calcular a partir de started/ended
  bodyweight_kg numeric(5,2),            -- peso corporal nesse dia (opcional)
  energy_level int,                      -- 1-5: como tava se sentindo
  notes text,
  created_at timestamptz default now()
);

create index idx_sessions_date on workout_sessions(session_date desc);
create index idx_sessions_meso on workout_sessions(mesocycle_id);

-- =====================================================================
-- 7. SESSION_SETS — cada série executada (a tabela mais importante!)
-- =====================================================================
create table session_sets (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_number int not null,               -- 1ª, 2ª, 3ª série...
  weight_kg numeric(6,2) not null,
  reps int not null,
  rir int,                               -- reps in reserve real
  is_warmup boolean default false,
  is_failure boolean default false,
  notes text,
  performed_at timestamptz default now()
);

create index idx_sets_session on session_sets(session_id);
create index idx_sets_exercise on session_sets(exercise_id, performed_at desc);

-- =====================================================================
-- 8. VIEW: estimated_1rm — calcula 1RM estimado de cada série (Epley)
-- =====================================================================
create or replace view set_estimated_1rm as
select
  s.id,
  s.session_id,
  s.exercise_id,
  s.weight_kg,
  s.reps,
  s.performed_at,
  -- Fórmula de Epley: 1RM = peso * (1 + reps/30)
  round(s.weight_kg * (1 + s.reps::numeric / 30), 2) as e1rm
from session_sets s
where s.is_warmup = false;

-- =====================================================================
-- 9. VIEW: personal_records — melhor e1RM por exercício
-- =====================================================================
create or replace view personal_records as
select distinct on (exercise_id)
  exercise_id,
  weight_kg,
  reps,
  e1rm,
  performed_at
from set_estimated_1rm
order by exercise_id, e1rm desc;

-- =====================================================================
-- 10. VIEW: weekly_volume — volume semanal por grupo muscular
-- =====================================================================
create or replace view weekly_volume as
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

-- =====================================================================
-- SEED: exercícios básicos da biblioteca
-- =====================================================================
insert into exercises (name, primary_muscle, secondary_muscles, equipment, category) values
  -- Peito
  ('Supino reto com barra', 'peito', array['triceps','ombro_anterior'], 'barra', 'composto'),
  ('Supino inclinado com halteres', 'peito', array['triceps','ombro_anterior'], 'halter', 'composto'),
  ('Crucifixo na máquina (peck deck)', 'peito', array[]::text[], 'maquina', 'isolador'),
  ('Crossover no cabo', 'peito', array[]::text[], 'cabo', 'isolador'),

  -- Costas
  ('Barra fixa', 'costas', array['biceps'], 'peso_corporal', 'composto'),
  ('Puxada alta na polia', 'costas', array['biceps'], 'cabo', 'composto'),
  ('Pulldown pegada neutra', 'costas', array['biceps'], 'cabo', 'composto'),
  ('Remada curvada com barra', 'costas', array['biceps','ombro_posterior'], 'barra', 'composto'),
  ('Remada cavalinho (T-bar)', 'costas', array['biceps'], 'maquina', 'composto'),
  ('Remada baixa', 'costas', array['biceps'], 'cabo', 'composto'),
  ('Crucifixo invertido (peck deck inverso)', 'ombro_posterior', array['costas'], 'maquina', 'isolador'),

  -- Ombros
  ('Desenvolvimento militar com barra', 'ombro', array['triceps'], 'barra', 'composto'),
  ('Desenvolvimento Arnold', 'ombro', array['triceps'], 'halter', 'composto'),
  ('Desenvolvimento na máquina', 'ombro', array['triceps'], 'maquina', 'composto'),
  ('Elevação lateral com halteres', 'ombro', array[]::text[], 'halter', 'isolador'),
  ('Elevação lateral na polia', 'ombro', array[]::text[], 'cabo', 'isolador'),

  -- Braços
  ('Rosca direta com barra W', 'biceps', array[]::text[], 'barra', 'isolador'),
  ('Rosca alternada com halter', 'biceps', array[]::text[], 'halter', 'isolador'),
  ('Rosca martelo', 'biceps', array['antebraco'], 'halter', 'isolador'),
  ('Rosca inversa', 'antebraco', array['biceps'], 'barra', 'isolador'),
  ('Tríceps na polia (corda)', 'triceps', array[]::text[], 'cabo', 'isolador'),
  ('Tríceps testa', 'triceps', array[]::text[], 'barra', 'isolador'),
  ('Tríceps francês', 'triceps', array[]::text[], 'halter', 'isolador'),
  ('Mergulho na máquina', 'triceps', array['peito'], 'maquina', 'composto'),

  -- Pernas
  ('Agachamento livre', 'quadriceps', array['gluteo','posterior'], 'barra', 'composto'),
  ('Hack squat', 'quadriceps', array['gluteo'], 'maquina', 'composto'),
  ('Leg press 45°', 'quadriceps', array['gluteo','posterior'], 'maquina', 'composto'),
  ('Cadeira extensora', 'quadriceps', array[]::text[], 'maquina', 'isolador'),
  ('Stiff', 'posterior', array['gluteo','lombar'], 'barra', 'composto'),
  ('Levantamento terra romeno (RDL)', 'posterior', array['gluteo','lombar'], 'barra', 'composto'),
  ('Mesa flexora', 'posterior', array[]::text[], 'maquina', 'isolador'),
  ('Cadeira flexora sentada', 'posterior', array[]::text[], 'maquina', 'isolador'),
  ('Avanço (afundo) com halteres', 'quadriceps', array['gluteo','posterior'], 'halter', 'composto'),
  ('Agachamento búlgaro', 'quadriceps', array['gluteo'], 'halter', 'composto'),
  ('Elevação pélvica (hip thrust)', 'gluteo', array['posterior'], 'barra', 'composto'),
  ('Panturrilha em pé', 'panturrilha', array[]::text[], 'maquina', 'isolador'),
  ('Panturrilha sentado', 'panturrilha', array[]::text[], 'maquina', 'isolador'),

  -- Core
  ('Abdominal infra (elevação de pernas)', 'core', array[]::text[], 'peso_corporal', 'isolador'),
  ('Prancha abdominal', 'core', array[]::text[], 'peso_corporal', 'isolador'),

  -- Cadeia posterior pesado
  ('Levantamento terra convencional', 'posterior', array['costas','gluteo','lombar'], 'barra', 'composto');
