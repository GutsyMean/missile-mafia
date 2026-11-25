-- One player's characters, and characters asked for at sign-up.
--
-- An import creates crafters that belong to no account. Two things make it
-- easy to give them to their player later:
--
--   * The guild addon knows which characters are one player's. The import
--     records that, so an admin can hand all of a player's characters to an
--     account at once. Who shares a player is for admins only: it is kept in
--     a table nobody else can read.
--   * A member who signs up with the name of a character that is already on
--     the list, managed by nobody, does not get a second crafter of that
--     name. The request is kept for an admin, who hands the existing one over.

create table public.crafter_players (
  crafter_id uuid primary key references public.crafters (id) on delete cascade,
  player_id uuid not null
);
create index crafter_players_player_id_idx on public.crafter_players (player_id);

create table public.crafter_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  crafter_id uuid not null references public.crafters (id) on delete cascade,
  character_name text not null check (char_length(character_name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (user_id, crafter_id)
);
create index crafter_claims_crafter_id_idx on public.crafter_claims (crafter_id);

alter table public.crafter_players enable row level security;
alter table public.crafter_claims enable row level security;
revoke all on public.crafter_players, public.crafter_claims from anon, authenticated;
grant all on public.crafter_players, public.crafter_claims to service_role;

-- A member sees what they are waiting for; nobody sees anyone else's.
grant select on public.crafter_claims to authenticated;
create policy "members can see what they asked for" on public.crafter_claims
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A name as it is compared: case and spacing put aside.
create or replace function private.name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')) $$;

-- Signing up, or adding a character. Returns the new crafter, or null when a
-- character of that name is already on the list and is being kept for them.
create or replace function private.signup_crafter(p_character_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_character_name, ''));
  v_id uuid;
