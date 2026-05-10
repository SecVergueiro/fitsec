-- ============================================================
-- Migration 007: bodyweight no perfil + remove do check-in
-- ============================================================
-- Move peso corporal para user_profiles (atualização manual pelo usuário).
-- Sessions ainda têm o campo (snapshot do peso no dia), mas não pedimos no check-in.
-- ============================================================

alter table user_profiles
  add column if not exists current_bodyweight_kg numeric(5, 2);

comment on column user_profiles.current_bodyweight_kg is
  'Peso corporal atual. Usado em strength standards e auto-preenchido em novas sessões.';

notify pgrst, 'reload schema';
