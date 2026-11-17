-- One Discord login can hold several characters, each its own crafter with
-- its own professions and recipes. A confirmed member, or a site admin, adds
-- them from their own page. The limit only guards against runaway use.

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
  if (select count(*) from public.crafters c where c.user_id = v_user) >= 8 then
    raise exception 'This account already has eight characters' using errcode = 'P0001';
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
