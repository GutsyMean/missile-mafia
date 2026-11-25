-- The guild bank, as a guild addon last read it in game.
--
-- The game only tells about the bank while its window is open at a guild
-- banker, so the site shows a reading: the gold, what lies in each tab and the
-- newest of the ledger, with when it was read and by whom. A site admin brings
-- it in from the addon's file, along with the members.
--
-- What the bank holds and who took what is the guild's own business. It is
-- kept where the API cannot read it, and handed out only to members: site
-- admins, accounts Discord confirmed as guild members, and anyone who manages
-- a crafter.

create table public.guild_bank (
  id boolean primary key default true check (id),
  value jsonb not null,
  read_at timestamptz not null,
  read_by text,
  imported_at timestamptz not null default now()
);

alter table public.guild_bank enable row level security;
revoke all on public.guild_bank from anon, authenticated;
grant all on public.guild_bank to service_role;

-- Whether the caller is one of the guild's own.
create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()))
    or exists (select 1 from public.verified_members m where m.user_id = (select auth.uid()))
    or exists (select 1 from public.crafters c where c.user_id = (select auth.uid()))
  )
$$;

-- The reading, with what the site knows about the items in it: their icons and quality.
-- Null while nothing has been brought in. Refused to anyone who is not a member.
create or replace function private.guild_bank()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bank public.guild_bank;
begin
  if not private.is_member() then
    raise exception 'The guild bank is for guild members' using errcode = '42501';
  end if;
  select * into v_bank from public.guild_bank;
  if not found then
    return null;
  end if;
  return v_bank.value || jsonb_build_object(
    'readAt', v_bank.read_at,
    'readBy', v_bank.read_by,
    'importedAt', v_bank.imported_at,
    'items', coalesce((
      select jsonb_object_agg(i.id, jsonb_build_object('name', i.name, 'quality', i.quality, 'iconFileId', i.icon_file_id))
      from public.items i
      where i.id in (
        select (slot ->> 'id')::integer
        from jsonb_array_elements(coalesce(v_bank.value -> 'tabs', '[]'::jsonb)) tab,
             jsonb_array_elements(coalesce(tab -> 'slots', '[]'::jsonb)) slot
        where slot ->> 'id' ~ '^[0-9]{1,9}$'
        union
        select (entry ->> 'id')::integer
        from jsonb_array_elements(coalesce(v_bank.value -> 'ledger', '[]'::jsonb)) entry
        where entry ->> 'id' ~ '^[0-9]{1,9}$'
      )
    ), '{}'::jsonb)
  );
end;
$$;

-- Brings in a reading. An older one than the site already has is refused:
-- two officers' files can differ, and the newer reading is the truer one.
create or replace function private.admin_set_guild_bank(p_bank jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_read_at timestamptz;
  v_have timestamptz;
begin
  perform private.require_admin();
  if p_bank is null or jsonb_typeof(p_bank) <> 'object'
    or coalesce(p_bank ->> 'at', '') !~ '^[0-9]{9,11}$'
    or coalesce(p_bank ->> 'money', '') !~ '^[0-9]{1,15}$'
    or jsonb_typeof(coalesce(p_bank -> 'tabs', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_bank -> 'ledger', '[]'::jsonb)) <> 'array'
    or pg_column_size(p_bank) > 2000000
  then
    raise exception 'That is not a reading of the guild bank' using errcode = '22023';
  end if;
  v_read_at := to_timestamp((p_bank ->> 'at')::bigint);
  if v_read_at > now() + interval '1 day' then
    raise exception 'That reading is dated in the future' using errcode = '22023';
  end if;

  select b.read_at into v_have from public.guild_bank b;
  if v_have is not null and v_have > v_read_at then
    raise exception 'The site already has a newer reading of the bank, from %', to_char(v_have at time zone 'UTC', 'DD Mon YYYY')
      using errcode = 'P0001';
  end if;

  insert into public.guild_bank (id, value, read_at, read_by, imported_at)
  values (
    true,
    jsonb_build_object(
      'money', (p_bank ->> 'money')::bigint,
      'nextTabCost', case when p_bank ->> 'nextTabCost' ~ '^[0-9]{1,15}$' then (p_bank ->> 'nextTabCost')::bigint end,
      'tabs', coalesce(p_bank -> 'tabs', '[]'::jsonb),
      'ledger', coalesce(p_bank -> 'ledger', '[]'::jsonb)
    ),
    v_read_at,
    nullif(left(btrim(coalesce(p_bank ->> 'by', '')), 40), ''),
    now()
  )
  on conflict (id) do update
    set value = excluded.value, read_at = excluded.read_at, read_by = excluded.read_by, imported_at = excluded.imported_at;
end;
$$;

-- What the site calls. These hold no rights of their own.
create or replace function public.guild_bank()
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.guild_bank() $$;

create or replace function public.admin_set_guild_bank(p_bank jsonb)
returns void
language sql
set search_path = ''
as $$ select private.admin_set_guild_bank(p_bank) $$;

revoke all on function private.is_member() from public, anon, authenticated;
revoke all on function private.guild_bank() from public, anon;
revoke all on function private.admin_set_guild_bank(jsonb) from public, anon;
revoke all on function public.guild_bank() from public, anon;
revoke all on function public.admin_set_guild_bank(jsonb) from public, anon;
grant execute on function private.guild_bank() to authenticated;
grant execute on function private.admin_set_guild_bank(jsonb) to authenticated;
grant execute on function public.guild_bank() to authenticated;
grant execute on function public.admin_set_guild_bank(jsonb) to authenticated;
