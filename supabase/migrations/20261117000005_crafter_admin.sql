-- Site admins decide who is a crafter, from the site.
--
-- Members sign in with Discord. An admin then makes them a crafter, or links
-- them to a crafter that already exists. That needs rights ordinary signed-in
-- users must not have: reading the list of accounts and setting who owns a
-- crafter. So these run as functions that first check the caller is an admin.
--
-- The functions that hold those rights live in a schema the API does not
-- expose. The public functions the site calls only pass the call through.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Stops with "permission denied" unless the caller is a site admin.
create or replace function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())) then
    raise exception 'Only a site admin can do this' using errcode = '42501';
  end if;
end;
$$;

-- Accounts that have signed in, and every crafter, listed or not.
-- Accounts are shown by Discord name only; email addresses never leave the database.
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
        'isAdmin', exists (select 1 from public.app_admins a where a.user_id = u.id)
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

-- Links a crafter to an account, or unlinks it when the account is null.
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
end;
$$;

-- Adds a crafter, optionally already linked to an account. Returns its id.
create or replace function private.admin_create_crafter(p_character_name text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_character_name, ''));
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_id uuid;
begin
  perform private.require_admin();
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Enter a character name of up to 40 characters' using errcode = '22023';
  end if;

  -- The address used in links: the name in lower case, with a number if taken.
  v_base := coalesce(nullif(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'crafter');
  v_slug := v_base;
  while exists (select 1 from public.crafters c where c.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.crafters (slug, character_name, user_id)
  values (v_slug, v_name, p_user_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Shows a crafter on the public list, or takes them off it.
create or replace function private.admin_set_crafter_listed(p_crafter_id uuid, p_listed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.crafters set is_listed = coalesce(p_listed, false) where id = p_crafter_id;
  if not found then
    raise exception 'That crafter does not exist' using errcode = 'P0002';
  end if;
end;
$$;

-- What the site calls. These hold no rights of their own.
create or replace function public.admin_directory()
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.admin_directory() $$;

create or replace function public.admin_link_crafter(p_crafter_id uuid, p_user_id uuid)
returns void
language sql
set search_path = ''
as $$ select private.admin_link_crafter(p_crafter_id, p_user_id) $$;

create or replace function public.admin_create_crafter(p_character_name text, p_user_id uuid)
returns uuid
language sql
set search_path = ''
as $$ select private.admin_create_crafter(p_character_name, p_user_id) $$;

create or replace function public.admin_set_crafter_listed(p_crafter_id uuid, p_listed boolean)
returns void
language sql
set search_path = ''
as $$ select private.admin_set_crafter_listed(p_crafter_id, p_listed) $$;

-- Only signed-in users may call these; the admin check inside does the rest.
revoke all on function private.require_admin() from public, anon, authenticated;
revoke all on function private.admin_directory() from public, anon;
revoke all on function private.admin_link_crafter(uuid, uuid) from public, anon;
revoke all on function private.admin_create_crafter(text, uuid) from public, anon;
revoke all on function private.admin_set_crafter_listed(uuid, boolean) from public, anon;
grant execute on function private.admin_directory() to authenticated;
grant execute on function private.admin_link_crafter(uuid, uuid) to authenticated;
grant execute on function private.admin_create_crafter(text, uuid) to authenticated;
grant execute on function private.admin_set_crafter_listed(uuid, boolean) to authenticated;

revoke all on function public.admin_directory() from public, anon;
revoke all on function public.admin_link_crafter(uuid, uuid) from public, anon;
revoke all on function public.admin_create_crafter(text, uuid) from public, anon;
revoke all on function public.admin_set_crafter_listed(uuid, boolean) from public, anon;
grant execute on function public.admin_directory() to authenticated;
grant execute on function public.admin_link_crafter(uuid, uuid) to authenticated;
grant execute on function public.admin_create_crafter(text, uuid) to authenticated;
grant execute on function public.admin_set_crafter_listed(uuid, boolean) to authenticated;
