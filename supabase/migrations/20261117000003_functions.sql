-- Functions the site calls. All run with the caller's privileges, so row level
-- security applies; the sync functions are executable by the service role only.

-- Everything the public crafting window needs, in one read: listed crafters,
-- the recipes at least one of them can make, and the items those recipes
-- make or consume.
create or replace function public.guild_craftables()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with listed as (
    select c.* from public.crafters c where c.is_listed
  ),
  makers as (
    select cr.recipe_id, jsonb_agg(cr.crafter_id order by cr.added_at, cr.crafter_id) as crafter_ids
    from public.crafter_recipes cr
    join listed l on l.id = cr.crafter_id
    group by cr.recipe_id
  ),
  rec as (
    select r.*, m.crafter_ids
    from public.recipes r
    join makers m on m.recipe_id = r.id
    where r.status <> 'removed'
  ),
  item_ids as (
    select crafted_item_id as id from rec where crafted_item_id is not null
    union
    select rr.item_id from public.recipe_reagents rr join rec on rec.id = rr.recipe_id
  ),
  last_run as (
    select build, finished_at from public.sync_runs where status = 'ok' order by id desc limit 1
  )
  select jsonb_build_object(
    'build', (select build from last_run),
    'syncedAt', (select finished_at from last_run),
    'professions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'iconFileId', p.icon_file_id
      ) order by p.name)
      from public.professions p
      where p.id in (select profession_id from rec)
    ), '[]'::jsonb),
    'crafters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'slug', l.slug,
        'characterName', l.character_name,
        'realm', l.realm,
        'faction', l.faction,
        'class', l.class,
        'level', l.level,
        'note', l.note,
        'skills', coalesce((
          select jsonb_object_agg(cp.profession_id, cp.skill)
          from public.crafter_professions cp where cp.crafter_id = l.id
        ), '{}'::jsonb)
      ) order by l.character_name)
      from listed l
    ), '[]'::jsonb),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rec.id,
        'professionId', rec.profession_id,
        'name', rec.name,
        'iconFileId', rec.icon_file_id,
        'craftedItemId', rec.crafted_item_id,
        'craftedCount', rec.crafted_count,
        'effectText', rec.effect_text,
        'category', rec.category,
        'categoryOrder', rec.category_order,
        'reagents', coalesce((
          select jsonb_agg(jsonb_build_array(rr.item_id, rr.quantity) order by rr.sort)
          from public.recipe_reagents rr where rr.recipe_id = rec.id
        ), '[]'::jsonb),
        'crafterIds', rec.crafter_ids
      ) order by rec.category_order, rec.name, rec.id)
      from rec
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_object_agg(i.id, jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'quality', i.quality,
        'iconFileId', i.icon_file_id,
        'classId', i.class_id,
        'subclassId', i.subclass_id,
        'inventoryType', i.inventory_type,
        'itemLevel', i.item_level,
        'requiredLevel', i.required_level,
        'bonding', i.bonding,
        'tradeable', i.is_tradeable,
        'sellPrice', i.sell_price,
        'slotName', i.slot_name,
        'typeName', i.type_name,
        'armor', i.armor,
        'damage', i.damage,
        'stats', i.stats,
        'tooltip', i.tooltip,
        'tooltipComplete', i.tooltip_complete
      ))
      from public.items i
      where i.id in (select id from item_ids)
    ), '{}'::jsonb)
  );
$$;

-- Every recipe in the game, compact, for the crafter's checklist.
create or replace function public.admin_catalog()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'latestRunId', (select max(id) from public.sync_runs where status = 'ok'),
    'firstRunId', (select min(id) from public.sync_runs where status = 'ok'),
    'professions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'iconFileId', p.icon_file_id,
        'childSkillLineIds', to_jsonb(p.child_skill_line_ids)
      ) order by p.name)
      from public.professions p
    ), '[]'::jsonb),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'professionId', r.profession_id,
        'name', r.name,
        'iconFileId', r.icon_file_id,
        'quality', coalesce(i.quality, 1),
        'tradeable', coalesce(i.is_tradeable, true),
        'requiredLevel', coalesce(i.required_level, 0),
        'slotName', i.slot_name,
        'typeName', i.type_name,
        'category', r.category,
        'categoryOrder', r.category_order,
        'learnSkill', coalesce(r.learn_skill_owner, r.learn_skill),
        'learnStatus', case when r.learn_skill_owner is not null then 'owner' else r.learn_skill_status end,
        'learnCandidates', r.learn_skill_candidates,
        'acquisition', r.acquisition,
        'acquisitionText', r.acquisition_text,
        'trainingCost', r.training_cost,
        'skillYellow', r.skill_yellow,
        'skillGrey', r.skill_grey,
        'firstSeenRunId', r.first_seen_run_id
      ) order by r.profession_id, coalesce(r.learn_skill_owner, r.learn_skill, r.skill_yellow), r.name)
      from public.recipes r
      left join public.items i on i.id = r.crafted_item_id
      where r.status = 'ok'
    ), '[]'::jsonb)
  );
