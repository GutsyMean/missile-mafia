-- Choosing gear by class, talent tree and level.
--
--   items.class_mask   the classes an item is limited to (the game's own mask),
--                      null when every class may use it.
--   game_meta          small documents the sync keeps whole. "classes" is the
--                      playable classes with their talent trees and the level
--                      at which each kind of armour and weapon opens to them.
--
-- The public document now carries the classes and each item's class limit, and
-- one new reader serves the gear of professions nobody in the guild has, so
-- that "the best craftable piece" really looks at everything.

alter table public.items add column class_mask integer;

create table public.game_meta (
  key text primary key check (char_length(key) between 1 and 40),
  value jsonb not null,
  -- Set by the sync, like the hashes on items and recipes, so it can tell what changed.
  content_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.game_meta enable row level security;
revoke all on public.game_meta from anon, authenticated;
grant select on public.game_meta to anon, authenticated;
grant all on public.game_meta to service_role;
create policy "anyone can read game meta" on public.game_meta
  for select to anon, authenticated using (true);

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
  -- Whole documents, by name, each as {"value": ..., "content_hash": ...}. One that has not changed is left alone.
  insert into public.game_meta (key, value, content_hash)
  select m.key, m.value -> 'value', m.value ->> 'content_hash'
  from jsonb_each(coalesce(p_batch -> 'meta', '{}'::jsonb)) m
  on conflict (key) do update set
    value = excluded.value,
    content_hash = excluded.content_hash,
    updated_at = now()
  where public.game_meta.content_hash is distinct from excluded.content_hash;

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
    class_mask, tooltip, tooltip_complete, content_hash
  )
  select
    x.id, x.name, x.quality, x.icon_file_id, x.class_id, x.subclass_id, x.inventory_type,
    x.item_level, x.required_level, x.bonding, x.sell_price, x.slot_name, x.type_name,
    x.armor, x.damage, x.stats, x.class_mask, x.tooltip, x.tooltip_complete, x.content_hash
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
    class_mask = excluded.class_mask,
    tooltip = excluded.tooltip,
    tooltip_complete = excluded.tooltip_complete,
    content_hash = excluded.content_hash,
    updated_at = now();
  get diagnostics v_items = row_count;

  select count(*) into v_new_recipes
  from jsonb_array_elements(coalesce(p_batch -> 'recipes', '[]'::jsonb)) e
  where not exists (select 1 from public.recipes r where r.id = (e ->> 'id')::integer);

  -- learn_skill_owner, quest_faction_owner and first_seen_* are deliberately left alone on update.
  insert into public.recipes (
    id, profession_id, name, icon_file_id, crafted_item_id, crafted_count, effect_text,
    skill_yellow, skill_green, skill_grey, recipe_item_id, learn_skill, learn_skill_status,
    learn_skill_candidates, acquisition, acquisition_text, quest_faction, training_cost,
    category, category_order, status, content_hash, first_seen_run_id
  )
  select
    x.id, x.profession_id, x.name, x.icon_file_id, x.crafted_item_id, x.crafted_count,
    x.effect_text, x.skill_yellow, x.skill_green, x.skill_grey, x.recipe_item_id,
    x.learn_skill, x.learn_skill_status, x.learn_skill_candidates, x.acquisition,
    x.acquisition_text, x.quest_faction, x.training_cost, x.category, x.category_order,
    x.status, x.content_hash, p_run_id
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
    quest_faction = excluded.quest_faction,
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
  -- Listed crafters by the professions they have (a skill above zero).
  practitioners as (
    select cp.profession_id, l.id as crafter_id, l.character_name
    from listed l
    join public.crafter_professions cp on cp.crafter_id = l.id and cp.skill > 0
    where cp.profession_id in (select profession_id from public.recipes where status <> 'removed')
  ),
  rec as (
    select r.*, m.crafter_ids,
      coalesce((
        select jsonb_agg(p.crafter_id order by p.character_name, p.crafter_id)
        from practitioners p
        where p.profession_id = r.profession_id
          and not exists (
            select 1 from public.crafter_recipes cr where cr.crafter_id = p.crafter_id and cr.recipe_id = r.id
          )
      ), '[]'::jsonb) as pending_crafter_ids
    from public.recipes r
    join makers m on m.recipe_id = r.id
    where r.status <> 'removed'
  ),
  unlearned as (
    select r.profession_id, count(*) as recipes
    from public.recipes r
    where r.status = 'ok'
      and exists (select 1 from practitioners p where p.profession_id = r.profession_id)
      and not exists (select 1 from makers m where m.recipe_id = r.id)
    group by r.profession_id
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
    'classes', coalesce((select m.value from public.game_meta m where m.key = 'classes'), '[]'::jsonb),
    'professions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'iconFileId', p.icon_file_id
      ) order by p.name)
      from public.professions p
      where p.id in (select profession_id from rec)
         or p.id in (select profession_id from practitioners)
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
    'unlearned', coalesce((
      select jsonb_agg(jsonb_build_object('professionId', u.profession_id, 'count', u.recipes) order by u.profession_id)
      from unlearned u
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
        'crafterIds', rec.crafter_ids,
        'pendingCrafterIds', rec.pending_crafter_ids,
        'learnSkill', coalesce(rec.learn_skill_owner, rec.learn_skill),
        'skillYellow', rec.skill_yellow,
        'skillGreen', rec.skill_green,
        'skillGrey', rec.skill_grey,
        'acquisition', rec.acquisition,
        'acquisitionText', rec.acquisition_text
      ) || case
        when nullif(coalesce(rec.quest_faction_owner, rec.quest_faction), 'none') is null then '{}'::jsonb
        else jsonb_build_object('questFaction', nullif(coalesce(rec.quest_faction_owner, rec.quest_faction), 'none'))
      end order by rec.category_order, rec.name, rec.id)
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
      ) || case
        when i.class_mask is null then '{}'::jsonb
        else jsonb_build_object('classMask', i.class_mask)
      end)
      from public.items i
      where i.id in (select id from item_ids)
    ), '{}'::jsonb)
  );
