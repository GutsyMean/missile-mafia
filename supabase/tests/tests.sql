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
select public.signup_crafter('Joiner Alt') as joiner_alt \gset
select test.is((select user_id from public.crafters where id = :'joiner_alt'), :'joiner'::uuid, 'a member can add another character under the same login');
select test.is((select count(*)::int from public.crafters where user_id = (select auth.uid())), 2, 'each character is its own crafter');
select test.is(
  test.affected(format('insert into public.crafter_professions (crafter_id, profession_id, skill) values (%L, 164, 75)', :'joiner_alt')), 1,
  'with its own professions');
select count(public.signup_crafter('Alt ' || n)) from generate_series(3, 8) n;
select test.throws($$select public.signup_crafter('One too many')$$, 'P0001', 'an account cannot hold more than eight characters');
reset role;
set role service_role;
delete from public.crafters where user_id = :'joiner' and id not in (:'joiner_crafter', :'joiner_alt');
reset role;
set role authenticated;
select test.login(:'joiner');
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
select public.signup_crafter('Damien Alt') as owner_alt \gset
select test.is((select user_id from public.crafters where id = :'owner_alt'), :'owner'::uuid, 'an admin can add a character of their own without being verified');
reset role;

set role service_role;
delete from public.crafters where id = :'owner_alt';
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

-- ---------------------------------------------------------------------------
-- Trainer recipes join a crafter's list by themselves as their skill rises
-- ---------------------------------------------------------------------------
-- The game gains some Blacksmithing recipes: trainer ones at 1, 30, 60 and 150,
-- one whose level a single source gives, and plans sold by a vendor.
set role service_role;
select public.sync_start('cli') as run4 \gset
select public.sync_apply(:run4, (
  select jsonb_build_object('recipes', jsonb_agg(jsonb_build_object(
    'id', r.id, 'profession_id', 164, 'name', r.name, 'icon_file_id', 0, 'crafted_item_id', null, 'crafted_count', 1,
    'effect_text', null, 'skill_yellow', r.lvl + 25, 'skill_green', r.lvl + 40, 'skill_grey', r.lvl + 55, 'recipe_item_id', null,
    'learn_skill', r.lvl, 'learn_skill_status', r.status, 'learn_skill_candidates', '{}'::jsonb, 'acquisition', r.how,
    'acquisition_text', null, 'training_cost', null, 'category', 'Other', 'category_order', 990, 'status', 'ok',
    'content_hash', 'auto-' || r.id, 'reagents', '[]'::jsonb)))
  from (values
    (501, 'Trainer Thirty', 30, 'confirmed', 'trainer'),
    (502, 'Trainer Sixty', 60, 'confirmed', 'trainer'),
    (503, 'Trainer One-Fifty', 150, 'confirmed', 'trainer'),
    (504, 'One Source Forty', 40, 'single_source', 'trainer'),
    (505, 'Vendor Plans Thirty', 30, 'confirmed', 'vendor'),
    (506, 'Known From The Start', 1, 'confirmed', 'starter')
  ) as r (id, name, lvl, status, how)
));
select public.sync_finish(:run4, 'ok', '1.60.1.70999', '{}'::jsonb, '[]'::jsonb, null, array[3333, 9999, 7777, 501, 502, 503, 504, 505, 506]);
reset role;

-- Damien is at Blacksmithing 145.
select test.is(
  (select array_agg(recipe_id order by recipe_id) from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id between 501 and 506),
  array[501, 502, 506], 'trainer recipes the game adds within a crafter''s skill join their list');
select test.is(
  (select source from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 501), 'auto',
  'and are recorded as added automatically');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 503), 0, 'a recipe above their skill does not');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 504), 0, 'a level only one source gives is not acted on');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 505), 0, 'plans bought from a vendor are left to the crafter');
select test.is(
  (select array_agg(recipe_id order by recipe_id) from public.crafter_recipes where crafter_id = :'joiner_alt' and recipe_id between 501 and 506),
  array[501, 502, 506], 'every crafter with the profession gets them, each by their own skill');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'joiner_crafter' and recipe_id = 501), 0, 'a crafter below the level does not');

set role authenticated;
select test.login(:'owner');
update public.crafter_professions set skill = 150 where crafter_id = :'crafter_owner' and profession_id = 164;
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 503), 1, 'reaching a level adds the trainer recipes for it');

-- What a crafter takes off stays off; putting it back is theirs to do.
select public.set_crafter_recipes(:'crafter_owner', '{}'::int[], array[501]);
update public.crafter_professions set skill = 151 where crafter_id = :'crafter_owner' and profession_id = 164;
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 501), 0, 'a recipe the crafter unticked is not added again');
select public.set_crafter_recipes(:'crafter_owner', array[501], '{}'::int[]);
update public.crafter_professions set skill = 152 where crafter_id = :'crafter_owner' and profession_id = 164;
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner' and recipe_id = 501), 1, 'ticking it again brings it back for good');
select test.is((select count(*)::int from public.crafter_recipe_skips where crafter_id = :'crafter_owner' and recipe_id = 501), 0, 'and clears the note that it was taken off');

select count(*)::int as before_lowering from public.crafter_recipes where crafter_id = :'crafter_owner' \gset
update public.crafter_professions set skill = 20 where crafter_id = :'crafter_owner' and profession_id = 164;
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'crafter_owner'), :before_lowering, 'lowering a skill never removes anything');

-- An admin settling a level acts for everyone already past it.
update public.recipes set learn_skill_owner = 50 where id = 504;
select test.is((select count(*)::int from public.crafter_recipes where recipe_id = 504 and crafter_id = :'joiner_alt'), 1, 'a level an admin confirms is applied to crafters already past it');
select test.is((select count(*)::int from public.crafter_recipes where recipe_id = 504 and crafter_id = :'crafter_owner'), 0, 'but not to one below it');

