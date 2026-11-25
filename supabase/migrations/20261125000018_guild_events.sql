-- The guild's calendar: raids and other events, written by site admins.
--
-- Anyone can read it, as they can the crafting list: when the guild raids is
-- no secret, and most members never sign in. Only a site admin adds, changes
-- or removes an event.

create table public.guild_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at timestamptz not null,
  details text check (char_length(details) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guild_events_starts_at_idx on public.guild_events (starts_at);
create index guild_events_created_by_idx on public.guild_events (created_by);

alter table public.guild_events enable row level security;
revoke all on public.guild_events from anon, authenticated;
grant select (id, title, starts_at, details) on public.guild_events to anon, authenticated;
grant all on public.guild_events to service_role;

create policy "anyone can read the calendar" on public.guild_events
  for select to anon, authenticated using (true);

-- Adds an event, or changes the one named. Returns its id.
create or replace function private.admin_save_event(p_id uuid, p_title text, p_starts_at timestamptz, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_id uuid;
begin
  perform private.require_admin();
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'Give the event a name of up to 80 characters' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'Say when the event starts' using errcode = '22023';
  end if;
  if char_length(coalesce(v_details, '')) > 1000 then
    raise exception 'Keep the details under 1000 characters' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.guild_events (title, starts_at, details, created_by)
    values (v_title, p_starts_at, v_details, (select auth.uid()))
    returning id into v_id;
  else
    update public.guild_events
    set title = v_title, starts_at = p_starts_at, details = v_details, updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That event no longer exists' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function private.admin_delete_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.guild_events where id = p_id;
  if not found then
    raise exception 'That event no longer exists' using errcode = 'P0002';
  end if;
end;
$$;

-- What the site calls. These hold no rights of their own.
create or replace function public.admin_save_event(p_id uuid, p_title text, p_starts_at timestamptz, p_details text)
returns uuid
language sql
set search_path = ''
as $$ select private.admin_save_event(p_id, p_title, p_starts_at, p_details) $$;

create or replace function public.admin_delete_event(p_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.admin_delete_event(p_id) $$;

revoke all on function private.admin_save_event(uuid, text, timestamptz, text) from public, anon;
revoke all on function private.admin_delete_event(uuid) from public, anon;
revoke all on function public.admin_save_event(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.admin_delete_event(uuid) from public, anon;
grant execute on function private.admin_save_event(uuid, text, timestamptz, text) to authenticated;
grant execute on function private.admin_delete_event(uuid) to authenticated;
grant execute on function public.admin_save_event(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_delete_event(uuid) to authenticated;
