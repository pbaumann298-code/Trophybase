-- =============================================================================
-- admin_roadmap (Admin- & Intranet-Knotenpunkt: Bugs, Roadmap & Ideen-Archiv)
-- =============================================================================
-- Struktur analog zu game_guides:
--   category        -> Ober-Reiter ('Bugs', 'Meilenstein', 'Architektur', 'Hub & Content', 'Monetarisierung')
--   topic_group     -> Gruppen-Klammer / Baustelle (z. B. 'User-Bereich', 'Krankenstation', 'Übersetzer / i18n')
--   title           -> Einzelner Punkt / Bug (1 Bug = 1 Zeile)
--   screenshot_url  -> Maximal 1 temporärer Beleg-Screenshot (analog video_url)
--   screenshot_path -> Objektpfad im Bucket 'admin-roadmap-media' (wird beim Archivieren gelöscht)
--   status          -> Aktiv: 'IN_PROGRESS', 'PLANNED', 'IDEA' | Archiv: 'DONE', 'REJECTED'
-- =============================================================================

begin;

create table if not exists public.admin_roadmap (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Bugs',
  topic_group text not null default 'Allgemein',
  status text not null default 'IDEA',
  is_urgent boolean not null default false,
  target_date date,
  notes text not null default '',
  screenshot_url text,
  screenshot_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_roadmap
  add column if not exists topic_group text not null default 'Allgemein',
  add column if not exists is_urgent boolean not null default false,
  add column if not exists screenshot_url text,
  add column if not exists screenshot_path text,
  add column if not exists archived_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

alter table public.admin_roadmap
  alter column category set default 'Bugs',
  alter column topic_group set default 'Allgemein';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_roadmap_status_check'
  ) then
    alter table public.admin_roadmap
      add constraint admin_roadmap_status_check
      check (status in ('IN_PROGRESS', 'PLANNED', 'IDEA', 'DONE', 'REJECTED'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'admin_roadmap_category_check'
  ) then
    alter table public.admin_roadmap
      add constraint admin_roadmap_category_check
      check (category in ('Bugs', 'Meilenstein', 'Architektur', 'Hub & Content', 'Monetarisierung'));
  end if;
end $$;

create index if not exists idx_admin_roadmap_active_lookup
  on public.admin_roadmap (category, is_urgent desc, created_at desc)
  where status not in ('DONE', 'REJECTED');

create index if not exists idx_admin_roadmap_archive_lookup
  on public.admin_roadmap (archived_at desc)
  where status in ('DONE', 'REJECTED');

create or replace function public.tb_admin_roadmap_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := btrim(coalesce(new.title, ''));
  new.topic_group := coalesce(nullif(btrim(new.topic_group), ''), 'Allgemein');
  new.notes := coalesce(new.notes, '');

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
  else
    new.updated_at := now();
  end if;

  if new.status in ('DONE', 'REJECTED') then
    new.archived_at := coalesce(new.archived_at, now());
    new.is_urgent := false;
  else
    new.archived_at := null;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_admin_roadmap_before_write'
  ) then
    create trigger trg_admin_roadmap_before_write
      before insert or update on public.admin_roadmap
      for each row
      execute function public.tb_admin_roadmap_before_write();
  end if;
end $$;

alter table public.admin_roadmap enable row level security;

revoke all on public.admin_roadmap from anon;
grant select, insert, update, delete on public.admin_roadmap to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roadmap'
      and policyname = 'admin_roadmap_admin_all'
  ) then
    create policy admin_roadmap_admin_all
      on public.admin_roadmap
      for all
      to authenticated
      using ((select public.tb_is_admin()))
      with check ((select public.tb_is_admin()));
  end if;
end $$;

-- Temporärer Screenshot-Bucket 'admin-roadmap-media'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-roadmap-media',
  'admin-roadmap-media',
  true,
  1048576,
  array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admin_roadmap_media_admin_all'
  ) then
    create policy admin_roadmap_media_admin_all
      on storage.objects
      for all
      to authenticated
      using (
        bucket_id = 'admin-roadmap-media'
        and (select public.tb_is_admin())
      )
      with check (
        bucket_id = 'admin-roadmap-media'
        and (select public.tb_is_admin())
      );
  end if;
end $$;

commit;
