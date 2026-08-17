-- profiles: PSN-Verknüpfung + DSGVO-Einwilligung (Supabase SQL Editor)
-- Ausführen, wenn Tabelle oder Policies noch nicht existieren.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  psn_id text,
  verification_code text,
  verification_status text not null default 'none',
  verification_requested_at timestamptz,
  datenschutz_einwilligung boolean not null default false,
  eingewilligt_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_verification_status_check check (
    verification_status in ('none', 'pending', 'verifying', 'verified', 'failed')
  )
);

alter table public.profiles
  add column if not exists psn_id text;

alter table public.profiles
  add column if not exists verification_code text;

alter table public.profiles
  add column if not exists verification_status text not null default 'none';

alter table public.profiles
  add column if not exists verification_requested_at timestamptz;

alter table public.profiles
  add column if not exists datenschutz_einwilligung boolean not null default false;

alter table public.profiles
  add column if not exists eingewilligt_am timestamptz;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- PSN-ID pro Account eindeutig (case-insensitive)
create unique index if not exists idx_profiles_psn_id_unique
  on public.profiles (lower(trim(psn_id)))
  where psn_id is not null and trim(psn_id) <> '';

-- Verifizierungscode eindeutig
create unique index if not exists idx_profiles_verification_code_unique
  on public.profiles (verification_code)
  where verification_code is not null;

create index if not exists idx_profiles_verification_status
  on public.profiles (verification_status);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- RPC: Verifizierung anfordern (Backend-Scraper kann verification_requested_at auswerten)
create or replace function public.request_psn_verification()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  if not found then
    return json_build_object('ok', false, 'error', 'Profil nicht gefunden. Bitte zuerst eine PSN-ID registrieren.');
  end if;

  if v_profile.verification_status = 'verified' then
    return json_build_object('ok', false, 'error', 'Dein PSN-Account ist bereits verifiziert.');
  end if;

  if v_profile.verification_status not in ('pending', 'failed') then
    return json_build_object('ok', false, 'error', 'Keine ausstehende Verifizierung vorhanden.');
  end if;

  if v_profile.verification_code is null or trim(v_profile.verification_code) = '' then
    return json_build_object('ok', false, 'error', 'Kein Verifizierungscode vorhanden.');
  end if;

  update public.profiles
  set
    verification_status = 'verifying',
    verification_requested_at = now(),
    updated_at = now()
  where id = auth.uid();

  return json_build_object(
    'ok', true,
    'message', 'Verifizierung wurde gestartet. Wir prüfen dein PSN-Profil in Kürze.'
  );
end;
$$;

grant execute on function public.request_psn_verification() to authenticated;
