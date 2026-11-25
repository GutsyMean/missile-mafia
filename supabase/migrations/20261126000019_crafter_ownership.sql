-- Who manages a crafter is worked out without reading the column that says so.
--
-- The account behind a crafter (crafters.user_id) has been readable by every
-- visitor, because listed crafters are public and the whole row came with
-- them. The id is not a name, but two crafters with the same one are plainly
-- one player's characters, which the site otherwise keeps for its admins.
--
-- The column is taken away from visitors and signed-in users in the next
-- migration. This one first makes everything that relied on reading it stand
-- on its own, so that nothing breaks in between:
--
--   * rules on other tables that asked "is this crafter mine?" by looking at
--     the column now ask a function that may look for them;
--   * the public documents name the crafter columns they use instead of
--     taking the whole row;
--   * a signed-in member gets their own crafters from a function, not by
--     searching the table for their account.

-- Whether the crafter is managed by the account asking.
create or replace function private.manages_crafter(p_crafter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crafters c where c.id = p_crafter_id and c.user_id = (select auth.uid())
  )
$$;

revoke all on function private.manages_crafter(uuid) from public, anon;
grant execute on function private.manages_crafter(uuid) to authenticated;

alter policy "owners can add crafter professions" on public.crafter_professions
  with check (private.manages_crafter(crafter_id));
alter policy "owners can change crafter professions" on public.crafter_professions
  using (private.manages_crafter(crafter_id))
  with check (private.manages_crafter(crafter_id));
alter policy "owners can remove crafter professions" on public.crafter_professions
  using (private.manages_crafter(crafter_id));

alter policy "owners can add crafter recipes" on public.crafter_recipes
  with check (private.manages_crafter(crafter_id));
alter policy "owners can remove crafter recipes" on public.crafter_recipes
  using (private.manages_crafter(crafter_id));

alter policy "owners can see what they took off" on public.crafter_recipe_skips
  using (private.manages_crafter(crafter_id));
alter policy "owners can take recipes off" on public.crafter_recipe_skips
  with check (private.manages_crafter(crafter_id));
alter policy "owners can put recipes back" on public.crafter_recipe_skips
  using (private.manages_crafter(crafter_id));

-- The crafters an account manages, by name. Nothing for a visitor.
create or replace function private.my_crafters()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'characterName', c.character_name,
    'realm', c.realm,
    'faction', c.faction,
    'class', c.class,
    'level', c.level,
    'note', c.note
  ) order by c.character_name, c.id), '[]'::jsonb)
  from public.crafters c
  where c.user_id = (select auth.uid())
$$;

create or replace function public.my_crafters()
returns jsonb
language sql
stable
set search_path = ''
as $$ select private.my_crafters() $$;

revoke all on function private.my_crafters() from public, anon;
revoke all on function public.my_crafters() from public, anon;
grant execute on function private.my_crafters() to authenticated;
grant execute on function public.my_crafters() to authenticated;

-- Ticking and unticking: the same as before, asking the function whose crafter it is.
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
  if not private.manages_crafter(p_crafter_id) then
    raise exception 'You can only change your own crafter' using errcode = '42501';
  end if;

  delete from public.crafter_recipes cr
  where cr.crafter_id = p_crafter_id and cr.recipe_id = any (coalesce(p_remove, '{}'));
  get diagnostics v_removed = row_count;

  -- What is taken off stays off; what is put back is welcome again.
  insert into public.crafter_recipe_skips (crafter_id, recipe_id)
  select p_crafter_id, r.id
  from public.recipes r
  where r.id = any (coalesce(p_remove, '{}'))
  on conflict (crafter_id, recipe_id) do nothing;
  delete from public.crafter_recipe_skips s
  where s.crafter_id = p_crafter_id and s.recipe_id = any (coalesce(p_add, '{}'));

  insert into public.crafter_recipes (crafter_id, recipe_id, source)
  select p_crafter_id, r.id, p_source
  from public.recipes r
  where r.id = any (coalesce(p_add, '{}')) and r.status <> 'removed'
  on conflict (crafter_id, recipe_id) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('added', v_added, 'removed', v_removed);
end;
$$;

-- The public documents: the same as before, naming the crafter columns they use.
create or replace function public.guild_craftables()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with listed as (
    select c.id, c.slug, c.character_name, c.realm, c.faction, c.class, c.level, c.note
    from public.crafters c
    where c.is_listed
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
    select c.id, c.slug, c.character_name, c.realm, c.faction, c.class, c.level, c.note
    from public.crafters c
    where c.is_listed
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
    select c.id, c.slug, c.character_name, c.realm, c.faction, c.class, c.level, c.note
    from public.crafters c
    where c.is_listed
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