select test.login(:'joiner');
select test.throws(
  $$insert into public.crafter_recipe_skips (crafter_id, recipe_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 502)$$, '42501',
  'a crafter cannot take recipes off someone else''s automatic list');
select test.is((select count(*)::int from public.crafter_recipe_skips), 0, 'or see what others have taken off');
reset role;
set role anon;
select test.throws($$select count(*) from public.crafter_recipe_skips$$, '42501', 'visitors cannot read it at all');
reset role;

-- ---------------------------------------------------------------------------
-- A skill the game data no longer treats as a profession drops out of the lists
-- ---------------------------------------------------------------------------
-- A sync once brought in "Poisons" with a recipe, and a crafter recorded a skill in it.
set role service_role;
select public.sync_start('cli') as run5 \gset
select public.sync_apply(:run5, $json${
  "professions": [{"id": 40, "slug": "poisons", "name": "Poisons", "icon_file_id": 1, "child_skill_line_ids": []}],
  "recipes": [
    {"id": 601, "profession_id": 40, "name": "Instant Poison", "icon_file_id": 0, "crafted_item_id": null,
     "crafted_count": 1, "effect_text": null, "skill_yellow": 10, "skill_green": 15, "skill_grey": 20, "recipe_item_id": null,
     "learn_skill": null, "learn_skill_status": "unconfirmed", "learn_skill_candidates": {}, "acquisition": "unknown",
     "acquisition_text": null, "training_cost": null, "category": "Other", "category_order": 990, "status": "ok",
     "content_hash": "p1", "reagents": []}
  ]
}$json$::jsonb);
select public.sync_finish(:run5, 'ok', '1.60.1.70999', '{}'::jsonb, '[]'::jsonb, null, array[3333, 9999, 7777, 501, 502, 503, 504, 505, 506, 601]);
insert into public.crafter_professions (crafter_id, profession_id, skill) values (:'joiner_alt', 40, 30);
reset role;

set role authenticated;
select test.login(:'owner');
select test.is(
  (select count(*)::int from jsonb_array_elements(public.admin_catalog() -> 'professions') p where p ->> 'name' = 'Poisons'), 1,
  'a profession with recipes is offered on the profile and checklist');
reset role;
set role anon;
select test.is(
  (select count(*)::int from jsonb_array_elements(public.guild_craftables() -> 'professions') p where p ->> 'name' = 'Poisons'), 1,
  'and can be picked on the public page when a crafter has it');
reset role;

-- The next sync no longer lists its recipe: the game data stopped treating it as a profession.
set role service_role;
select public.sync_start('cli') as run6 \gset
select public.sync_finish(:run6, 'ok', '1.60.1.70999', '{}'::jsonb, '[]'::jsonb, null, array[3333, 9999, 7777, 501, 502, 503, 504, 505, 506]);
reset role;

set role authenticated;
select test.login(:'owner');
select test.is(
  (select count(*)::int from jsonb_array_elements(public.admin_catalog() -> 'professions') p where p ->> 'name' = 'Poisons'), 0,
  'once its recipes are retired, it is no longer offered on the profile and checklist');
select test.is(
  (select count(*)::int from jsonb_array_elements(public.admin_catalog() -> 'professions') p where p ->> 'name' = 'Blacksmithing'), 1,
  'real professions stay');
reset role;
set role anon;
select test.is(
  (select count(*)::int from jsonb_array_elements(public.guild_craftables() -> 'professions') p where p ->> 'name' = 'Poisons'), 0,
  'and it leaves the public page, even though a crafter once recorded a skill in it');
select test.is(
  (select count(*)::int from jsonb_array_elements(public.guild_craftables() -> 'professions') p where p ->> 'name' = 'Blacksmithing'), 1,
  'while the real ones stay there too');
reset role;

-- ---------------------------------------------------------------------------
-- Recipes from a quest that only one faction can do
-- ---------------------------------------------------------------------------
-- The sync brings in three quest recipes: one the wiki says is Horde only, one
-- Alliance only, and one it says nothing about.
set role service_role;
select public.sync_start('cli') as runq \gset
select public.sync_apply(:runq, (
  select jsonb_build_object('recipes', jsonb_agg(jsonb_build_object(
    'id', r.id, 'profession_id', 164, 'name', r.name, 'icon_file_id', 0, 'crafted_item_id', null, 'crafted_count', 1,
    'effect_text', null, 'skill_yellow', 200, 'skill_green', 210, 'skill_grey', 220, 'recipe_item_id', null,
    'learn_skill', 180, 'learn_skill_status', 'confirmed', 'learn_skill_candidates', '{}'::jsonb, 'acquisition', 'quest',
    'acquisition_text', 'Quest · ' || r.quest, 'quest_faction', r.faction, 'training_cost', null, 'category', 'Other',
    'category_order', 990, 'status', 'ok', 'content_hash', 'quest-' || r.id, 'reagents', '[]'::jsonb)))
  from (values
    (601, 'Horde Quest Plans', 'Trampled Under Foot', 'horde'),
    (602, 'Alliance Quest Plans', 'Gearing Redridge', 'alliance'),
    (603, 'Open Quest Plans', 'Sweet Serenity', null)
  ) as r (id, name, quest, faction)
));
select public.sync_finish(:runq, 'ok', '1.60.1.71000', '{}'::jsonb, '[]'::jsonb, null,
  (select array_agg(id) from public.recipes where status <> 'removed'));
select test.is((select quest_faction from public.recipes where id = 601), 'horde', 'the sync stores the faction a quest is limited to');
select test.throws(
  $$update public.recipes set quest_faction = 'undead' where id = 603$$, '23514', 'only the two factions can be stored');
