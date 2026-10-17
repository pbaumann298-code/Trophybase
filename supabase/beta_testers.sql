-- =============================================================================
-- Beta-Tester-Zugänge (trophybase.app/beta)
-- =============================================================================
-- Ablauf:
--   1. Dieses Script im Supabase-SQL-Editor ausführen.
--   2. Keys erzeugen:  select * from public.tb_generate_beta_tester('Notiz');
--   3. Tester_ID + Passwort an den Tester geben.
--   4. Auf /beta einlösen → Client legt Auth-User an bzw. loggt ein und markiert den Slot.
--
-- Format Tester-ID: Tester_ + genau 5 alphanumerische Zeichen (z. B. Tester_A9k2M)
-- =============================================================================

begin;

create table if not exists public.beta_testers (
  id uuid primary key default gen_random_uuid(),
  tester_id text not null,
  access_password text not null,
  is_used boolean not null default false,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint beta_testers_tester_id_format
    check (tester_id ~ '^Tester_[A-Za-z0-9]{5}$'),
  constraint beta_testers_tester_id_unique unique (tester_id)
);

create index if not exists beta_testers_is_used_idx
  on public.beta_testers (is_used);

comment on table public.beta_testers is
  'Einmal-Zugänge für /beta: Tester_ID + Passwort. Kein Direktzugriff für anon/authenticated.';

-- ---------------------------------------------------------------------------
-- Kein öffentliches Lesen/Schreiben – nur SECURITY DEFINER Funktionen
-- ---------------------------------------------------------------------------
alter table public.beta_testers enable row level security;

drop policy if exists beta_testers_admin_all on public.beta_testers;
-- Admins mit service_role / Dashboard umgehen RLS ohnehin.
-- Explizit keine Policies für anon/authenticated → kein Client-SELECT.

revoke all on table public.beta_testers from anon, authenticated;
grant select, insert, update, delete on table public.beta_testers to service_role;

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
create or replace function public.tb_normalize_beta_tester_id(p_tester_id text)
returns text
language sql
immutable
as $$
  select trim(p_tester_id);
$$;

create or replace function public.tb_beta_tester_email(p_tester_id text)
returns text
language sql
immutable
as $$
  -- Tester_A9k2M → tester_a9k2m@beta.trophybase.app
  select lower(public.tb_normalize_beta_tester_id(p_tester_id)) || '@beta.trophybase.app';
$$;

-- ---------------------------------------------------------------------------
-- Key erzeugen (im SQL-Editor als Admin / service_role)
-- ---------------------------------------------------------------------------
create or replace function public.tb_generate_beta_tester(p_note text default null)
returns table (tester_id text, access_password text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suffix text;
  v_tester_id text;
  v_password text;
  v_tries int := 0;
begin
  loop
    v_tries := v_tries + 1;
    if v_tries > 20 then
      raise exception 'Konnte keine eindeutige Tester-ID erzeugen';
    end if;

    -- 5 Zeichen aus Hex (ohne Verwechslung O/0 möglichst vermeiden → Base32-ähnlich)
    v_suffix := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 5));
    v_tester_id := 'Tester_' || v_suffix;
    exit when not exists (
      select 1 from public.beta_testers b where b.tester_id = v_tester_id
    );
  end loop;

  -- ~10 URL-sichere Zeichen
  v_password := translate(
    encode(gen_random_bytes(8), 'base64'),
    '+/=',
    'xYz'
  );
  v_password := substr(v_password, 1, 10);

  insert into public.beta_testers (tester_id, access_password, note)
  values (v_tester_id, v_password, nullif(trim(p_note), ''));

  tester_id := v_tester_id;
  access_password := v_password;
  email := public.tb_beta_tester_email(v_tester_id);
  return next;
end;
$$;

revoke all on function public.tb_generate_beta_tester(text) from public, anon, authenticated;
grant execute on function public.tb_generate_beta_tester(text) to service_role;

-- ---------------------------------------------------------------------------
-- Client: Zugangsdaten prüfen (ohne die Zeile zu markieren)
-- ---------------------------------------------------------------------------
create or replace function public.tb_validate_beta_tester(
  p_tester_id text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := public.tb_normalize_beta_tester_id(p_tester_id);
  v_pw text := trim(p_password);
  v_row public.beta_testers%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_id is null or v_id = '' or v_pw is null or v_pw = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_credentials');
  end if;

  if v_id !~ '^Tester_[A-Za-z0-9]{5}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_tester_id_format');
  end if;

  select * into v_row
  from public.beta_testers
  where tester_id = v_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;

  if v_row.access_password is distinct from v_pw then
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;

  if v_row.is_used and (v_uid is null or v_row.used_by is distinct from v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tester_id', v_row.tester_id,
    'email', public.tb_beta_tester_email(v_row.tester_id),
    'already_claimed_by_you', (v_row.is_used and v_row.used_by is not distinct from v_uid)
  );
end;
$$;

revoke all on function public.tb_validate_beta_tester(text, text) from public;
grant execute on function public.tb_validate_beta_tester(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client: Slot dem eingeloggten User zuordnen
-- ---------------------------------------------------------------------------
create or replace function public.tb_claim_beta_tester(
  p_tester_id text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := public.tb_normalize_beta_tester_id(p_tester_id);
  v_pw text := trim(p_password);
  v_uid uuid := auth.uid();
  v_row public.beta_testers%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_row
  from public.beta_testers
  where tester_id = v_id
  for update;

  if not found or v_row.access_password is distinct from v_pw then
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials');
  end if;

  if v_row.is_used and v_row.used_by is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  if not v_row.is_used then
    update public.beta_testers
    set is_used = true,
        used_by = v_uid,
        used_at = now()
    where id = v_row.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'tester_id', v_id,
    'email', public.tb_beta_tester_email(v_id)
  );
end;
$$;

revoke all on function public.tb_claim_beta_tester(text, text) from public;
grant execute on function public.tb_claim_beta_tester(text, text) to authenticated;

commit;

-- Beispiel Keys erzeugen (nur service_role / SQL-Editor als Owner):
--   select * from public.tb_generate_beta_tester('Freund #1');
--   select * from public.tb_generate_beta_tester('QA-Runde');
