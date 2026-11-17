-- Guild members can become crafters without waiting for an admin.
--
-- An admin names the guild's Discord server (and optionally a role) on the
-- admin page. At sign-in the site's server asks Discord whether the account is
-- a member and records the answer here. A confirmed member may then create
-- their own crafter profile.
--
-- Nobody can record a verification except the site's server (service role),
-- and automatic approval is off until an admin turns it on.

-- One row of settings the admin controls from the admin page.
create table public.site_settings (
  id boolean primary key default true check (id),
  auto_approve boolean not null default false,
  discord_guild_id text check (discord_guild_id ~ '^[0-9]{15,22}$'),
  discord_role_id text check (discord_role_id ~ '^[0-9]{15,22}$'),
  updated_at timestamptz not null default now(),
  check (not auto_approve or discord_guild_id is not null)
);
insert into public.site_settings (id) values (true);

-- Accounts Discord confirmed as members at their last sign-in.
create table public.verified_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  discord_name text check (char_length(discord_name) <= 80),
  verified_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.verified_members enable row level security;

revoke all on public.site_settings, public.verified_members from anon, authenticated;
grant all on public.site_settings, public.verified_members to service_role;

-- Anyone may see whether sign-up is open (the sign-in page needs it), but not which server or role is required.
grant select (auto_approve) on public.site_settings to anon, authenticated;
create policy "anyone can see whether sign-up is open" on public.site_settings
  for select to anon, authenticated using (true);

grant select on public.verified_members to authenticated;
create policy "members can see their own verification" on public.verified_members
  for select to authenticated using (user_id = (select auth.uid()));

-- The address used in links: the name in lower case, with a number if taken.
create or replace function private.new_crafter_slug(p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := coalesce(nullif(btrim(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'crafter');
  v_slug text := v_base;
  v_n integer := 1;
begin
  while exists (select 1 from public.crafters c where c.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

create or replace function private.admin_create_crafter(p_character_name text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_character_name, ''));
  v_id uuid;
begin
  perform private.require_admin();
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Enter a character name of up to 40 characters' using errcode = '22023';
  end if;
  insert into public.crafters (slug, character_name, user_id)
  values (private.new_crafter_slug(v_name), v_name, p_user_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- A confirmed member creates their own crafter: one per account.
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
  if v_user is null
    or not (select s.auto_approve from public.site_settings s)
    or not exists (select 1 from public.verified_members m where m.user_id = v_user)
  then
    raise exception 'Discord has not confirmed this account as a guild member' using errcode = '42501';
  end if;
  if exists (select 1 from public.crafters c where c.user_id = v_user) then
    raise exception 'This account already has a crafter profile' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Enter a character name of up to 40 characters' using errcode = '22023';
  end if;
  insert into public.crafters (slug, character_name, user_id)
  values (private.new_crafter_slug(v_name), v_name, v_user)
  returning id into v_id;
  return v_id;
end;
$$;

-- The approval rule, for the admin page.
create or replace function private.admin_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return (
    select jsonb_build_object(
      'autoApprove', s.auto_approve,
      'discordGuildId', s.discord_guild_id,
      'discordRoleId', s.discord_role_id,
      'verifiedMembers', (select count(*) from public.verified_members)
    )
    from public.site_settings s
  );
end;
$$;

create or replace function private.admin_save_settings(p_auto_approve boolean, p_guild_id text, p_role_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guild text := nullif(btrim(coalesce(p_guild_id, '')), '');
  v_role text := nullif(btrim(coalesce(p_role_id, '')), '');
begin
  perform private.require_admin();
  if v_guild is not null and v_guild !~ '^[0-9]{15,22}$' then
    raise exception 'The Discord server id is a long number; copy it from Discord' using errcode = '22023';
  end if;
  if v_role is not null and v_role !~ '^[0-9]{15,22}$' then
    raise exception 'The Discord role id is a long number; copy it from Discord' using errcode = '22023';
  end if;
  if coalesce(p_auto_approve, false) and v_guild is null then
    raise exception 'Enter the Discord server before turning automatic approval on' using errcode = '22023';
  end if;
  update public.site_settings
  set auto_approve = coalesce(p_auto_approve, false),
      discord_guild_id = v_guild,
      discord_role_id = v_role,
      updated_at = now()
  where id;
end;
$$;

-- The account list now says who Discord confirmed.
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
        'recipeCount', (select count(*) from public.crafter_recipes cr where cr.crafter_id = c.id)
      ) order by c.character_name, c.id)
      from public.crafters c
    ), '[]'::jsonb)
  );
end;
$$;

-- What the site calls.
create or replace function public.signup_crafter(p_character_name text)
returns uuid
language sql
set search_path = ''
as $$ select private.signup_crafter(p_character_name) $$;

create or replace function public.admin_settings()
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.admin_settings() $$;

create or replace function public.admin_save_settings(p_auto_approve boolean, p_guild_id text, p_role_id text)
returns void
language sql
set search_path = ''
as $$ select private.admin_save_settings(p_auto_approve, p_guild_id, p_role_id) $$;

revoke all on function private.new_crafter_slug(text) from public, anon, authenticated;
revoke all on function private.signup_crafter(text) from public, anon;
revoke all on function private.admin_settings() from public, anon;
revoke all on function private.admin_save_settings(boolean, text, text) from public, anon;
grant execute on function private.signup_crafter(text) to authenticated;
grant execute on function private.admin_settings() to authenticated;
grant execute on function private.admin_save_settings(boolean, text, text) to authenticated;

revoke all on function public.signup_crafter(text) from public, anon;
revoke all on function public.admin_settings() from public, anon;
revoke all on function public.admin_save_settings(boolean, text, text) from public, anon;
grant execute on function public.signup_crafter(text) to authenticated;
grant execute on function public.admin_settings() to authenticated;
grant execute on function public.admin_save_settings(boolean, text, text) to authenticated;