-- Someone has learned the Alliance one.
insert into public.crafter_recipes (crafter_id, recipe_id, source) values (:'crafter_owner', 602, 'manual');
reset role;

set role anon;
select test.is(
  (select r ->> 'questFaction' from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where (r ->> 'id')::int = 601), 'horde',
  'a recipe nobody has learned says its quest is Horde only');
select test.is(
  (select r ? 'questFaction' from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where (r ->> 'id')::int = 603), false,
  'a recipe open to both says nothing');
select test.is(
  (select r ->> 'questFaction' from jsonb_array_elements(public.guild_craftables() -> 'recipes') r where (r ->> 'id')::int = 602), 'alliance',
  'a learned recipe carries it too');
select test.throws(
  $$update public.recipes set quest_faction_owner = 'horde' where id = 603$$, '42501', 'a visitor cannot mark a recipe');
reset role;

-- A site admin records what they saw in the game.
set role authenticated;
select test.login(:'other');
select test.is(
  test.affected($$update public.recipes set quest_faction_owner = 'horde' where id = 603$$), 0,
  'a signed-in member who is not an admin cannot mark a recipe');
select test.login(:'owner');
select test.is(
  test.affected($$update public.recipes set quest_faction_owner = 'horde' where id = 603$$), 1,
  'an admin can mark a recipe the wiki says nothing about');
select test.is(
  test.affected($$update public.recipes set quest_faction_owner = 'none' where id = 601$$), 1,
  'and can overrule the wiki');
select test.throws(
  $$update public.recipes set quest_faction = 'alliance' where id = 601$$, '42501', 'but cannot rewrite what the sync recorded');
select test.is(
  (select jsonb_build_array(r -> 'questFactionWiki', r -> 'questFactionOwner')
   from jsonb_array_elements(public.admin_catalog() -> 'recipes') r where (r ->> 'id')::int = 601),
  '["horde", "none"]'::jsonb, 'the catalog shows both what the wiki says and what the admin chose');
reset role;

set role anon;
select test.is(
  (select r ->> 'questFaction' from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where (r ->> 'id')::int = 603), 'horde',
  'visitors see the admin''s mark');
select test.is(
  (select r ? 'questFaction' from jsonb_array_elements(public.guild_unlearned(164) -> 'recipes') r where (r ->> 'id')::int = 601), false,
  'and no mark where the admin said both factions can get it');
reset role;

-- The next sync has different news from the wiki; the admin's word still stands.
set role service_role;
select public.sync_start('cli') as runq2 \gset
select public.sync_apply(:runq2, (
  select jsonb_build_object('recipes', jsonb_agg(jsonb_build_object(
    'id', r.id, 'profession_id', 164, 'name', r.name, 'icon_file_id', 0, 'crafted_item_id', null, 'crafted_count', 1,
    'effect_text', null, 'skill_yellow', 200, 'skill_green', 210, 'skill_grey', 220, 'recipe_item_id', null,
    'learn_skill', 180, 'learn_skill_status', 'confirmed', 'learn_skill_candidates', '{}'::jsonb, 'acquisition', 'quest',
    'acquisition_text', null, 'quest_faction', r.faction, 'training_cost', null, 'category', 'Other',
    'category_order', 990, 'status', 'ok', 'content_hash', 'quest2-' || r.id, 'reagents', '[]'::jsonb)))
  from (values (601, 'Horde Quest Plans', null), (603, 'Open Quest Plans', 'alliance')) as r (id, name, faction)
));
select test.is((select quest_faction from public.recipes where id = 601), null, 'a sync clears a mark the wiki no longer makes');
select test.is((select quest_faction_owner from public.recipes where id = 601), 'none', 'and leaves the admin''s choice alone');
select test.is(
  (select nullif(coalesce(quest_faction_owner, quest_faction), 'none') from public.recipes where id = 603), 'horde',
  'which keeps winning over the wiki');
reset role;

