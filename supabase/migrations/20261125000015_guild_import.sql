-- A site admin brings in what a guild addon has collected about the members:
-- who has which profession, at what skill, and the recipes they know.
--
-- The site reads the addon's file in the admin's browser and sends the members
-- chosen there. For each one the admin either names an existing crafter or
-- asks for a new one. The rules:
--
--   * a new crafter belongs to no account until an admin links one;
--   * a skill is only ever raised, never lowered: the file may be older than
--     what a member typed in themselves;
--   * recipes are only ever added, and a recipe a crafter took off their own
--     list stays off;
--   * raising a skill brings its trainer recipes, as it does everywhere else.
--
-- With p_apply false nothing is kept: the same work is done and then undone,
-- so the tally the admin sees beforehand is exactly what importing would do.
-- The tally tells the recipes the file names apart from those the skill brings.

create or replace function private.admin_import_guild(p_members jsonb, p_list_new boolean, p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_member jsonb;
  v_name text;
  v_id uuid;
  v_created boolean;
  v_recipe_ids integer[];
  v_before integer;
  v_after integer;
  v_from_file integer;
  v_skipped integer;
  v_skills jsonb;
  v_profession record;
  v_old integer;
begin
  perform private.require_admin();
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) > 500 then
    raise exception 'Send a list of at most 500 members' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct m ->> 'crafterId')
    from jsonb_array_elements(p_members) m
    where m ->> 'crafterId' is not null
  ) then
    raise exception 'Two members point at the same crafter' using errcode = '22023';
  end if;

  begin
    for v_member in select m from jsonb_array_elements(p_members) with ordinality as t (m, n) order by n loop
      v_name := btrim(coalesce(v_member ->> 'name', ''));

      if v_member ->> 'crafterId' is not null then
        select c.id into v_id from public.crafters c where c.id = (v_member ->> 'crafterId')::uuid;
        if not found then
          raise exception 'The crafter chosen for % does not exist', v_name using errcode = 'P0002';
        end if;
        v_created := false;
      else
        if char_length(v_name) < 1 or char_length(v_name) > 40 then
          raise exception 'A member has no name, or one longer than 40 characters' using errcode = '22023';
        end if;
        insert into public.crafters (slug, character_name, user_id, is_listed)
        values (private.new_crafter_slug(v_name), v_name, null, coalesce(p_list_new, true))
        returning id into v_id;
        v_created := true;
      end if;

      select count(*) into v_before from public.crafter_recipes cr where cr.crafter_id = v_id;

      -- Anything that is not a plain number is passed over rather than read.
      v_recipe_ids := coalesce(array(
        select case when value ~ '^[0-9]{1,9}$' then value::integer end
        from jsonb_array_elements_text(
          case when jsonb_typeof(v_member -> 'recipeIds') = 'array' then v_member -> 'recipeIds' else '[]'::jsonb end)
      ), '{}');

      select count(*) into v_skipped
      from public.crafter_recipe_skips s
      join public.recipes r on r.id = s.recipe_id and r.status <> 'removed'
      where s.crafter_id = v_id and s.recipe_id = any (v_recipe_ids);

      -- The recipes the file names go in first, so that they are recorded as imported
      -- rather than as following from the skill.
      insert into public.crafter_recipes (crafter_id, recipe_id, source)
      select v_id, r.id, 'import'
      from public.recipes r
      where r.id = any (v_recipe_ids)
        and r.status <> 'removed'
        and not exists (
          select 1 from public.crafter_recipe_skips s where s.crafter_id = v_id and s.recipe_id = r.id
        )
      on conflict (crafter_id, recipe_id) do nothing;
      get diagnostics v_from_file = row_count;

      v_skills := '[]'::jsonb;
      for v_profession in
        select x.id, max(x.skill) as skill
        from jsonb_array_elements(
          case when jsonb_typeof(v_member -> 'professions') = 'array' then v_member -> 'professions' else '[]'::jsonb end) p
        cross join lateral (
          select
            case when p ->> 'id' ~ '^[0-9]{1,9}$' then (p ->> 'id')::integer end as id,
            case when p ->> 'skill' ~ '^[0-9]{1,3}$' then (p ->> 'skill')::integer end as skill
        ) x
        where x.skill between 1 and 450
          and exists (select 1 from public.professions pr where pr.id = x.id)
        group by x.id
        order by x.id
      loop
        -- Null when the crafter does not have the profession yet.
        select cp.skill into v_old
        from public.crafter_professions cp
        where cp.crafter_id = v_id and cp.profession_id = v_profession.id;
        if v_old is null or v_old < v_profession.skill then
          insert into public.crafter_professions (crafter_id, profession_id, skill)
          values (v_id, v_profession.id, v_profession.skill)
          on conflict (crafter_id, profession_id) do update set skill = excluded.skill;
          v_skills := v_skills || jsonb_build_object('professionId', v_profession.id, 'from', v_old, 'to', v_profession.skill);
        end if;
      end loop;

      select count(*) into v_after from public.crafter_recipes cr where cr.crafter_id = v_id;

      v_result := v_result || jsonb_build_object(
        'name', v_name,
        'crafterId', v_id,
        'created', v_created,
        'recipesAdded', v_after - v_before,
        'recipesFromFile', v_from_file,
        'recipesSkipped', v_skipped,
        'skills', v_skills
      );
    end loop;

    if not coalesce(p_apply, false) then
      raise exception 'A look only' using errcode = 'MM001';
    end if;
  exception when sqlstate 'MM001' then
    -- Everything written since "begin" is undone; the tally worked out on the way is kept.
    null;
  end;

  return v_result;
end;
$$;

-- What the site calls. It holds no rights of its own.
create or replace function public.admin_import_guild(p_members jsonb, p_list_new boolean, p_apply boolean)
returns jsonb
language sql
set search_path = ''
as $$ select private.admin_import_guild(p_members, p_list_new, p_apply) $$;

revoke all on function private.admin_import_guild(jsonb, boolean, boolean) from public, anon;
revoke all on function public.admin_import_guild(jsonb, boolean, boolean) from public, anon;
grant execute on function private.admin_import_guild(jsonb, boolean, boolean) to authenticated;
grant execute on function public.admin_import_guild(jsonb, boolean, boolean) to authenticated;
