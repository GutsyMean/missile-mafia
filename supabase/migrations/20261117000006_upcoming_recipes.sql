-- The public crafting window now also shows:
--   * for every recipe, the profession skill needed to learn it, the skill-up
--     thresholds and where the recipe comes from;
--   * recipes a listed crafter has the profession for but has not learned yet.
--     They carry no crafter ("crafterIds" is empty) and name who could learn
--     them ("pendingCrafterIds"), so the window can show them greyed out.
--
-- Nothing is stored for this: it follows from the crafter's list and the game
-- data, so a recipe a later sync adds appears as "not yet learned" by itself.

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
  -- Who has the profession (a skill above zero) but not the recipe.
  learners as (
    select r.id as recipe_id, jsonb_agg(l.id order by l.character_name, l.id) as crafter_ids
    from listed l
    join public.crafter_professions cp on cp.crafter_id = l.id and cp.skill > 0
    join public.recipes r on r.profession_id = cp.profession_id and r.status = 'ok'
    where not exists (
      select 1 from public.crafter_recipes cr where cr.crafter_id = l.id and cr.recipe_id = r.id
    )
    group by r.id
  ),
  rec as (
    select r.*,
      coalesce(m.crafter_ids, '[]'::jsonb) as crafter_ids,
      coalesce(ln.crafter_ids, '[]'::jsonb) as pending_crafter_ids
    from public.recipes r
    left join makers m on m.recipe_id = r.id
    left join learners ln on ln.recipe_id = r.id
    where r.status <> 'removed' and (m.recipe_id is not null or ln.recipe_id is not null)
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
        'crafterIds', rec.crafter_ids,
        'pendingCrafterIds', rec.pending_crafter_ids,
        'learnSkill', coalesce(rec.learn_skill_owner, rec.learn_skill),
        'skillYellow', rec.skill_yellow,
        'skillGreen', rec.skill_green,
        'skillGrey', rec.skill_grey,
        'acquisition', rec.acquisition,
        'acquisitionText', rec.acquisition_text
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

revoke all on function public.guild_craftables() from public;
grant execute on function public.guild_craftables() to anon, authenticated, service_role;