-- ---------------------------------------------------------------------------
-- Choosing gear by class, talent tree and level
-- ---------------------------------------------------------------------------
-- The sync brings the playable classes, a helm only Paladins may wear, and a
-- profession nobody in the guild has (Engineering) with goggles and a bomb.
set role service_role;
select public.sync_start('cli') as rung \gset
select public.sync_apply(:rung, $json${
  "meta": {"classes": {"content_hash": "c1", "value": [{"id": 2, "slug": "paladin", "name": "Paladin",
    "specs": [{"id": 381, "slug": "retribution", "name": "Retribution"}],
    "proficiencies": [{"skillLineId": 293, "name": "Plate Mail", "minLevel": 40}]}]}},
  "professions": [{"id": 202, "slug": "engineering", "name": "Engineering", "icon_file_id": 1, "child_skill_line_ids": []}],
  "items": [
    {"id": 7001, "name": "Justice Helm", "quality": 3, "icon_file_id": 1, "class_id": 4, "subclass_id": 4,
     "inventory_type": 1, "item_level": 45, "required_level": 40, "bonding": 1, "sell_price": 1, "slot_name": "Head",
     "type_name": "Plate", "armor": 300, "damage": null, "stats": [], "class_mask": 2,
     "tooltip": [{"text": "Justice Helm", "color": "quality"}], "tooltip_complete": true, "content_hash": "g1"},
    {"id": 7002, "name": "Flying Tiger Goggles", "quality": 2, "icon_file_id": 1, "class_id": 4, "subclass_id": 1,
     "inventory_type": 1, "item_level": 20, "required_level": 0, "bonding": 2, "sell_price": 1, "slot_name": "Head",
     "type_name": "Cloth", "armor": 20, "damage": null, "stats": [], "class_mask": null,
     "tooltip": [{"text": "Flying Tiger Goggles", "color": "quality"}], "tooltip_complete": true, "content_hash": "g2"},
    {"id": 7003, "name": "Rough Copper Bomb", "quality": 1, "icon_file_id": 1, "class_id": 0, "subclass_id": 0,
     "inventory_type": 0, "item_level": 10, "required_level": 0, "bonding": 0, "sell_price": 1, "slot_name": null,
     "type_name": null, "armor": null, "damage": null, "stats": [], "class_mask": null,
     "tooltip": [{"text": "Rough Copper Bomb", "color": "quality"}], "tooltip_complete": true, "content_hash": "g3"}
  ]
}$json$::jsonb);
select public.sync_apply(:rung, (
  select jsonb_build_object('recipes', jsonb_agg(jsonb_build_object(
    'id', r.id, 'profession_id', r.profession, 'name', r.name, 'icon_file_id', 0, 'crafted_item_id', r.item, 'crafted_count', 1,
    'effect_text', null, 'skill_yellow', 200, 'skill_green', 210, 'skill_grey', 220, 'recipe_item_id', null,
    'learn_skill', 100, 'learn_skill_status', 'confirmed', 'learn_skill_candidates', '{}'::jsonb, 'acquisition', 'vendor',
    'acquisition_text', null, 'quest_faction', null, 'training_cost', null, 'category', 'Other',
    'category_order', 990, 'status', 'ok', 'content_hash', 'gear-' || r.id, 'reagents', '[]'::jsonb)))
  from (values
    (701, 164, 'Justice Helm', 7001),
    (702, 202, 'Flying Tiger Goggles', 7002),
    (703, 202, 'Rough Copper Bomb', 7003)
  ) as r (id, profession, name, item)
));
select public.sync_finish(:rung, 'ok', '1.60.1.71001', '{}'::jsonb, '[]'::jsonb, null,
  (select array_agg(id) from public.recipes where status <> 'removed'));
select test.is((select value -> 0 ->> 'slug' from public.game_meta where key = 'classes'), 'paladin', 'the sync stores the playable classes');
select test.is((select class_mask from public.items where id = 7001), 2, 'and the classes an item is limited to');

-- The same classes again are not rewritten.
select updated_at as classes_written from public.game_meta where key = 'classes' \gset
select test.is(public.sync_state() -> 'meta' ->> 'classes', 'c1', 'sync_state tells the sync which classes it holds');
select public.sync_apply(:rung, '{"meta": {"classes": {"content_hash": "c1", "value": []}}}'::jsonb);
select test.is(
  (select updated_at = :'classes_written'::timestamptz and jsonb_array_length(value) = 1 from public.game_meta where key = 'classes'), true,
  'classes that have not changed are left alone');
reset role;

set role anon;
select test.is(public.guild_craftables() -> 'classes' -> 0 ->> 'name', 'Paladin', 'the public page gets the classes');
select test.is(
  public.guild_craftables() -> 'classes' -> 0 -> 'proficiencies' -> 0 ->> 'minLevel', '40',
  'with the level each kind of armour opens at');
select test.is(
  public.guild_unlearned(164) -> 'items' -> '7001' ->> 'classMask', '2',
  'an item limited to a class says so');
select test.is(
  (select array_agg((r ->> 'id')::int order by (r ->> 'id')::int) from jsonb_array_elements(public.guild_gear_elsewhere() -> 'recipes') r),
  array[702], 'gear from a profession nobody has is offered, without its other recipes or the guild''s own professions');
select test.is(
  (public.guild_gear_elsewhere() -> 'items' -> '7002') ? 'classMask', false,
  'an item anyone may use carries no class limit');
select test.is(public.guild_gear_elsewhere() -> 'professions' -> 0 ->> 'slug', 'engineering', 'with the name of its profession');
select test.is(
  public.guild_gear_elsewhere() -> 'recipes' -> 0 -> 'pendingCrafterIds', '[]'::jsonb,
  'and nobody is waiting to learn it');
select test.throws(
  $$insert into public.game_meta (key, value) values ('classes', '[]'::jsonb)$$, '42501', 'a visitor cannot write the classes');
reset role;

-- Once a listed crafter takes up the profession, its recipes move to the ones still to learn.
set role service_role;
insert into public.crafter_professions (crafter_id, profession_id, skill) values (:'crafter_owner', 202, 1);
reset role;
set role anon;
select test.is(
  jsonb_array_length(public.guild_gear_elsewhere() -> 'recipes'), 0,
  'a profession someone has taken up is no longer "elsewhere"');
select test.is(
  (select array_agg((r ->> 'id')::int order by (r ->> 'id')::int) from jsonb_array_elements(public.guild_unlearned(202) -> 'recipes') r),
  array[702, 703], 'its recipes are now theirs to learn');
reset role;

-- ---------------------------------------------------------------------------
-- Gear that is not crafted, for comparing with what the guild can make
-- ---------------------------------------------------------------------------
set role anon;
select test.is(
  public.gear_from_sources(), '{"items": {}, "sources": {}}'::jsonb,
  'before the sync has read any sources, there is no such gear');
reset role;

