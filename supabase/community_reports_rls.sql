-- community_reports: user_id + RLS + Storage + Insert-Trigger
-- Im Supabase SQL Editor ausführen (ganzes Skript auf einmal).

alter table public.community_reports
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists idx_community_reports_user_id
  on public.community_reports (user_id)
  where user_id is not null;

create index if not exists idx_reports_routing
  on public.community_reports (source_identifier, status);

-- user_id serverseitig aus auth.uid() setzen (verhindert RLS-Mismatch)
create or replace function public.community_reports_set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  else
    new.user_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists community_reports_before_insert on public.community_reports;

create trigger community_reports_before_insert
  before insert on public.community_reports
  for each row
  execute function public.community_reports_set_user_id();

alter table public.community_reports enable row level security;

-- Alte Policies entfernen (inkl. ggf. manuell angelegter)
drop policy if exists "community_reports_insert_authenticated" on public.community_reports;
drop policy if exists "community_reports_insert_anon" on public.community_reports;
drop policy if exists "community_reports_select_own" on public.community_reports;
drop policy if exists "community_reports_insert_auth" on public.community_reports;
drop policy if exists "community_reports_insert_guest" on public.community_reports;

-- Eingeloggt: Insert erlaubt (Trigger setzt user_id = auth.uid())
create policy "community_reports_insert_auth" on public.community_reports
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- Gast: nur ohne user_id
create policy "community_reports_insert_guest" on public.community_reports
  for insert to anon
  with check (user_id is null);

create policy "community_reports_select_own" on public.community_reports
  for select to authenticated
  using (user_id = auth.uid());

-- Storage für Beleg-Screenshots
insert into storage.buckets (id, name, public)
values ('error-report-evidence', 'error-report-evidence', true)
on conflict (id) do nothing;

drop policy if exists "error_evidence_upload" on storage.objects;
drop policy if exists "error_evidence_read" on storage.objects;

create policy "error_evidence_upload" on storage.objects
  for insert to authenticated, anon
  with check (bucket_id = 'error-report-evidence');

create policy "error_evidence_read" on storage.objects
  for select
  using (bucket_id = 'error-report-evidence');
