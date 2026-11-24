-- Gear that is not crafted, for comparing against what the guild can make.
--
-- The sync keeps one document, "gear_sources", in game_meta: for each item a
-- published page names a source for (a dungeon boss, a dungeon quest, a
-- best-in-slot list), the list of those sources. The items themselves are
-- ordinary rows in items. This reader hands both to the gear finder, which
-- asks for them only when a visitor wants to see gear from every source.

create or replace function public.gear_from_sources()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with sourced as (
    select e.key::integer as item_id, e.value as sources
    from public.game_meta m
    cross join lateral jsonb_each(m.value) e
    where m.key = 'gear_sources'
  ),
  -- Only items the database holds: a source for an item the game no longer has is of no use.
  held as (
    select s.item_id, s.sources from sourced s where exists (select 1 from public.items i where i.id = s.item_id)
  )
  select jsonb_build_object(
    'sources', coalesce((select jsonb_object_agg(h.item_id, h.sources) from held h), '{}'::jsonb),
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
      where i.id in (select item_id from held)
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.gear_from_sources() from public;
grant execute on function public.gear_from_sources() to anon, authenticated, service_role;