-- The sync brings a dungeon drop, and says where it comes from. One source is
-- for an item the game tables no longer have.
set role service_role;
select public.sync_start('cli') as runs \gset
select public.sync_apply(:runs, $json${
  "items": [
    {"id": 8001, "name": "Rockslicer", "quality": 3, "icon_file_id": 1, "class_id": 2, "subclass_id": 1,
     "inventory_type": 17, "item_level": 23, "required_level": 18, "bonding": 1, "sell_price": 1, "slot_name": "Two-Hand",
     "type_name": "Axe", "armor": null, "damage": {"min": 52, "max": 78, "speed": 3.3, "dps": 19.7}, "stats": [],
     "class_mask": null, "tooltip": [{"text": "Rockslicer", "color": "quality"}], "tooltip_complete": true, "content_hash": "s8001"}
  ],
  "meta": {"gear_sources": {"content_hash": "s1", "value": {
    "8001": [{"kind": "drop", "place": "The Deadmines", "from": "Rhahk'Zor", "url": "https://wowforever.be/guides/dungeons/the-deadmines/#rhahk-zor"}],
    "7001": [{"kind": "quest", "place": "Scholomance", "from": "The Last Lesson", "faction": "alliance", "url": "https://wowforever.be/guides/dungeons/scholomance/quests/#quest-1"}],
    "999999": [{"kind": "list", "place": "Pre-raid best-in-slot list", "from": null, "url": "https://wowforever.be/bis/forever/preraid/paladin-protection/"}]
  }}}
}$json$::jsonb);
select test.is(public.sync_state() -> 'meta' ->> 'gear_sources', 's1', 'sync_state tells the sync which gear sources it holds');
reset role;

set role anon;
select test.is(
  public.gear_from_sources() -> 'sources' -> '8001' -> 0 ->> 'from', 'Rhahk''Zor',
  'gear that is not crafted comes with where it drops');
select test.is(public.gear_from_sources() -> 'items' -> '8001' ->> 'name', 'Rockslicer', 'and with the item itself');
select test.is(
  public.gear_from_sources() -> 'sources' -> '7001' -> 0 ->> 'faction', 'alliance',
  'a quest reward says which side can do the quest');
select test.is(
  public.gear_from_sources() -> 'items' -> '7001' ->> 'classMask', '2',
  'and an item limited to a class still says so');
select test.is(
  (public.gear_from_sources() -> 'sources') ? '999999' or (public.gear_from_sources() -> 'items') ? '999999', false,
  'a source for an item the game no longer has is left out');
select test.is(
  (public.guild_craftables() -> 'items') ? '8001' or (public.guild_unlearned(164) -> 'items') ? '8001', false,
  'none of it reaches the ordinary list');
select test.throws(
  $$update public.game_meta set value = '{}'::jsonb where key = 'gear_sources'$$, '42501', 'a visitor cannot rewrite the sources');
reset role;

-- ---------------------------------------------------------------------------
-- A site admin imports what a guild addon collected about the members
-- ---------------------------------------------------------------------------
set role anon;
select test.login(null);
select test.throws($$select public.admin_import_guild('[]'::jsonb, true, true)$$, '42501', 'a visitor cannot import guild members');
reset role;
set role authenticated;
select test.login(:'member');
select test.throws(
  $$select public.admin_import_guild('[{"name": "Sneaky", "crafterId": null, "professions": [], "recipeIds": []}]'::jsonb, true, true)$$,
  '42501', 'a signed-in member cannot import guild members');
select test.throws($$select private.admin_import_guild('[]'::jsonb, true, false)$$, '42501', 'nor look at what an import would do');
reset role;
select test.is((select count(*)::int from public.crafters where character_name = 'Sneaky'), 0, 'and nothing was created');

-- What Tessa should end up with: the recipes the file names that the game still has,
-- and the trainer recipes Blacksmithing 60 brings.
select count(*)::int as tessa_expected from public.recipes r
where (r.id in (505, 1252277) and r.status <> 'removed')
   or (r.profession_id = 164 and private.trainer_unlock_level(r) <= 60) \gset
select test.is((select status from public.recipes where id = 1252277), 'removed', '(the file names a recipe the game has retired)');

set role authenticated;
select test.login(:'owner');
\set tessa '[{"name": "  Tessa Thimble ", "crafterId": null, "professions": [{"id": 164, "skill": 60}, {"id": 424242, "skill": 10}, {"id": 164, "skill": "many"}], "recipeIds": [505, 1252277, 99999999, "x"]}]'

select public.admin_import_guild(:'tessa'::jsonb, false, false) as look \gset
select test.is((:'look'::jsonb -> 0 ->> 'created')::boolean, true, 'a look at an import says a new crafter would be created');
select test.is((:'look'::jsonb -> 0 ->> 'recipesAdded')::int, :tessa_expected, 'and how many recipes they would get, trainer recipes included');
select test.is((:'look'::jsonb -> 0 ->> 'recipesFromFile')::int, 1, 'and how many of those the file itself names');
select test.is(:'look'::jsonb -> 0 -> 'skills', '[{"professionId": 164, "from": null, "to": 60}]'::jsonb, 'and which skills would be set');
reset role;
select test.is((select count(*)::int from public.crafters where character_name = 'Tessa Thimble'), 0, 'a look creates nobody');
select test.is((select count(*)::int from public.crafter_recipes cr where cr.source = 'import' and cr.recipe_id = 505), 0, 'and adds no recipe');

set role authenticated;
select public.admin_import_guild(:'tessa'::jsonb, false, true) as done \gset
select (:'done'::jsonb -> 0 ->> 'crafterId') as tessa_id \gset
select test.is((:'done'::jsonb -> 0 ->> 'recipesAdded')::int, :tessa_expected, 'importing does exactly what the look said');
reset role;
select test.is(
  (select row(character_name, slug, user_id is null, is_listed)::text from public.crafters where id = :'tessa_id'),
  row('Tessa Thimble', 'tessa-thimble', true, false)::text,
  'the new crafter has the member''s name, no account, and is hidden when the admin asked for that');
