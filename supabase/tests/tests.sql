-- Tests for the migrations. Each check prints "ok - ..." or aborts the run.
\set owner '11111111-1111-1111-1111-111111111111'
\set other '22222222-2222-2222-2222-222222222222'
\set crafter_owner 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set crafter_other 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

insert into auth.users (id) values (:'owner'), (:'other');

-- ---------------------------------------------------------------------------
-- The sync writes game data (service role)
-- ---------------------------------------------------------------------------
set role service_role;

select public.sync_start('cli') as run1 \gset
select test.is(:run1::bigint > 0, true, 'sync_start returns a run id');

select public.sync_apply(:run1, $json${
  "professions": [{"id": 164, "slug": "blacksmithing", "name": "Blacksmithing", "icon_file_id": 136241, "child_skill_line_ids": [2938]}],
  "items": [
    {"id": 3483, "name": "Silvered Bronze Gauntlets", "quality": 2, "icon_file_id": 132939, "class_id": 4, "subclass_id": 3,
     "inventory_type": 10, "item_level": 27, "required_level": 22, "bonding": 2, "sell_price": 965, "slot_name": "Hands",
     "type_name": "Mail", "armor": 118, "damage": null, "stats": [{"stat": 4, "name": "Strength", "value": 4}],
     "tooltip": [{"text": "Silvered Bronze Gauntlets", "color": "quality"}], "tooltip_complete": true, "content_hash": "i1"},
    {"id": 250528, "name": "Veteran's Silvered Chain Helm", "quality": 3, "icon_file_id": 133141, "class_id": 4, "subclass_id": 3,
     "inventory_type": 1, "item_level": 25, "required_level": 20, "bonding": 1, "sell_price": 1439, "slot_name": "Head",
     "type_name": "Mail", "armor": 163, "damage": null, "stats": [],
     "tooltip": [{"text": "Veteran's Silvered Chain Helm", "color": "quality"}], "tooltip_complete": true, "content_hash": "i2"},
    {"id": 2841, "name": "Bronze Bar", "quality": 1, "icon_file_id": 133227, "class_id": 7, "subclass_id": 7,
     "inventory_type": 0, "item_level": 20, "required_level": 0, "bonding": 0, "sell_price": 50, "slot_name": null,
     "type_name": null, "armor": null, "damage": null, "stats": [],
     "tooltip": [{"text": "Bronze Bar", "color": "quality"}], "tooltip_complete": true, "content_hash": "i3"}
  ],
  "recipes": [
    {"id": 3333, "profession_id": 164, "name": "Silvered Bronze Gauntlets", "icon_file_id": 132939, "crafted_item_id": 3483,
     "crafted_count": 1, "effect_text": null, "skill_yellow": 140, "skill_green": 155, "skill_grey": 170, "recipe_item_id": null,
     "learn_skill": 110, "learn_skill_status": "confirmed", "learn_skill_candidates": {"wowForever": 110, "wiki": 110, "recipeItem": null},
     "acquisition": "trainer", "acquisition_text": "Trainer · 10s", "training_cost": 1000, "category": "Mail Armor",
     "category_order": 103, "status": "ok", "content_hash": "r1", "reagents": [[2841, 8], [2842, 1], [3478, 2]]},
    {"id": 1252277, "profession_id": 164, "name": "Veteran's Silvered Chain Helm", "icon_file_id": 133141, "crafted_item_id": 250528,
     "crafted_count": 1, "effect_text": null, "skill_yellow": 125, "skill_green": 140, "skill_grey": 155, "recipe_item_id": 251380,
     "learn_skill": 95, "learn_skill_status": "confirmed", "learn_skill_candidates": {}, "acquisition": "drop vendor",
     "acquisition_text": null, "training_cost": null, "category": "Mail Armor", "category_order": 103, "status": "ok",
     "content_hash": "r2", "reagents": [[2841, 15]]},
    {"id": 9999, "profession_id": 164, "name": "Mystery Recipe", "icon_file_id": 0, "crafted_item_id": null,
     "crafted_count": 1, "effect_text": null, "skill_yellow": 10, "skill_green": 15, "skill_grey": 20, "recipe_item_id": null,
     "learn_skill": null, "learn_skill_status": "unconfirmed", "learn_skill_candidates": {}, "acquisition": "unknown",
     "acquisition_text": null, "training_cost": null, "category": "Other", "category_order": 990, "status": "ok",
     "content_hash": "r3", "reagents": []}
  ]
}$json$::jsonb) as applied \gset