$$;

-- Ticks and unticks recipes for one crafter in a single transaction.
create or replace function public.set_crafter_recipes(
  p_crafter_id uuid,
  p_add integer[],
  p_remove integer[],
  p_source text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_added integer;
  v_removed integer;
begin
  if not exists (
    select 1 from public.crafters c
    where c.id = p_crafter_id and c.user_id = (select auth.uid())
  ) then
    raise exception 'You can only change your own crafter' using errcode = '42501';
  end if;

  delete from public.crafter_recipes cr
  where cr.crafter_id = p_crafter_id and cr.recipe_id = any (coalesce(p_remove, '{}'));
  get diagnostics v_removed = row_count;

  insert into public.crafter_recipes (crafter_id, recipe_id, source)
  select p_crafter_id, r.id, p_source
  from public.recipes r
  where r.id = any (coalesce(p_add, '{}')) and r.status <> 'removed'
  on conflict (crafter_id, recipe_id) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('added', v_added, 'removed', v_removed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Game-data sync (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.sync_start(p_trigger text)
returns bigint
language sql
set search_path = ''
as $$
  insert into public.sync_runs (trigger) values (p_trigger) returning id;
$$;

-- What the database currently holds, as content hashes, so the sync can send
-- only what changed.
create or replace function public.sync_state()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_object_agg(id, content_hash) from public.items), '{}'::jsonb),
    'recipes', coalesce((
      select jsonb_object_agg(id, content_hash) from public.recipes where status <> 'removed'
    ), '{}'::jsonb),
    'professions', coalesce((select jsonb_agg(id) from public.professions), '[]'::jsonb)
  );
$$;