select test.is((select skill from public.crafter_professions where crafter_id = :'tessa_id' and profession_id = 164), 60, 'with the skill from the file');
select test.is((select count(*)::int from public.crafter_professions where crafter_id = :'tessa_id'), 1, 'a profession the site does not have is passed over');
select test.is((select source from public.crafter_recipes where crafter_id = :'tessa_id' and recipe_id = 505), 'import', 'recipes from the file are recorded as imported');
select test.is((select source from public.crafter_recipes where crafter_id = :'tessa_id' and recipe_id = 502), 'auto', 'trainer recipes for the skill follow by themselves');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'tessa_id' and recipe_id = 1252277), 0, 'a recipe the game retired is not added');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'tessa_id' and recipe_id = 503), 0, 'nor a trainer recipe above the skill');

-- The same file again, now aimed at the crafter it made.
set role authenticated;
select test.is(
  public.admin_import_guild(jsonb_build_array(jsonb_build_object(
    'name', 'Tessa Thimble', 'crafterId', :'tessa_id', 'professions', '[{"id": 164, "skill": 60}]'::jsonb, 'recipeIds', '[505]'::jsonb)), true, true) -> 0,
  jsonb_build_object('name', 'Tessa Thimble', 'crafterId', :'tessa_id', 'created', false, 'recipesAdded', 0, 'recipesFromFile', 0, 'recipesSkipped', 0, 'skills', '[]'::jsonb),
  'importing the same file twice changes nothing');
select test.is(
  public.admin_import_guild(jsonb_build_array(jsonb_build_object(
    'name', 'Tessa Thimble', 'crafterId', :'tessa_id', 'professions', '[{"id": 164, "skill": 40}]'::jsonb, 'recipeIds', '[]'::jsonb)), true, true) -> 0 -> 'skills',
  '[]'::jsonb, 'an older file with a lower skill changes no skill');
reset role;
select test.is((select skill from public.crafter_professions where crafter_id = :'tessa_id' and profession_id = 164), 60, 'a skill is never lowered');
set role authenticated;
select test.is(
  public.admin_import_guild(jsonb_build_array(jsonb_build_object(
    'name', 'Tessa Thimble', 'crafterId', :'tessa_id', 'professions', '[{"id": 164, "skill": 150}]'::jsonb, 'recipeIds', '[]'::jsonb)), true, true) -> 0 -> 'skills',
  '[{"professionId": 164, "from": 60, "to": 150}]'::jsonb, 'a higher skill is taken');
reset role;
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'tessa_id' and recipe_id = 503), 1, 'and brings its trainer recipes');
select test.is((select is_listed from public.crafters where id = :'tessa_id'), false, 'adding to a crafter does not change whether they are listed');

-- A member who took a recipe off their own list keeps it off.
set role authenticated;
select test.login(:'member');
select public.set_crafter_recipes(:'new_id', array[3333], '{}'::int[]);
select public.set_crafter_recipes(:'new_id', '{}'::int[], array[3333]);
select test.login(:'owner');
select public.admin_import_guild(jsonb_build_array(jsonb_build_object(
  'name', 'New Member', 'crafterId', :'new_id', 'professions', '[]'::jsonb, 'recipeIds', '[3333, 505]'::jsonb)), true, true) as kept \gset
select test.is((:'kept'::jsonb -> 0 ->> 'recipesSkipped')::int, 1, 'an import says which of a member''s recipes it left alone');
reset role;
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'new_id' and recipe_id = 3333), 0, 'a recipe a member took off their list is not put back by an import');
select test.is((select count(*)::int from public.crafter_recipes where crafter_id = :'new_id' and recipe_id = 505), 1, 'the rest of their recipes are added');
select test.is((select user_id from public.crafters where id = :'new_id'), :'member'::uuid, 'and the crafter stays theirs');

-- Several members at once, and what is refused.
set role authenticated;
select public.admin_import_guild($json$[
  {"name": "Bram Anvil", "crafterId": null, "professions": [{"id": 164, "skill": 1}], "recipeIds": []},
  {"name": "Bram Anvil", "crafterId": null, "professions": [], "recipeIds": [505]}
]$json$::jsonb, null, true) as pair \gset
select test.is(jsonb_array_length(:'pair'::jsonb), 2, 'several members are imported in one go, in the order given');
reset role;
select test.is(
  (select array_agg(slug order by slug) from public.crafters where character_name = 'Bram Anvil'), array['bram-anvil', 'bram-anvil-2'],
  'two members of one name each get their own address');
select test.is((select bool_and(is_listed) from public.crafters where character_name = 'Bram Anvil'), true, 'new crafters are listed unless the admin says otherwise');

set role authenticated;
select test.throws(
  format($$select public.admin_import_guild('[{"name": "A", "crafterId": %1$s}, {"name": "B", "crafterId": %1$s}]'::jsonb, true, true)$$, to_jsonb(:'tessa_id'::text)),
  '22023', 'two members cannot be imported into one crafter');
select test.throws(
  $$select public.admin_import_guild('[{"name": "Fine Person", "crafterId": null}, {"name": "Lost", "crafterId": "99999999-9999-9999-9999-999999999999"}]'::jsonb, true, true)$$,
  'P0002', 'a crafter that does not exist is an error');
select test.throws($$select public.admin_import_guild('{"name": "Not A List"}'::jsonb, true, true)$$, '22023', 'the members must come as a list');
select test.throws(
  $$select public.admin_import_guild(jsonb_build_array(jsonb_build_object('name', repeat('x', 41), 'crafterId', null)), true, true)$$,
  '22023', 'a new crafter needs a name that fits');
select test.throws($$select public.admin_import_guild('[{"name": "   ", "crafterId": null}]'::jsonb, true, true)$$, '22023', 'and one that is not blank');
reset role;
select test.is((select count(*)::int from public.crafters where character_name = 'Fine Person'), 0, 'an import that fails part-way keeps none of it');
select test.is(has_function_privilege('anon', 'public.admin_import_guild(jsonb, boolean, boolean)', 'execute'), false, 'visitors have no execute right on the import');
select test.is(has_function_privilege('anon', 'private.admin_import_guild(jsonb, boolean, boolean)', 'execute'), false, 'nor on the inner function');