select test.is((:'applied'::jsonb ->> 'newRecipes')::int, 3, 'sync_apply reports new recipes');
select test.is((select count(*)::int from public.items), 3, 'sync_apply stores items');
select test.is((select count(*)::int from public.recipe_reagents where recipe_id = 3333), 3, 'sync_apply stores reagents in order');
select test.is((select item_id from public.recipe_reagents where recipe_id = 3333 and sort = 2), 3478, 'reagent order is kept');
select test.is((select is_tradeable from public.items where id = 250528), false, 'a Bind on Pickup item is not tradeable');
select test.is((select is_tradeable from public.items where id = 3483), true, 'a Bind on Equip item is tradeable');
select test.is((select first_seen_run_id from public.recipes where id = 3333), :run1::bigint, 'new recipes remember the run that added them');
select test.is(public.sync_state() -> 'items' ->> '3483', 'i1', 'sync_state returns content hashes');

select public.sync_finish(:run1, 'ok', '1.60.1.70938', '{}'::jsonb, '[]'::jsonb, null, array[3333, 1252277, 9999]);
select test.is((select status from public.sync_runs where id = :run1), 'ok', 'sync_finish closes the run');

reset role;

-- Crafters are seeded by the site owner, not by clients.
insert into public.crafters (id, user_id, slug, character_name, is_listed) values
  (:'crafter_owner', :'owner', 'damien', 'Damien', true),
  (:'crafter_other', :'other', 'hidden', 'Hidden', false);
insert into public.crafter_recipes (crafter_id, recipe_id) values (:'crafter_other', 1252277);
insert into public.app_admins (user_id) values (:'owner');

-- ---------------------------------------------------------------------------
-- Visitors: read everything public, write nothing
-- ---------------------------------------------------------------------------
set role anon;
select test.login(null);

