create extension if not exists pgcrypto;

do $farrieros_tables$
begin
execute 'create ' || $table$table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
); $table$;

execute 'create ' || $table$table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
); $table$;

execute 'create ' || $table$table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'business_partner', 'apprentice')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
); $table$;

execute 'create ' || $table$table public.workspace_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
); $table$;

execute 'create ' || $table$table public.coif_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  token_hash text not null unique,
  status text not null default 'draft' check (status in ('draft', 'sent', 'opened', 'submitted', 'imported', 'expired', 'revoked')),
  owner_name_hint text,
  owner_phone_hint text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
); $table$;

execute 'create ' || $table$table public.coif_submissions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null unique references public.coif_links(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_contact jsonb not null,
  property_and_access jsonb not null default '{}'::jsonb,
  horse_intakes jsonb not null default '[]'::jsonb,
  messaging_consent jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  imported_record_ids jsonb not null default '[]'::jsonb
); $table$;
end;
$farrieros_tables$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
  display_name text;
begin
  display_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Farrier');
  insert into public.profiles (id, full_name) values (new.id, display_name);
  insert into public.workspaces (name, created_by)
    values (display_name || '''s FarrierOS', new.id)
    returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'owner');
  insert into public.workspace_state (workspace_id, data, updated_by)
    values (new_workspace_id, '{}'::jsonb, new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_state enable row level security;
alter table public.coif_links enable row level security;
alter table public.coif_submissions enable row level security;

create policy "Users read their own profile" on public.profiles
  for select using (id = auth.uid());
create policy "Users update their own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "Members read workspaces" on public.workspaces
  for select using (public.is_workspace_member(id));
create policy "Owners update workspaces" on public.workspaces
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "Members read workspace membership" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

create policy "Members read workspace state" on public.workspace_state
  for select using (public.is_workspace_member(workspace_id));
create policy "Members update workspace state" on public.workspace_state
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "Members manage COIF links" on public.coif_links
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
create policy "Members read COIF submissions" on public.coif_submissions
  for select using (public.is_workspace_member(workspace_id));
create policy "Members review COIF submissions" on public.coif_submissions
  for update using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create index workspace_members_user_idx on public.workspace_members(user_id);
create index coif_links_workspace_idx on public.coif_links(workspace_id);
create index coif_submissions_workspace_idx on public.coif_submissions(workspace_id);

comment on column public.coif_links.token_hash is
  'Store only a SHA-256 hash. Plain link tokens must never be persisted.';
comment on table public.coif_submissions is
  'Public submission must go through a rate-limited Edge Function that validates the link token. There is intentionally no anonymous insert policy.';
