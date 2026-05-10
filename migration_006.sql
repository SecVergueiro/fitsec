-- ============================================================
-- Migration 006: user_profiles
-- ============================================================
-- Move preferências do localStorage para o banco para sincronizar
-- entre dispositivos. Cria profile automaticamente no signup.
-- ============================================================

create table if not exists user_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  display_name   text,
  weekly_goal    smallint default 4 check (weekly_goal between 1 and 14),
  units          text default 'kg' check (units in ('kg', 'lb')),
  rest_overrides jsonb default '{}'::jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- RLS — cada usuário só vê e edita o próprio profile
alter table user_profiles enable row level security;

drop policy if exists "users_can_read_own_profile" on user_profiles;
create policy "users_can_read_own_profile"
  on user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_profile" on user_profiles;
create policy "users_can_insert_own_profile"
  on user_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_profile" on user_profiles;
create policy "users_can_update_own_profile"
  on user_profiles for update
  using (auth.uid() = user_id);

-- Trigger: ao criar usuário no auth.users, cria o profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: atualiza updated_at em updates
create or replace function public.touch_user_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on user_profiles;
create trigger user_profiles_touch_updated_at
  before update on user_profiles
  for each row execute function public.touch_user_profile_updated_at();

-- Backfill: cria profile para usuários que já existem
insert into user_profiles (user_id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
from auth.users
where id not in (select user_id from user_profiles)
on conflict do nothing;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