select test.is((select count(*)::int from public.recipes), 3, 'a visitor can read recipes');
select test.is((select count(*)::int from public.items), 3, 'a visitor can read items');
select test.is((select count(*)::int from public.crafters), 1, 'a visitor sees only listed crafters');
select test.throws($$insert into public.recipes (id, profession_id, name, skill_yellow, skill_green, skill_grey, category, content_hash) values (1, 164, 'x', 1, 1, 1, 'x', 'x')$$, '42501', 'a visitor cannot add recipes');
select test.throws($$update public.items set name = 'hacked'$$, '42501', 'a visitor cannot change items');
select test.throws($$delete from public.crafters$$, '42501', 'a visitor cannot delete crafters');
select test.throws($$insert into public.crafter_recipes (crafter_id, recipe_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3333)$$, '42501', 'a visitor cannot tick recipes');
select test.throws($$select public.sync_apply(1, '{}'::jsonb)$$, '42501', 'a visitor cannot run the sync write');
select test.throws($$select public.sync_start('manual')$$, '42501', 'a visitor cannot start a sync run');
select test.throws($$select public.admin_catalog()$$, '42501', 'a visitor cannot read the admin catalog');
select test.throws($$select public.set_crafter_recipes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', array[3333], '{}')$$, '42501', 'a visitor cannot call set_crafter_recipes');

reset role;

-- The sync functions are closed at the function level too, not only by table rights.
select test.is(has_function_privilege('anon', 'public.sync_start(text)', 'execute'), false, 'visitors have no execute right on sync_start');
select test.is(has_function_privilege('anon', 'public.sync_state()', 'execute'), false, 'visitors have no execute right on sync_state');
select test.is(has_function_privilege('anon', 'public.sync_apply(bigint, jsonb)', 'execute'), false, 'visitors have no execute right on sync_apply');
select test.is(has_function_privilege('authenticated', 'public.sync_apply(bigint, jsonb)', 'execute'), false, 'signed-in users have no execute right on sync_apply');
select test.is(has_function_privilege('authenticated', 'public.sync_finish(bigint, text, text, jsonb, jsonb, text, integer[])', 'execute'), false, 'signed-in users have no execute right on sync_finish');
select test.is(has_function_privilege('service_role', 'public.sync_apply(bigint, jsonb)', 'execute'), true, 'the service role can run sync_apply');

-- ---------------------------------------------------------------------------
-- A signed-in crafter: only their own rows
-- ---------------------------------------------------------------------------
set role authenticated;
select test.login(:'owner');

select test.is(
  public.set_crafter_recipes(:'crafter_owner', array[3333, 1252277], '{}'::int[], 'bulk') ->> 'added', '2',
  'an owner can tick recipes for their crafter');
select test.is(
  public.set_crafter_recipes(:'crafter_owner', array[3333], array[1252277]) ->> 'removed', '1',
  'an owner can untick recipes');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner'), 1, 'ticks are stored');
select test.is(
  test.affected($$update public.crafters set note = 'Whisper me' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 1,
  'an owner can edit their profile');
select test.throws($$update public.crafters set is_listed = false where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', 'an owner cannot change whether they are listed');
select test.throws($$update public.crafters set user_id = null where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', 'an owner cannot reassign a crafter');
select test.throws($$insert into public.crafters (slug, character_name) values ('new', 'New')$$, '42501', 'registration is closed: nobody can create a crafter');
select test.is(
  test.affected($$insert into public.crafter_professions (crafter_id, profession_id, skill) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 164, 145)$$), 1,
  'an owner can set their profession skill');

select test.throws($$select public.set_crafter_recipes('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', array[3333], '{}')$$, '42501', 'a crafter cannot tick recipes for someone else');
select test.throws($$insert into public.crafter_recipes (crafter_id, recipe_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3333)$$, '42501', 'row security blocks a direct insert for someone else');
select test.is(
  test.affected($$delete from public.crafter_recipes where crafter_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$), 0,
  'a crafter cannot untick someone else''s recipes');
select test.is(
  test.affected($$update public.crafters set note = 'hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$), 0,
  'a crafter cannot edit someone else''s profile');
select test.throws($$insert into public.crafter_professions (crafter_id, profession_id, skill) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 164, 300)$$, '42501', 'a crafter cannot set someone else''s skill');
select test.throws($$select public.sync_apply(1, '{}'::jsonb)$$, '42501', 'a signed-in user cannot run the sync write');
select test.throws($$update public.recipes set name = 'hacked' where id = 3333$$, '42501', 'nobody signed in can rename a recipe');

-- Admin correction of an unlock level.
select test.is(
  test.affected($$update public.recipes set learn_skill_owner = 20 where id = 9999$$), 1,
  'an admin can correct an unlock level');
select test.is(
  (select r ->> 'learnStatus' from jsonb_array_elements(public.admin_catalog() -> 'recipes') r where (r ->> 'id')::int = 9999), 'owner',
  'the catalog marks an owner-corrected level');
select test.is(
  (select (r ->> 'learnSkill')::int from jsonb_array_elements(public.admin_catalog() -> 'recipes') r where (r ->> 'id')::int = 9999), 20,
  'the catalog shows the corrected level');
select test.is(
  (select (r ->> 'learnSkill')::int from jsonb_array_elements(public.admin_catalog() -> 'recipes') r where (r ->> 'id')::int = 3333), 110,
  'the catalog shows the sourced level otherwise');

select test.login(:'other');
select test.is(
  test.affected($$update public.recipes set learn_skill_owner = 99 where id = 9999$$), 0,
  'a non-admin cannot correct an unlock level');
select test.is((select count(*)::int from public.crafters), 2, 'an owner can see their own unlisted crafter');

reset role;

-- ---------------------------------------------------------------------------
-- The public read
-- ---------------------------------------------------------------------------
set role anon;
select test.login(null);
select public.guild_craftables() as doc \gset

select test.is(
  (select count(*)::int from jsonb_array_elements(:'doc'::jsonb -> 'recipes') r where jsonb_array_length(r -> 'crafterIds') > 0), 1,
  'guild_craftables marks as craftable only what listed crafters can make');
select test.is(:'doc'::jsonb -> 'recipes' -> 0 ->> 'name', 'Silvered Bronze Gauntlets', 'the recipe is included');
select test.is(:'doc'::jsonb -> 'recipes' -> 0 -> 'reagents', '[[2841, 8], [2842, 1], [3478, 2]]'::jsonb, 'with its reagents in order');
select test.is(:'doc'::jsonb -> 'recipes' -> 0 -> 'crafterIds' ->> 0, :'crafter_owner', 'and who can craft it');
select test.is(:'doc'::jsonb -> 'items' -> '3483' ->> 'tradeable', 'true', 'crafted items come with their data');
select test.is(:'doc'::jsonb -> 'items' ? '2841', true, 'reagent items are included');

-- Every item shows the profession skill it needs.
select test.is((:'doc'::jsonb -> 'recipes' -> 0 ->> 'learnSkill')::int, 110, 'each recipe comes with the skill needed to learn it');
select test.is(
  array[(:'doc'::jsonb -> 'recipes' -> 0 ->> 'skillYellow')::int, (:'doc'::jsonb -> 'recipes' -> 0 ->> 'skillGreen')::int, (:'doc'::jsonb -> 'recipes' -> 0 ->> 'skillGrey')::int],
  array[140, 155, 170], 'and the skill-up thresholds');
select test.is(:'doc'::jsonb -> 'recipes' -> 0 ->> 'acquisitionText', 'Trainer · 10s', 'and where it comes from');

-- Recipes nobody has learned yet are not in the main document; it only says which professions have some.
select test.is(jsonb_array_length(:'doc'::jsonb -> 'recipes'), 1, 'the main document lists only what listed crafters can make');
select test.is(:'doc'::jsonb -> 'unlearned', '[{"count": 2, "professionId": 164}]'::jsonb, 'and says which professions have recipes still to learn');
select test.is(:'doc'::jsonb -> 'items' ? '250528', false, 'items only an unlisted crafter makes are left out of it');
select test.is(:'doc'::jsonb -> 'recipes' -> 0 -> 'pendingCrafterIds', '[]'::jsonb, 'a learned recipe is not pending for its crafter');

-- They are served one profession at a time.
select public.guild_unlearned(164) as later \gset
select test.is(jsonb_array_length(:'later'::jsonb -> 'recipes'), 2, 'recipes still to learn are served per profession');
select test.is(
  (select r -> 'crafterIds' from jsonb_array_elements(:'later'::jsonb -> 'recipes') r where (r ->> 'id')::int = 1252277), '[]'::jsonb,
  'an unlisted crafter does not make a recipe available');
select test.is(
  (select r -> 'pendingCrafterIds' ->> 0 from jsonb_array_elements(:'later'::jsonb -> 'recipes') r where (r ->> 'id')::int = 1252277), :'crafter_owner',
  'it is offered as not yet learned by the listed crafter who has the profession');
select test.is(
  (select (r ->> 'learnSkill')::int from jsonb_array_elements(:'later'::jsonb -> 'recipes') r where (r ->> 'id')::int = 9999), 20,
  'an admin''s corrected level is the one shown');
select test.is(:'later'::jsonb -> 'items' ? '250528', true, 'with the items they make');
select test.is(jsonb_array_length(public.guild_unlearned(197) -> 'recipes'), 0, 'a profession no listed crafter has yields nothing');
select test.is(jsonb_array_length(:'doc'::jsonb -> 'crafters'), 1, 'unlisted crafters stay out of the document');
select test.is(:'doc'::jsonb -> 'crafters' -> 0 ->> 'characterName', 'Damien', 'crafter details are included');
select test.is(:'doc'::jsonb -> 'crafters' -> 0 -> 'skills' ->> '164', '145', 'with their profession skill');
select test.is(:'doc'::jsonb ->> 'build', '1.60.1.70938', 'and the game build of the last sync');
reset role;

-- ---------------------------------------------------------------------------
-- A later sync: updates in place, keeps corrections, retires vanished recipes
-- ---------------------------------------------------------------------------
set role service_role;
select public.sync_start('cron') as run2 \gset
select public.sync_apply(:run2, $json${
  "recipes": [
    {"id": 9999, "profession_id": 164, "name": "Mystery Recipe (renamed)", "icon_file_id": 0, "crafted_item_id": null,
     "crafted_count": 1, "effect_text": null, "skill_yellow": 10, "skill_green": 15, "skill_grey": 20, "recipe_item_id": null,
     "learn_skill": 15, "learn_skill_status": "single_source", "learn_skill_candidates": {}, "acquisition": "trainer",
     "acquisition_text": null, "training_cost": null, "category": "Other", "category_order": 990, "status": "ok",
     "content_hash": "r3b", "reagents": [[2841, 1]]},
    {"id": 7777, "profession_id": 164, "name": "Brand New Recipe", "icon_file_id": 0, "crafted_item_id": null,
     "crafted_count": 1, "effect_text": null, "skill_yellow": 10, "skill_green": 15, "skill_grey": 20, "recipe_item_id": null,
     "learn_skill": null, "learn_skill_status": "unconfirmed", "learn_skill_candidates": {}, "acquisition": "unknown",
     "acquisition_text": null, "training_cost": null, "category": "Other", "category_order": 990, "status": "ok",
     "content_hash": "r4", "reagents": []}
  ]
}$json$::jsonb) as applied2 \gset

select test.is((:'applied2'::jsonb ->> 'newRecipes')::int, 1, 'a later sync counts only genuinely new recipes');
select test.is((select name from public.recipes where id = 9999), 'Mystery Recipe (renamed)', 'changed recipes are updated in place');
select test.is((select learn_skill_owner from public.recipes where id = 9999), 20, 'an owner correction survives the sync');
select test.is((select first_seen_run_id from public.recipes where id = 9999), :run1::bigint, 'an updated recipe keeps its first-seen run');
select test.is((select first_seen_run_id from public.recipes where id = 7777), :run2::bigint, 'a new recipe is tagged with the run that found it');
select test.is((select count(*)::int from public.recipe_reagents where recipe_id = 9999), 1, 'reagents are replaced, not duplicated');

select test.is(
  public.sync_finish(:run2, 'ok', '1.60.1.70999', '{}'::jsonb, '[]'::jsonb, null, array[3333, 9999, 7777]), 1,
  'sync_finish retires recipes the game no longer lists');
select test.is((select status from public.recipes where id = 1252277), 'removed', 'a vanished recipe is marked removed, not deleted');
select test.is((select count(*)::int from public.crafter_recipes where recipe_id = 1252277), 1, 'and stays on crafters'' lists');
select test.is(public.sync_state() -> 'recipes' ? '1252277', false, 'removed recipes are offered again if they return');

select public.sync_start('cron') as run3 \gset
select public.sync_finish(:run3, 'failed', null, '{}'::jsonb, '[]'::jsonb, 'download failed', null);
select test.is((select count(*)::int from public.recipes where status = 'removed'), 1, 'a failed sync retires nothing');
select test.is((select error from public.sync_runs where id = :run3), 'download failed', 'a failed sync records why');
reset role;

set role anon;
select test.is(public.guild_craftables() ->> 'build', '1.60.1.70999', 'the public read reports the latest successful build');
select test.is(
  (select count(*)::int from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where (r ->> 'id')::int = 1252277), 0,
  'a recipe the game has dropped is not offered as something to learn');
select test.is(
  (select r -> 'pendingCrafterIds' ->> 0 from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where (r ->> 'id')::int = 7777), :'crafter_owner',
  'a recipe a later sync adds shows up as not yet learned without anyone touching it');
reset role;

-- ---------------------------------------------------------------------------
-- Site admins decide who is a crafter
-- ---------------------------------------------------------------------------
\set member '33333333-3333-3333-3333-333333333333'
insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values
  (:'member', 'member@example.com', '{"full_name": "newmember", "custom_claims": {"global_name": "New Member"}}', now());

set role anon;
select test.login(null);
select test.throws($$select public.admin_directory()$$, '42501', 'a visitor cannot read the account list');
select test.throws($$select public.admin_create_crafter('Sneaky', null)$$, '42501', 'a visitor cannot create a crafter');
select test.throws($$select public.admin_link_crafter('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null)$$, '42501', 'a visitor cannot unlink a crafter');

reset role;
set role authenticated;
select test.login(:'member');
select test.throws($$select public.admin_directory()$$, '42501', 'a signed-in member cannot read the account list');
select test.throws($$select private.admin_directory()$$, '42501', 'nor by calling the inner function directly');
select test.throws($$select public.admin_create_crafter('Me', '33333333-3333-3333-3333-333333333333')$$, '42501', 'a member cannot make themselves a crafter');
select test.throws($$select public.admin_link_crafter('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333')$$, '42501', 'a member cannot take over someone else''s crafter');
select test.throws($$select public.admin_set_crafter_listed('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true)$$, '42501', 'a member cannot change who is listed');
select test.is((select count(*)::int from public.crafters where user_id = (select auth.uid())), 0, 'signing in alone does not make anyone a crafter');

select test.login(:'owner');
select test.is(jsonb_array_length(public.admin_directory() -> 'accounts'), 3, 'an admin sees every account that has signed in');
select test.is(
  (select a ->> 'name' from jsonb_array_elements(public.admin_directory() -> 'accounts') a where a ->> 'id' = :'member'), 'New Member',
  'accounts are shown by their Discord name');
select test.is(
  (select (a ->> 'isAdmin')::boolean from jsonb_array_elements(public.admin_directory() -> 'accounts') a where a ->> 'id' = :'owner'), true,
  'the account list marks site admins');
select test.is(public.admin_directory()::text like '%example.com%', false, 'the account list never includes email addresses');
select test.is(jsonb_array_length(public.admin_directory() -> 'crafters'), 2, 'an admin sees unlisted crafters too');
select test.is(
  (select (c ->> 'recipeCount')::int from jsonb_array_elements(public.admin_directory() -> 'crafters') c where c ->> 'slug' = 'damien'),
  (select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner'),
  'each crafter comes with the size of their list');

select public.admin_create_crafter('  New Member ', :'member') as new_id \gset
select test.is((select user_id from public.crafters where id = :'new_id'), :'member'::uuid, 'an admin can make a signed-in member a crafter');
select test.is((select character_name from public.crafters where id = :'new_id'), 'New Member', 'the name is trimmed');
select test.is((select slug from public.crafters where id = :'new_id'), 'new-member', 'the new crafter gets an address from the name');
select test.is((select is_listed from public.crafters where id = :'new_id'), true, 'a new crafter is listed');

select public.admin_create_crafter('New Member', null) as alt_id \gset
select test.is((select slug from public.crafters where id = :'alt_id'), 'new-member-2', 'a repeated name still gets its own address');
select test.is((select user_id is null from public.crafters where id = :'alt_id'), true, 'a crafter can be added before the member signs in');

select public.admin_link_crafter(:'alt_id', :'member');
select test.is((select user_id from public.crafters where id = :'alt_id'), :'member'::uuid, 'an admin can link an account to an existing crafter');
select public.admin_link_crafter(:'alt_id', null);
select test.is((select user_id is null from public.crafters where id = :'alt_id'), true, 'an admin can unlink a crafter');
select public.admin_set_crafter_listed(:'alt_id', false);
select test.is(
  (select (c ->> 'isListed')::boolean from jsonb_array_elements(public.admin_directory() -> 'crafters') c where c ->> 'id' = :'alt_id'), false,
  'an admin can take a crafter off the public list');
select test.is((select count(*)::int from public.crafters where id = :'alt_id'), 0, 'which hides them from ordinary reads');

select test.throws($$select public.admin_create_crafter('   ', null)$$, '22023', 'a crafter needs a name');
select test.throws($$select public.admin_link_crafter('99999999-9999-9999-9999-999999999999', null)$$, 'P0002', 'linking a crafter that does not exist is an error');
select test.throws(
  format('select public.admin_link_crafter(%L, %L)', :'alt_id', '99999999-9999-9999-9999-999999999999'), '23503',
  'linking to an account that does not exist is an error');
select test.throws($$update public.crafters set is_listed = false where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', 'crafters still cannot be changed around the admin functions');

-- The member can now manage their own list, and nothing more.
select test.login(:'member');
select test.is(
  public.set_crafter_recipes(:'new_id', array[3333], '{}'::int[]) ->> 'added', '1',
  'a newly linked member can tick their own recipes');
select test.throws($$select public.admin_directory()$$, '42501', 'being a crafter does not make someone an admin');
select test.throws(format('select public.admin_set_crafter_listed(%L, true)', :'alt_id'), '42501', 'a crafter cannot list other crafters');

reset role;
select test.is(has_function_privilege('anon', 'public.admin_directory()', 'execute'), false, 'visitors have no execute right on the account list');
select test.is(has_function_privilege('anon', 'private.admin_directory()', 'execute'), false, 'nor on the inner function');
select test.is(has_function_privilege('authenticated', 'private.require_admin()', 'execute'), false, 'the admin check cannot be called on its own');

-- A crafter with no profession recorded has nothing "yet to learn".
set role anon;
select test.login(null);
select test.is(
  (select count(*)::int from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where r -> 'pendingCrafterIds' ? :'new_id'), 0,
  'a crafter with no profession skill is not waiting to learn anything');
select test.is(
  (select count(*)::int from jsonb_array_elements(public.guild_craftables() -> 'recipes') r where r -> 'crafterIds' ? :'new_id'), 1,
  'while what they ticked is craftable');
reset role;

-- ---------------------------------------------------------------------------
-- Automatic approval of Discord members, and signing up
-- ---------------------------------------------------------------------------
\set joiner '44444444-4444-4444-4444-444444444444'
\set stranger '55555555-5555-5555-5555-555555555555'
insert into auth.users (id, raw_user_meta_data) values
  (:'joiner', '{"full_name": "joiner"}'),
  (:'stranger', '{"full_name": "stranger"}');

set role anon;
select test.login(null);
select test.is((select auto_approve from public.site_settings), false, 'automatic approval is off until an admin turns it on');
select test.throws($$select discord_guild_id from public.site_settings$$, '42501', 'visitors cannot read which Discord server is required');
select test.throws($$update public.site_settings set auto_approve = true$$, '42501', 'visitors cannot change the settings');
select test.throws($$insert into public.verified_members (user_id) values ('44444444-4444-4444-4444-444444444444')$$, '42501', 'visitors cannot mark anyone as verified');
select test.throws($$select public.signup_crafter('Sneaky')$$, '42501', 'visitors cannot sign up');
reset role;

set role authenticated;
select test.login(:'joiner');
select test.throws($$insert into public.verified_members (user_id) values ('44444444-4444-4444-4444-444444444444')$$, '42501', 'a signed-in user cannot verify themselves');
select test.throws($$update public.site_settings set auto_approve = true$$, '42501', 'a signed-in user cannot change the settings');
select test.throws($$select public.signup_crafter('Joiner')$$, '42501', 'nobody can sign up while automatic approval is off');
select test.throws($$select public.admin_save_settings(true, '123456789012345678', null)$$, '42501', 'a member cannot change the approval rule');
select test.throws($$select public.admin_settings()$$, '42501', 'a member cannot read the approval rule');

select test.login(:'owner');
select test.throws($$select public.admin_save_settings(true, null, null)$$, '22023', 'automatic approval needs a Discord server');
select test.throws($$select public.admin_save_settings(true, 'not-an-id', null)$$, '22023', 'the server must be given as a Discord id');
select test.throws($$select public.admin_save_settings(true, '123456789012345678', 'admins')$$, '22023', 'the role must be given as a Discord id');
select public.admin_save_settings(true, ' 123456789012345678 ', '');
select test.is(public.admin_settings() ->> 'discordGuildId', '123456789012345678', 'an admin can set the Discord server');
select test.is(public.admin_settings() -> 'discordRoleId', 'null'::jsonb, 'the role is optional');
select test.is((public.admin_settings() ->> 'autoApprove')::boolean, true, 'and turn automatic approval on');
reset role;

-- The site's server records what Discord answered at sign-in.
set role service_role;
insert into public.verified_members (user_id, discord_name) values (:'joiner', 'Joiner');
reset role;

set role anon;
select test.is((select auto_approve from public.site_settings), true, 'visitors can see that sign-up is open');
reset role;

set role authenticated;
select test.login(:'stranger');
select test.throws($$select public.signup_crafter('Stranger')$$, '42501', 'an account Discord did not confirm cannot sign up');
select test.is((select count(*)::int from public.verified_members), 0, 'members cannot see who else is verified');

select test.login(:'joiner');
select test.is((select count(*)::int from public.verified_members), 1, 'a member can see their own verification');
select test.throws($$select public.signup_crafter('  ')$$, '22023', 'signing up needs a character name');
select public.signup_crafter(' Joiner ') as joiner_crafter \gset
select test.is((select user_id from public.crafters where id = :'joiner_crafter'), :'joiner'::uuid, 'a verified member creates their own crafter');
select test.is((select character_name from public.crafters where id = :'joiner_crafter'), 'Joiner', 'under the name they gave');
select test.is((select is_listed from public.crafters where id = :'joiner_crafter'), true, 'and is listed straight away');
select test.throws($$select public.signup_crafter('Second')$$, 'P0001', 'one profile per account');
select test.is(
  test.affected(format('update public.crafters set note = %L where id = %L', 'Whisper me', :'joiner_crafter')), 1,
  'they can then fill in their profile');
select test.is(
  public.set_crafter_recipes(:'joiner_crafter', array[3333], '{}'::int[]) ->> 'added', '1',
  'and add their recipes');
select test.throws($$select public.admin_directory()$$, '42501', 'signing up does not make anyone an admin');

select test.login(:'owner');
select test.is(
  (select (a ->> 'isVerifiedMember')::boolean from jsonb_array_elements(public.admin_directory() -> 'accounts') a where a ->> 'id' = :'joiner'), true,
  'the admin list shows who Discord confirmed');
select test.is(
  (select (a ->> 'isVerifiedMember')::boolean from jsonb_array_elements(public.admin_directory() -> 'accounts') a where a ->> 'id' = :'stranger'), false,
  'and who it did not');
select public.admin_save_settings(false, '123456789012345678', null);
reset role;

set role service_role;
insert into public.verified_members (user_id) values (:'stranger');
reset role;
set role authenticated;
select test.login(:'stranger');
select test.throws($$select public.signup_crafter('Stranger')$$, '42501', 'turning automatic approval off closes sign-up again');
reset role;

select test.is(has_table_privilege('authenticated', 'public.verified_members', 'insert'), false, 'only the server can record a verification');
select test.is(has_function_privilege('anon', 'public.admin_save_settings(boolean, text, text)', 'execute'), false, 'visitors have no execute right on the settings');

-- Several crafters share a profession: a recipe one of them makes is still "not yet" for the others.
set role service_role;
insert into public.crafter_professions (crafter_id, profession_id, skill) values (:'joiner_crafter', 164, 10);
delete from public.crafter_recipes where crafter_id = :'joiner_crafter';
reset role;
set role anon;
select test.login(null);
select test.is(
  (select r -> 'pendingCrafterIds' ? :'joiner_crafter' from jsonb_array_elements(public.guild_craftables() -> 'recipes') r where (r ->> 'id')::int = 3333), true,
  'a recipe one crafter makes is marked as not yet learned by another with the same profession');
select test.is(
  (select r -> 'crafterIds' ? :'crafter_owner' from jsonb_array_elements(public.guild_craftables() -> 'recipes') r where (r ->> 'id')::int = 3333), true,
  'and still names who can make it');
select test.is(
  (select r -> 'pendingCrafterIds' ? :'joiner_crafter' from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r limit 1), true,
  'recipes nobody has learned are pending for every crafter with the profession');
select test.is(has_function_privilege('anon', 'public.guild_unlearned(integer)', 'execute'), true, 'visitors can read what is still to learn');
reset role;