begin
  if v_user is null or not (
    exists (select 1 from public.app_admins a where a.user_id = v_user)
    or (
      (select s.auto_approve from public.site_settings s)
      and exists (select 1 from public.verified_members m where m.user_id = v_user)
    )
  ) then
    raise exception 'Discord has not confirmed this account as a guild member' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Enter a character name of up to 40 characters' using errcode = '22023';
  end if;

  -- Already on the list with nobody managing it: asked for, not made a second time.
  insert into public.crafter_claims (user_id, crafter_id, character_name)
  select v_user, c.id, c.character_name
  from public.crafters c
  where c.user_id is null and private.name_key(c.character_name) = private.name_key(v_name)
  on conflict (user_id, crafter_id) do nothing;
  if exists (
    select 1
    from public.crafter_claims k
    join public.crafters c on c.id = k.crafter_id
    where k.user_id = v_user and c.user_id is null and private.name_key(c.character_name) = private.name_key(v_name)
  ) then
    return null;
  end if;

  if (select count(*) from public.crafters c where c.user_id = v_user) >= 8 then
    raise exception 'This account already has eight characters' using errcode = 'P0001';
  end if;
  insert into public.crafters (slug, character_name, user_id)
  values (private.new_crafter_slug(v_name), v_name, v_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- Links a crafter to an account, or unlinks it when the account is null.
-- Once it is handed over, nobody is waiting for it any more.
create or replace function private.admin_link_crafter(p_crafter_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.crafters set user_id = p_user_id where id = p_crafter_id;
  if not found then
    raise exception 'That crafter does not exist' using errcode = 'P0002';
  end if;
  if p_user_id is not null then
    delete from public.crafter_claims k where k.crafter_id = p_crafter_id;
  end if;
end;
$$;

-- Hands a crafter to an account together with the same player's other
-- characters that nobody manages yet. Returns how many were handed over.
create or replace function private.admin_link_player(p_crafter_id uuid, p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_admin();
  if p_user_id is null then
    raise exception 'Choose the account to hand the characters to' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crafters c where c.id = p_crafter_id) then
    raise exception 'That crafter does not exist' using errcode = 'P0002';
  end if;

  with theirs as (
    select c.id
    from public.crafters c
    where c.id = p_crafter_id
       or (c.user_id is null and c.id in (
            select o.crafter_id
            from public.crafter_players o
            where o.player_id = (select p.player_id from public.crafter_players p where p.crafter_id = p_crafter_id)))
  ),
  linked as (
    update public.crafters c set user_id = p_user_id from theirs where c.id = theirs.id returning c.id
  ),
  answered as (
    delete from public.crafter_claims k using linked where k.crafter_id = linked.id
  )
  select count(*) into v_count from linked;
  return v_count;
end;
$$;

-- Records that the crafters of each group are one player's characters.
-- p_groups is a list of lists of crafter ids. A crafter already filed under a
-- player brings that player's other characters into the group with it.
create or replace function private.admin_group_crafters(p_groups jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group jsonb;
  v_ids uuid[];
  v_player uuid;
begin
  perform private.require_admin();
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 500 then
    raise exception 'Send a list of at most 500 groups' using errcode = '22023';
  end if;

  for v_group in select g from jsonb_array_elements(p_groups) g loop
    continue when jsonb_typeof(v_group) <> 'array';
    -- Compared as text, so that anything that is not a crafter's id is simply not found.
    select array_agg(distinct c.id) into v_ids
    from jsonb_array_elements_text(v_group) t (value)
    join public.crafters c on c.id::text = lower(t.value);
    continue when coalesce(array_length(v_ids, 1), 0) < 2;

    select min(p.player_id::text)::uuid into v_player
    from public.crafter_players p
    where p.crafter_id = any (v_ids);
    v_player := coalesce(v_player, gen_random_uuid());

    update public.crafter_players q
    set player_id = v_player
    where q.player_id <> v_player
      and q.player_id in (select p.player_id from public.crafter_players p where p.crafter_id = any (v_ids));

    insert into public.crafter_players (crafter_id, player_id)
    select id, v_player from unnest(v_ids) as u (id)
    on conflict (crafter_id) do update set player_id = excluded.player_id;
  end loop;
end;
$$;

-- The crafter list now says whose characters go together, and who asked for one.
create or replace function private.admin_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', coalesce(
          nullif(u.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          nullif(u.raw_user_meta_data ->> 'name', ''),
          'Unnamed account'),
        'createdAt', u.created_at,
        'lastSignInAt', u.last_sign_in_at,
        'isAdmin', exists (select 1 from public.app_admins a where a.user_id = u.id),
        'isVerifiedMember', exists (select 1 from public.verified_members m where m.user_id = u.id)
      ) order by u.created_at desc, u.id)
      from (select * from auth.users order by created_at desc, id limit 500) u
    ), '[]'::jsonb),
    'crafters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'characterName', c.character_name,
        'userId', c.user_id,
        'isListed', c.is_listed,
        'recipeCount', (select count(*) from public.crafter_recipes cr where cr.crafter_id = c.id),
        'playerId', (select p.player_id from public.crafter_players p where p.crafter_id = c.id),
        'claimedBy', coalesce((
          select jsonb_agg(k.user_id order by k.created_at, k.user_id)
          from public.crafter_claims k
          where k.crafter_id = c.id
        ), '[]'::jsonb)
      ) order by c.character_name, c.id)
      from public.crafters c
    ), '[]'::jsonb)
  );
end;
$$;

-- What the site calls. These hold no rights of their own.
create or replace function public.admin_link_player(p_crafter_id uuid, p_user_id uuid)
returns integer
language sql
set search_path = ''
as $$ select private.admin_link_player(p_crafter_id, p_user_id) $$;

create or replace function public.admin_group_crafters(p_groups jsonb)
returns void
language sql
set search_path = ''
as $$ select private.admin_group_crafters(p_groups) $$;

revoke all on function private.name_key(text) from public, anon, authenticated;
revoke all on function private.admin_link_player(uuid, uuid) from public, anon;
revoke all on function private.admin_group_crafters(jsonb) from public, anon;
revoke all on function public.admin_link_player(uuid, uuid) from public, anon;
revoke all on function public.admin_group_crafters(jsonb) from public, anon;
grant execute on function private.admin_link_player(uuid, uuid) to authenticated;
grant execute on function private.admin_group_crafters(jsonb) to authenticated;
grant execute on function public.admin_link_player(uuid, uuid) to authenticated;
grant execute on function public.admin_group_crafters(jsonb) to authenticated;
