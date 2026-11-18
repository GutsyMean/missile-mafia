-- A profession is one the game data has recipes for. When a sync retires every
-- recipe of a skill line (because the game data no longer treats it as a
-- profession, as with the class skills Poisons, Survival and Comprehension),
-- it drops out of the profile form, the checklist and the public pickers by
-- itself. Nothing is deleted: the rows stay, and return if the recipes do.
--
-- Only two readers change: the admin catalog's list of professions, and the
-- public document's notion of who practises what.

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
      where p.id in (select profession_id from public.recipes where status <> 'removed')
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

revoke all on function public.admin_catalog() from public, anon;
grant execute on function public.admin_catalog() to authenticated, service_role;
revoke all on function public.guild_craftables() from public;
grant execute on function public.guild_craftables() to anon, authenticated, service_role;