-- ---------------------------------------------------------------------------
-- A sign-up for a character already on the list is kept for an admin
-- ---------------------------------------------------------------------------
update public.site_settings set auto_approve = true;
select array_agg(id order by slug) as brams from public.crafters where character_name = 'Bram Anvil' \gset
select (:'brams'::uuid[])[1] as bram_one \gset
select (:'brams'::uuid[])[2] as bram_two \gset
select count(*)::int as crafters_before from public.crafters \gset

set role authenticated;
select test.login(:'joiner');
select test.is(public.signup_crafter('  tessa   THIMBLE ') is null, true, 'signing up as a character nobody manages yet makes no second crafter');
select test.is(
  (select row(crafter_id, character_name)::text from public.crafter_claims), row(:'tessa_id'::uuid, 'Tessa Thimble')::text,
  'the member is noted as asking for the one on the list');
select test.is(public.signup_crafter('Tessa Thimble') is null, true, 'asking twice is still one request');
select test.is((select count(*)::int from public.crafter_claims), 1, 'and one note');
select test.is(public.signup_crafter('bram anvil') is null, true, 'a name two unmanaged crafters share asks for both');
select test.is((select count(*)::int from public.crafter_claims), 3, 'a member sees everything they are waiting for');
select test.is(public.signup_crafter('Joiner') is not null, true, 'a name someone already manages is not held back');
select test.throws($$insert into public.crafter_claims (user_id, crafter_id, character_name) values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Damien')$$, '42501', 'a member cannot note a request by hand');
select test.throws($$select count(*) from public.crafter_players$$, '42501', 'nor read which characters share a player');
select test.throws(format('select public.admin_link_player(%L, %L)', :'tessa_id', :'joiner'), '42501', 'nor hand characters to themselves');
select test.throws(format($$select public.admin_group_crafters('[[%s, %s]]'::jsonb)$$, to_jsonb(:'tessa_id'::text), to_jsonb(:'bram_one'::text)), '42501', 'nor say whose characters go together');

select test.login(:'member');
select test.is((select count(*)::int from public.crafter_claims), 0, 'nobody sees what another member asked for');
reset role;
set role anon;
select test.login(null);
select test.throws($$select count(*) from public.crafter_claims$$, '42501', 'visitors cannot read requests at all');
reset role;
select test.is((select count(*)::int from public.crafters), :crafters_before + 1, 'only the sign-up under a managed name made a crafter');

-- The admin sees who asked, and files one player's characters together.
set role authenticated;
select test.login(:'owner');
select test.is(
  (select c -> 'claimedBy' from jsonb_array_elements(public.admin_directory() -> 'crafters') c where c ->> 'id' = :'tessa_id'),
  jsonb_build_array(:'joiner'), 'the crafter list says who asked for a character');
select test.is(
  (select c -> 'playerId' from jsonb_array_elements(public.admin_directory() -> 'crafters') c where c ->> 'id' = :'tessa_id'),
  'null'::jsonb, 'a crafter filed under no player says so');

select public.admin_group_crafters(jsonb_build_array(
  jsonb_build_array(:'tessa_id', :'bram_one'),
  jsonb_build_array(:'bram_two'),
  jsonb_build_array('not an id', :'bram_two'),
  '"not a list"'::jsonb));
select test.is(
  (select count(distinct c ->> 'playerId')::int from jsonb_array_elements(public.admin_directory() -> 'crafters') c where c ->> 'id' in (:'tessa_id', :'bram_one')),
  1, 'characters grouped together are one player');
select test.is(
  (select c -> 'playerId' from jsonb_array_elements(public.admin_directory() -> 'crafters') c where c ->> 'id' = :'bram_two'),
  'null'::jsonb, 'a group of one, or one with a stranger in it, files nobody');
select public.admin_group_crafters(jsonb_build_array(jsonb_build_array(:'bram_two', :'alt_id')));
select public.admin_group_crafters(jsonb_build_array(jsonb_build_array(:'bram_one', :'bram_two')));
select test.is(
  (select count(distinct c ->> 'playerId')::int from jsonb_array_elements(public.admin_directory() -> 'crafters') c
   where c ->> 'id' in (:'tessa_id', :'bram_one', :'bram_two', :'alt_id')),
  1, 'grouping a character of one player with a character of another makes them all one player');
select test.throws($$select public.admin_group_crafters('{"a": 1}'::jsonb)$$, '22023', 'the groups must come as a list');

-- One of them is managed by someone already; the rest go to the member who asked.
select public.admin_link_crafter(:'alt_id', :'member');
select test.is(public.admin_link_player(:'tessa_id', :'joiner'), 3, 'handing over a player hands over every character of theirs nobody manages');
reset role;
select test.is(
  (select count(*)::int from public.crafters where id in (:'tessa_id', :'bram_one', :'bram_two') and user_id = :'joiner'), 3,
  'they all belong to the account now');
select test.is((select user_id from public.crafters where id = :'alt_id'), :'member'::uuid, 'a character someone else manages stays theirs');
select test.is((select count(*)::int from public.crafter_claims), 0, 'and nobody is left waiting for them');

set role authenticated;
select test.throws(format('select public.admin_link_player(%L, null)', :'tessa_id'), '22023', 'handing over a player needs an account');
select test.throws($$select public.admin_link_player('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444')$$, 'P0002', 'and a crafter that exists');
select test.is(public.admin_link_player(:'crafter_other', :'joiner'), 1, 'a crafter filed under no player is handed over alone');
select public.admin_link_crafter(:'crafter_other', :'other');

-- Linking a single crafter answers the request for it as well.
select public.admin_link_crafter(:'tessa_id', null);
select test.login(:'joiner');
select test.is(public.signup_crafter('Tessa Thimble') is null, true, '(a member asks for a character again)');
select test.login(:'owner');
select public.admin_link_crafter(:'tessa_id', :'member');
reset role;
select test.is((select count(*)::int from public.crafter_claims where crafter_id = :'tessa_id'), 0, 'linking a crafter clears the requests for it');
select test.is(has_function_privilege('anon', 'public.admin_link_player(uuid, uuid)', 'execute'), false, 'visitors have no execute right on handing over a player');
select test.is(has_function_privilege('anon', 'public.admin_group_crafters(jsonb)', 'execute'), false, 'nor on grouping characters');
select test.is(has_table_privilege('authenticated', 'public.crafter_players', 'select'), false, 'who shares a player is not readable through the API');
update public.site_settings set auto_approve = false;

-- ---------------------------------------------------------------------------
-- The guild bank: brought in by an admin, shown to members only
-- ---------------------------------------------------------------------------
\set outsider '66666666-6666-6666-6666-666666666666'
insert into auth.users (id, raw_user_meta_data) values (:'outsider', '{"full_name": "outsider"}');
\set reading '{"at": 1795395192, "by": "  Bram Anvil ", "money": 1234567, "nextTabCost": 1000000, "tabs": [{"n": 1, "name": "Ore", "slots": [{"slot": 1, "id": 2841, "name": "Bronze Bar", "count": 20}, {"slot": 2, "id": 99999999, "name": "Mystery Thing", "count": 1}]}], "ledger": [{"kind": "deposit", "who": "Bram Anvil", "copper": 50000, "at": 1795390000}, {"kind": "withdraw", "who": "Tessa Thimble", "id": 3483, "name": "Silvered Bronze Gauntlets", "count": 1, "tab": 1, "at": 1795380000}], "mine": {"secret": true}}'

set role anon;
select test.login(null);
select test.throws($$select public.guild_bank()$$, '42501', 'a visitor cannot see the guild bank');
select test.throws($$select public.admin_set_guild_bank('{}'::jsonb)$$, '42501', 'nor bring a reading in');
reset role;

set role authenticated;
select test.login(:'outsider');
select test.throws($$select public.guild_bank()$$, '42501', 'someone signed in who is not of the guild cannot see the bank');
select test.throws($$select count(*) from public.guild_bank$$, '42501', 'and nobody reads the table itself');

select test.login(:'member');
select test.is(public.guild_bank() is null, true, 'a member who manages a crafter is let in, and sees nothing before a reading exists');
select test.throws(format('select public.admin_set_guild_bank(%L::jsonb)', :'reading'), '42501', 'but cannot bring a reading in');

select test.login(:'owner');
select public.admin_set_guild_bank(:'reading'::jsonb);
select test.is((public.guild_bank() ->> 'money')::bigint, 1234567::bigint, 'an admin brings in a reading, with the gold in the bank');
select test.is(public.guild_bank() ->> 'readBy', 'Bram Anvil', 'who read it');
select test.is((public.guild_bank() ->> 'readAt')::timestamptz, to_timestamp(1795395192), 'and when');
select test.is(public.guild_bank() -> 'tabs' -> 0 -> 'slots' -> 0 ->> 'name', 'Bronze Bar', 'what lies in each tab');
select test.is(jsonb_array_length(public.guild_bank() -> 'ledger'), 2, 'and the ledger');
select test.is(public.guild_bank() -> 'items' -> '2841' ->> 'iconFileId', '133227', 'items the site knows come with their icon');
select test.is(public.guild_bank() -> 'items' -> '3483' ->> 'quality', '2', 'those in the ledger too');
select test.is((public.guild_bank() -> 'items') ? '99999999', false, 'an item the site does not know is left to its name');
select test.is(public.guild_bank() ? 'mine', false, 'anything else in what was sent is dropped');

select test.throws(
  format('select public.admin_set_guild_bank(%L::jsonb)', (:'reading'::jsonb || '{"at": 1795000000, "money": 1}'::jsonb)::text),
  'P0001', 'an older reading than the site has is refused');
select test.is((public.guild_bank() ->> 'money')::bigint, 1234567::bigint, 'and changes nothing');
select public.admin_set_guild_bank(:'reading'::jsonb || '{"at": 1795395999, "money": 0, "tabs": [], "ledger": []}'::jsonb);
select test.is((public.guild_bank() ->> 'money')::bigint, 0::bigint, 'a newer reading replaces it');
select test.is(public.guild_bank() -> 'items', '{}'::jsonb, 'an empty bank is still a reading');
select test.throws($$select public.admin_set_guild_bank('{"money": 5}'::jsonb)$$, '22023', 'a reading needs its time');
select test.throws($$select public.admin_set_guild_bank('{"at": 1795395999, "money": "lots"}'::jsonb)$$, '22023', 'and its gold as a number');
select test.throws($$select public.admin_set_guild_bank('{"at": 1795395999, "money": 1, "tabs": {}}'::jsonb)$$, '22023', 'and its tabs as a list');
select test.throws($$select public.admin_set_guild_bank('{"at": 99999999999, "money": 1}'::jsonb)$$, '22023', 'and not a date in the future');
select test.throws($$select public.admin_set_guild_bank('[1]'::jsonb)$$, '22023', 'and to be a reading at all');

select test.login(:'joiner');
select test.is((public.guild_bank() ->> 'money')::bigint, 0::bigint, 'a member Discord confirmed sees the bank');
reset role;
select test.is(has_function_privilege('anon', 'public.guild_bank()', 'execute'), false, 'visitors have no execute right on the bank');
select test.is(has_table_privilege('authenticated', 'public.guild_bank', 'select'), false, 'the bank is not readable through the API');