$$;

create or replace function public.guild_unlearned(p_profession_id integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with listed as (
    select c.* from public.crafters c where c.is_listed
  ),
  -- Listed crafters who have this profession: every one of them has yet to learn these recipes.
  practitioners as (
    select l.id as crafter_id, l.character_name
    from listed l
    join public.crafter_professions cp on cp.crafter_id = l.id and cp.skill > 0
    where cp.profession_id = p_profession_id
  ),
  rec as (
    select r.*
    from public.recipes r
    where r.profession_id = p_profession_id
      and r.status = 'ok'
      and exists (select 1 from practitioners)
      and not exists (
        select 1 from public.crafter_recipes cr join listed l on l.id = cr.crafter_id where cr.recipe_id = r.id
      )
  ),
  item_ids as (
    select crafted_item_id as id from rec where crafted_item_id is not null
    union
    select rr.item_id from public.recipe_reagents rr join rec on rec.id = rr.recipe_id
  )
  select jsonb_build_object(
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
        'crafterIds', '[]'::jsonb,
        'pendingCrafterIds', coalesce((
          select jsonb_agg(p.crafter_id order by p.character_name, p.crafter_id) from practitioners p
        ), '[]'::jsonb),
        'learnSkill', coalesce(rec.learn_skill_owner, rec.learn_skill),
        'skillYellow', rec.skill_yellow,
        'skillGreen', rec.skill_green,
        'skillGrey', rec.skill_grey,
        'acquisition', rec.acquisition,
        'acquisitionText', rec.acquisition_text
      ) || case
        when nullif(coalesce(rec.quest_faction_owner, rec.quest_faction), 'none') is null then '{}'::jsonb
        else jsonb_build_object('questFaction', nullif(coalesce(rec.quest_faction_owner, rec.quest_faction), 'none'))
      end order by rec.category_order, rec.name, rec.id)
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
      ) || case
        when i.class_mask is null then '{}'::jsonb
        else jsonb_build_object('classMask', i.class_mask)
      end)
      from public.items i
      where i.id in (select id from item_ids)
    ), '{}'::jsonb)
  );
$$;

create or replace function public.guild_gear_elsewhere()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with listed as (
    select c.* from public.crafters c where c.is_listed
  ),
  -- Professions some listed crafter has. Their recipes are served by guild_unlearned().
  practised as (
    select distinct cp.profession_id
    from listed l
    join public.crafter_professions cp on cp.crafter_id = l.id and cp.skill > 0
  ),
  -- Recipes for things to wear or wield (item classes 2 and 4) in every other profession.
  rec as (
    select r.*
    from public.recipes r
    join public.items i on i.id = r.crafted_item_id
    where r.status = 'ok'
      and i.class_id in (2, 4)
      and i.inventory_type > 0
      and r.profession_id not in (select profession_id from practised)
      and not exists (
        select 1 from public.crafter_recipes cr join listed l on l.id = cr.crafter_id where cr.recipe_id = r.id
      )
  ),
  item_ids as (
    select crafted_item_id as id from rec where crafted_item_id is not null
    union
    select rr.item_id from public.recipe_reagents rr join rec on rec.id = rr.recipe_id
  )
  select jsonb_build_object(
    'professions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'iconFileId', p.icon_file_id
      ) order by p.name)
      from public.professions p
      where p.id in (select profession_id from rec)
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
        'crafterIds', '[]'::jsonb,
        'pendingCrafterIds', '[]'::jsonb,
        'learnSkill', coalesce(rec.learn_skill_owner, rec.learn_skill),
        'skillYellow', rec.skill_yellow,
        'skillGreen', rec.skill_green,
        'skillGrey', rec.skill_grey,
        'acquisition', rec.acquisition,
        'acquisitionText', rec.acquisition_text
      ) || case
        when nullif(coalesce(rec.quest_faction_owner, rec.quest_faction), 'none') is null then '{}'::jsonb
        else jsonb_build_object('questFaction', nullif(coalesce(rec.quest_faction_owner, rec.quest_faction), 'none'))
      end order by rec.category_order, rec.name, rec.id)
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
      ) || case
        when i.class_mask is null then '{}'::jsonb
        else jsonb_build_object('classMask', i.class_mask)
      end)
      from public.items i
      where i.id in (select id from item_ids)
    ), '{}'::jsonb)
  );
$$;

-- What the database holds, as content hashes: now with the whole documents too.
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
    'professions', coalesce((select jsonb_agg(id) from public.professions), '[]'::jsonb),
    'meta', coalesce((select jsonb_object_agg(key, content_hash) from public.game_meta), '{}'::jsonb)
  );
$$;

revoke all on function public.sync_state() from public, anon, authenticated;
grant execute on function public.sync_state() to service_role;
revoke all on function public.sync_apply(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.sync_apply(bigint, jsonb) to service_role;
revoke all on function public.guild_craftables() from public;
grant execute on function public.guild_craftables() to anon, authenticated, service_role;
revoke all on function public.guild_unlearned(integer) from public;
grant execute on function public.guild_unlearned(integer) to anon, authenticated, service_role;
revoke all on function public.guild_gear_elsewhere() from public;
grant execute on function public.guild_gear_elsewhere() to anon, authenticated, service_role;