-- Writes one batch of game data. Rows use the table column names. A recipe row
-- carries its reagents as [[item_id, quantity], ...] under "reagents".
create or replace function public.sync_apply(p_run_id bigint, p_batch jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_items integer := 0;
  v_recipes integer := 0;
  v_new_recipes integer := 0;
begin
  insert into public.professions (id, slug, name, icon_file_id, child_skill_line_ids)
  select x.id, x.slug, x.name, x.icon_file_id, coalesce(x.child_skill_line_ids, '{}')
  from jsonb_populate_recordset(null::public.professions, coalesce(p_batch -> 'professions', '[]'::jsonb)) x
  on conflict (id) do update set
    slug = excluded.slug,
    name = excluded.name,
    icon_file_id = excluded.icon_file_id,
    child_skill_line_ids = excluded.child_skill_line_ids;

  insert into public.items (
    id, name, quality, icon_file_id, class_id, subclass_id, inventory_type, item_level,
    required_level, bonding, sell_price, slot_name, type_name, armor, damage, stats,
    tooltip, tooltip_complete, content_hash
  )
  select
    x.id, x.name, x.quality, x.icon_file_id, x.class_id, x.subclass_id, x.inventory_type,
    x.item_level, x.required_level, x.bonding, x.sell_price, x.slot_name, x.type_name,
    x.armor, x.damage, x.stats, x.tooltip, x.tooltip_complete, x.content_hash
  from jsonb_populate_recordset(null::public.items, coalesce(p_batch -> 'items', '[]'::jsonb)) x
  on conflict (id) do update set
    name = excluded.name,
    quality = excluded.quality,
    icon_file_id = excluded.icon_file_id,
    class_id = excluded.class_id,
    subclass_id = excluded.subclass_id,
    inventory_type = excluded.inventory_type,
    item_level = excluded.item_level,
    required_level = excluded.required_level,
    bonding = excluded.bonding,
    sell_price = excluded.sell_price,
    slot_name = excluded.slot_name,
    type_name = excluded.type_name,
    armor = excluded.armor,
    damage = excluded.damage,
    stats = excluded.stats,
    tooltip = excluded.tooltip,
    tooltip_complete = excluded.tooltip_complete,
    content_hash = excluded.content_hash,
    updated_at = now();
  get diagnostics v_items = row_count;

  select count(*) into v_new_recipes
  from jsonb_array_elements(coalesce(p_batch -> 'recipes', '[]'::jsonb)) e
  where not exists (select 1 from public.recipes r where r.id = (e ->> 'id')::integer);

  -- learn_skill_owner and first_seen_* are deliberately left alone on update.
  insert into public.recipes (
    id, profession_id, name, icon_file_id, crafted_item_id, crafted_count, effect_text,
    skill_yellow, skill_green, skill_grey, recipe_item_id, learn_skill, learn_skill_status,
    learn_skill_candidates, acquisition, acquisition_text, training_cost, category,
    category_order, status, content_hash, first_seen_run_id
  )
  select
    x.id, x.profession_id, x.name, x.icon_file_id, x.crafted_item_id, x.crafted_count,
    x.effect_text, x.skill_yellow, x.skill_green, x.skill_grey, x.recipe_item_id,
    x.learn_skill, x.learn_skill_status, x.learn_skill_candidates, x.acquisition,
    x.acquisition_text, x.training_cost, x.category, x.category_order, x.status,
    x.content_hash, p_run_id
  from jsonb_populate_recordset(null::public.recipes, coalesce(p_batch -> 'recipes', '[]'::jsonb)) x
  on conflict (id) do update set
    profession_id = excluded.profession_id,
    name = excluded.name,
    icon_file_id = excluded.icon_file_id,
    crafted_item_id = excluded.crafted_item_id,
    crafted_count = excluded.crafted_count,
    effect_text = excluded.effect_text,
    skill_yellow = excluded.skill_yellow,
    skill_green = excluded.skill_green,
    skill_grey = excluded.skill_grey,
    recipe_item_id = excluded.recipe_item_id,
    learn_skill = excluded.learn_skill,
    learn_skill_status = excluded.learn_skill_status,
    learn_skill_candidates = excluded.learn_skill_candidates,
    acquisition = excluded.acquisition,
    acquisition_text = excluded.acquisition_text,
    training_cost = excluded.training_cost,
    category = excluded.category,
    category_order = excluded.category_order,
    status = excluded.status,
    content_hash = excluded.content_hash,
    updated_at = now();
  get diagnostics v_recipes = row_count;

  delete from public.recipe_reagents rr
  where rr.recipe_id in (
    select (e ->> 'id')::integer
    from jsonb_array_elements(coalesce(p_batch -> 'recipes', '[]'::jsonb)) e
  );

  insert into public.recipe_reagents (recipe_id, sort, item_id, quantity)
  select (e ->> 'id')::integer, (g.ordinality - 1)::smallint, (g.pair ->> 0)::integer, (g.pair ->> 1)::integer
  from jsonb_array_elements(coalesce(p_batch -> 'recipes', '[]'::jsonb)) e
  cross join lateral jsonb_array_elements(coalesce(e -> 'reagents', '[]'::jsonb)) with ordinality as g(pair, ordinality);

  return jsonb_build_object('items', v_items, 'recipes', v_recipes, 'newRecipes', v_new_recipes);
end;
$$;

-- Closes a run. On success, recipes the game no longer lists are marked
-- removed rather than deleted, so nobody's list breaks.
create or replace function public.sync_finish(
  p_run_id bigint,
  p_status text,
  p_build text,
  p_stats jsonb,
  p_warnings jsonb,
  p_error text,
  p_present_recipe_ids integer[]
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_removed integer := 0;
begin
  if p_status = 'ok' and p_present_recipe_ids is not null then
    update public.recipes
    set status = 'removed', updated_at = now()
    where status <> 'removed' and id <> all (p_present_recipe_ids);
    get diagnostics v_removed = row_count;
  end if;

  update public.sync_runs
  set status = p_status,
      finished_at = now(),
      build = p_build,
      stats = coalesce(p_stats, '{}'::jsonb) || jsonb_build_object('removedRecipes', v_removed),
      warnings = coalesce(p_warnings, '[]'::jsonb),
      error = p_error
  where id = p_run_id;

  return v_removed;
end;
$$;

-- Who may call what.
revoke all on function public.guild_craftables() from public;
revoke all on function public.admin_catalog() from public;
revoke all on function public.set_crafter_recipes(uuid, integer[], integer[], text) from public;
revoke all on function public.sync_start(text) from public, anon, authenticated;
revoke all on function public.sync_state() from public, anon, authenticated;
revoke all on function public.sync_apply(bigint, jsonb) from public, anon, authenticated;
revoke all on function public.sync_finish(bigint, text, text, jsonb, jsonb, text, integer[]) from public, anon, authenticated;

grant execute on function public.guild_craftables() to anon, authenticated, service_role;
grant execute on function public.admin_catalog() to authenticated, service_role;
revoke execute on function public.admin_catalog() from anon;
grant execute on function public.set_crafter_recipes(uuid, integer[], integer[], text) to authenticated;
revoke execute on function public.set_crafter_recipes(uuid, integer[], integer[], text) from anon;
grant execute on function public.sync_start(text) to service_role;
grant execute on function public.sync_state() to service_role;
grant execute on function public.sync_apply(bigint, jsonb) to service_role;
grant execute on function public.sync_finish(bigint, text, text, jsonb, jsonb, text, integer[]) to service_role;
