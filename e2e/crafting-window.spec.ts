import { expect, test, type Page } from "@playwright/test";

const rows = (page: Page) => page.locator("[data-recipe]");
const row = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });
const detail = (page: Page) => page.locator('[data-testid="detail"]:visible');
const crafterPicker = (page: Page) => page.getByRole("combobox", { name: "Crafter", exact: true });
const professionPicker = (page: Page) => page.getByRole("combobox", { name: "Profession", exact: true });

test.describe("browsing", () => {
  test("lists everything the crafter can make, grouped by type", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-recipe][data-available="true"]')).toHaveCount(62);
    await expect(page.getByRole("heading", { name: /Mail Armor/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Cloth Armor/ })).toBeVisible();
  });

  test("shows the Blacksmithing skill each item needs", async ({ page }) => {
    await page.goto("/");
    await expect(row(page, "Silvered Bronze Gauntlets")).toContainText("Blacksmithing 110");
    await row(page, "Patterned Bronze Bracers").click();
    await expect(detail(page).getByText("Requires Blacksmithing (95)")).toBeVisible();
    await expect(detail(page).getByLabel("Skill-ups: orange from 95, yellow from 125, green from 140, grey from 155")).toBeVisible();
  });

  test("shows the in-game tooltip and the three reagents when an item is clicked", async ({ page }) => {
    await page.goto("/");
    await row(page, "Silvered Bronze Gauntlets").click();

    const pane = detail(page);
    for (const line of ["Binds when equipped", "118 Armor", "+4 Strength", "+4 Stamina", "+3 Spirit", "Requires Level 22"]) {
      await expect(pane.getByText(line, { exact: true })).toBeVisible();
    }
    const reagents = pane.getByRole("region", { name: "Reagents" }).getByRole("listitem");
    await expect(reagents).toHaveText(["8Bronze Bar", "1Silver Bar", "2Coarse Grinding Stone"]);
    await expect(pane.getByText("Damien")).toBeVisible();
  });

  test("shows a tooltip beside a row on hover", async ({ page }) => {
    await page.goto("/");
    await row(page, "Shining Silver Breastplate").hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("214 Armor");
    await expect(tooltip).toContainText("+14 Strength");

    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
  });

  test("warns that a Bind on Pickup craft cannot be traded", async ({ page }) => {
    await page.goto("/");
    const helm = row(page, "Veteran's Silvered Chain Helm");
    await expect(helm).toContainText("Soulbound");
    await helm.click();
    await expect(detail(page).getByRole("note")).toContainText("cannot be traded");
    await expect(detail(page).getByText("Binds when picked up")).toBeVisible();
  });

  test("serves item icons converted from the game's files", async ({ request }) => {
    const response = await request.get("/icons/132939.webp");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
    expect((await request.get("/icons/not-an-icon")).status()).toBe(400);
  });
});

test.describe("the button for crafters", () => {
  test("invites a new visitor to become a crafter, from the top of the page", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("link", { name: "Become a Crafter" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/admin");
    await expect(page.getByRole("link", { name: "Crafter sign-in" })).toHaveCount(0);
    const [buttonBox, listBox] = await Promise.all([button.boundingBox(), rows(page).first().boundingBox()]);
    expect(buttonBox!.y + buttonBox!.height).toBeLessThan(listBox!.y);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(30);
  });

  test("asks someone who is signed in to sign in, and remembers them after they sign out", async ({ page, context }) => {
    // A sign-in leaves a cookie like this one.
    await context.addCookies([{ name: "sb-example-auth-token", value: "x", url: "http://localhost:3100" }]);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Crafter sign-in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Become a Crafter" })).toHaveCount(0);

    await context.clearCookies();
    await page.reload();
    await expect(page.getByRole("link", { name: "Crafter sign-in" })).toBeVisible();
  });
});

test.describe("recipes not learned yet", () => {
  test("are listed greyed out and marked as not available", async ({ page }) => {
    await page.goto("/?crafter=damien");
    await expect(rows(page)).toHaveCount(65);
    await expect(page.getByText("65 recipes · 7 not available yet")).toBeVisible();

    const hauberk = row(page, "Green Iron Hauberk");
    await expect(hauberk).toHaveAttribute("data-available", "false");
    await expect(hauberk).toContainText("Not available yet");
    await expect(hauberk).toContainText("Blacksmithing 155");
    await expect(row(page, "Silvered Bronze Gauntlets")).toHaveAttribute("data-available", "true");
  });

  test("come after what can be made now, soonest first", async ({ page }) => {
    await page.goto("/?crafter=damien");
    const mail = page.getByRole("region", { name: "Mail Armor" }).locator("[data-recipe]");
    await expect(mail.nth(24)).toHaveAttribute("data-available", "true");
    await expect(mail.nth(25)).toContainText("Azure Skyforged Chain");
    await expect(mail.nth(26)).toContainText("Ironforge Breastplate");
    await expect(mail.nth(27)).toContainText("Barbaric Iron Shoulders");
    await expect(mail.nth(28)).toContainText("Green Iron Hauberk");
    await expect(mail.nth(29)).toContainText("Golden Scale Bracers");
    await expect(mail.nth(30)).toContainText("Steel Breastplate");
  });

  test("say so in red when only the Horde can do the quest for them", async ({ page }) => {
    await page.goto("/?crafter=damien");
    const shoulders = row(page, "Barbaric Iron Shoulders");
    const mark = shoulders.getByText("Horde only", { exact: true });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveCSS("color", "rgb(255, 32, 32)");

    await shoulders.click();
    const note = detail(page).getByRole("note");
    await expect(note).toContainText("Source: Quest (Horde only) · On Iron Pauldrons.");
    await expect(note.getByText("(Horde only)")).toHaveCSS("color", "rgb(255, 32, 32)");
  });

  test("say it too when the quest is the Alliance's, and nothing for other recipes", async ({ page }) => {
    await page.goto("/?crafter=damien");
    await expect(row(page, "Ironforge Breastplate").getByText("Alliance only", { exact: true })).toBeVisible();
    await expect(row(page, "Green Iron Hauberk")).not.toContainText("only");
    await expect(page.getByText(/(Horde|Alliance) only/)).toHaveCount(2);
  });

  test("say what they need and where they come from when opened", async ({ page }) => {
    await page.goto("/?crafter=damien");
    await row(page, "Green Iron Hauberk").click();
    const note = detail(page).getByRole("note");
    await expect(note).toContainText("Not available yet.");
    await expect(note).toContainText("Damien has not learned this recipe.");
    await expect(note).toContainText("It needs Blacksmithing 155.");
    await expect(note).toContainText("Source: Trainer · 75s.");
    await expect(detail(page).getByRole("region", { name: "Reagents" })).toBeVisible();
    await expect(detail(page).getByRole("region", { name: "Crafters" })).toHaveCount(0);
  });

  test("admit it when the skill needed is not confirmed", async ({ page }) => {
    await page.goto("/?crafter=damien");
    await row(page, "Truesilver Gauntlets").click();
    await expect(detail(page).getByText("Blacksmithing skill needed: not confirmed")).toBeVisible();
  });

  test("are hidden by Available now only, and the link remembers it", async ({ page }) => {
    await page.goto("/?crafter=damien");
    await page.getByLabel("Available now only").check();
    await expect(rows(page)).toHaveCount(58);
    await expect(row(page, "Green Iron Hauberk")).toHaveCount(0);
    await expect(page).toHaveURL(/available=1/);

    await page.goto("/?crafter=damien&available=1");
    await expect(rows(page)).toHaveCount(58);
    await expect(page.getByLabel("Available now only")).toBeChecked();
  });
});

test.describe("choosing whose recipes to see", () => {
  test("starts with everyone, including what nobody has learned yet", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page)).toHaveCount(71);
    await expect(page.locator('[data-recipe][data-available="false"]')).toHaveCount(9);
    await expect(page.getByText("71 recipes · 9 not available yet")).toBeVisible();
    await expect(crafterPicker(page)).toHaveValue("");
    await expect(professionPicker(page)).toHaveValue("");
  });

  test("finds a recipe nobody has learned when searching across everyone", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").fill("hauberk");
    await expect(rows(page)).toHaveCount(1);
    await expect(row(page, "Green Iron Hauberk")).toHaveAttribute("data-available", "false");

    await page.getByRole("searchbox").fill("woolen boots");
    await expect(row(page, "Woolen Boots")).toHaveAttribute("data-available", "false");
  });

  test("says it is still loading while those recipes are on their way", async ({ page }) => {
    // Hold the recipes still to learn back for a moment, as a slow connection would.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/unlearned/*", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto("/");
    await expect(page.getByText(/Loading recipes not learned yet \(0 of 2 professions\)/)).toBeVisible();
    await expect(rows(page)).toHaveCount(62);

    // A search that only they can answer waits, visibly, instead of claiming nothing matches.
    await page.getByRole("searchbox").fill("hauberk");
    await expect(page.getByText("Looking through recipes not learned yet…")).toBeVisible();
    await expect(page.getByText("Nothing matches these filters.")).toHaveCount(0);

    release();
    await expect(row(page, "Green Iron Hauberk")).toBeVisible();
    await expect(page.getByText(/Loading recipes not learned yet/)).toHaveCount(0);
  });

  test("shows one crafter's own list and profile", async ({ page }) => {
    await page.goto("/");
    await crafterPicker(page).selectOption({ label: "Stitches" });

    await expect(rows(page)).toHaveCount(6);
    await expect(row(page, "Linen Belt")).toHaveAttribute("data-available", "true");
    await expect(row(page, "Woolen Boots")).toHaveAttribute("data-available", "false");
    await expect(row(page, "Silvered Bronze Gauntlets")).toHaveCount(0);

    const profile = page.getByRole("region", { name: "Stitches's profile" });
    await expect(profile).toContainText("Level 18 · Mage · Alliance");
    await expect(profile.getByLabel("Stitches: Tailoring 60")).toBeVisible();
    await expect(page).toHaveURL(/crafter=stitches/);
  });

  test("shows one profession, with what nobody has learned in it", async ({ page }) => {
    await page.goto("/");
    await professionPicker(page).selectOption({ label: "Blacksmithing" });

    await expect(rows(page)).toHaveCount(65);
    await expect(row(page, "Green Iron Hauberk")).toHaveAttribute("data-available", "false");
    await expect(row(page, "Linen Belt")).toHaveCount(0);
    await expect(page).toHaveURL(/prof=blacksmithing/);

    await professionPicker(page).selectOption({ label: "All professions" });
    await expect(rows(page)).toHaveCount(71);
  });

  test("opens a pasted link on the same crafter and profession", async ({ page }) => {
    await page.goto("/?crafter=damien&prof=blacksmithing");
    await expect(crafterPicker(page)).toHaveValue("damien");
    await expect(professionPicker(page)).toHaveValue("blacksmithing");
    await expect(rows(page)).toHaveCount(65);
    await expect(page.getByRole("region", { name: "Damien's profile" }).getByLabel("Damien: Blacksmithing 145")).toBeVisible();
  });

  test("keeps the crafter when the other filters are cleared", async ({ page }) => {
    await page.goto("/?crafter=stitches");
    await page.getByRole("searchbox").fill("thunderfury");
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(rows(page)).toHaveCount(6);
    await expect(crafterPicker(page)).toHaveValue("stitches");
  });

  test("shows nothing when the chosen crafter does not have the chosen profession", async ({ page }) => {
    await page.goto("/");
    await crafterPicker(page).selectOption({ label: "Stitches" });
    await expect(rows(page)).toHaveCount(6);
    await professionPicker(page).selectOption({ label: "Blacksmithing" });

    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("Stitches has no Blacksmithing recipes.")).toBeVisible();
    await expect(professionPicker(page)).toHaveValue("blacksmithing");

    await page.getByRole("button", { name: "All professions" }).click();
    await expect(rows(page)).toHaveCount(6);
    await expect(crafterPicker(page)).toHaveValue("stitches");
  });

  test("keeps a filter in force, and visible, when the crafter changes under it", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Slot").selectOption("Hands");
    await expect(row(page, "Silvered Bronze Gauntlets")).toBeVisible();

    // Stitches makes nothing for the hands: the list must go empty, not back to everything.
    await crafterPicker(page).selectOption({ label: "Stitches" });
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
    await expect(page.getByLabel("Slot")).toHaveValue("Hands");
  });

  test("shows everyone again for a link to a crafter who has left", async ({ page }) => {
    await page.goto("/?crafter=someone-gone");
    await expect(rows(page)).toHaveCount(71);
    await expect(crafterPicker(page)).toHaveValue("");
  });
});

test.describe("best gear for a character", () => {
  const section = (page: Page, slot: string) => page.getByRole("region", { name: slot, exact: true }).locator("[data-recipe]");
  const choose = async (page: Page, gameClass: string, tree: string, level: string) => {
    await page.getByRole("combobox", { name: "Class", exact: true }).selectOption({ label: gameClass });
    await page.getByRole("combobox", { name: "Talent tree" }).selectOption({ label: tree });
    await page.getByLabel("Character level").fill(level);
  };

  test("ranks the best craftable pieces slot by slot for a class, talent tree and level", async ({ page }) => {
    await page.goto("/");
    await choose(page, "Paladin", "Retribution", "31");

    await expect(page.getByText("Best for a level 31 Retribution Paladin: 31 pieces for 11 slots")).toBeVisible();
    const chest = section(page, "Chest");
    await expect(chest).toHaveCount(3);
    await expect(chest.nth(0)).toContainText("Shining Silver Breastplate");
    await expect(chest.nth(0)).toContainText("Best");
    await expect(chest.nth(1)).toContainText("Green Iron Hauberk");
    await expect(chest.nth(1)).not.toContainText("Best");
    await expect(section(page, "Two-Hand").nth(0)).toContainText("Bronze Battle Axe");
    await expect(page).toHaveURL(/class=paladin&spec=retribution&lvl=31/);
  });

  test("says which order of stats it ranks by, and where that comes from", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    const order = page.getByRole("list", { name: "Order of stats" }).getByRole("listitem");
    await expect(order.first()).toHaveText("Weapon damage");
    await expect(order.nth(1)).toHaveText("Hit");
    await expect(page.getByRole("link", { name: "wowforever.be Retribution guide" })).toHaveAttribute(
      "href",
      "https://wowforever.be/classes/paladin/retribution/",
    );

    await page.getByRole("combobox", { name: "Talent tree" }).selectOption({ label: "Protection" });
    await expect(page.getByText("wowforever.be has no order for this talent tree yet, so this one is our own.")).toBeVisible();
  });

  test("only offers what the character can equip at that level", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    // Plate opens to a Paladin at 40.
    await expect(section(page, "Hands").nth(0)).toContainText("Toughened Leather Gloves");
    await expect(row(page, "Truesilver Gauntlets")).toHaveCount(0);
    await page.getByLabel("Character level").fill("40");
    await expect(section(page, "Hands").nth(0)).toContainText("Truesilver Gauntlets");

    // A Mage wears cloth and nothing else.
    await choose(page, "Mage", "Frost", "20");
    await expect(page.getByText("Best for a level 20 Frost Mage: 5 pieces for 4 slots")).toBeVisible();
    await expect(row(page, "Shining Silver Breastplate")).toHaveCount(0);
    await expect(section(page, "Feet").nth(0)).toContainText("Woolen Boots");
  });

  test("explains why a piece ranks where it does", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    await row(page, "Shining Silver Breastplate").click();
    await expect(detail(page).getByTestId("rank")).toHaveText(
      "Chest for a level 31 Retribution Paladin. Scores 8.2: Strength 14 (7.2) · Stamina 6 (1.0).",
    );
  });

  test("looks at gear from professions nobody in the guild has, too", async ({ page }) => {
    await page.goto("/?class=hunter&spec=marksmanship&lvl=30");
    const rifle = section(page, "Ranged").nth(0);
    await expect(rifle).toContainText("Moonsight Rifle");
    await expect(rifle).toHaveAttribute("data-available", "false");
    await expect(rifle).toContainText("Engineering");
    await expect(professionPicker(page).getByRole("option", { name: "Engineering" })).toHaveCount(1);

    await page.getByLabel("Available now only").check();
    await expect(row(page, "Moonsight Rifle")).toHaveCount(0);
    await expect(section(page, "Main Hand").nth(0)).toContainText("Bronze Shortsword");
  });

  test("shows the whole ranking for one slot when that slot is picked", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    await page.getByLabel("Slot").selectOption("Feet");
    await expect(section(page, "Feet")).toHaveCount(7);
    await expect(page.getByText("Best for a level 31 Retribution Paladin: 7 pieces for 1 slot")).toBeVisible();
  });

  test("lets a visitor change the order, and remembers it", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    await expect(section(page, "Chest").nth(0)).toContainText("Shining Silver Breastplate");

    await page.getByRole("button", { name: "Change" }).click();
    await page.getByRole("button", { name: "Remove Strength" }).click();
    await page.getByRole("button", { name: "Move Stamina up" }).click();
    await expect(page.getByText("Your own order, kept in this browser.")).toBeVisible();
    // Without Strength the Hauberk's Stamina wins the chest.
    await expect(section(page, "Chest").nth(0)).toContainText("Green Iron Hauberk");

    await page.reload();
    await expect(section(page, "Chest").nth(0)).toContainText("Green Iron Hauberk");
    await expect(page.getByText("Your own order, kept in this browser.")).toBeVisible();

    await page.getByRole("button", { name: "Change" }).click();
    await page.getByRole("button", { name: "Back to the default order" }).click();
    await expect(section(page, "Chest").nth(0)).toContainText("Shining Silver Breastplate");
    await expect(page.getByRole("link", { name: "wowforever.be Retribution guide" })).toBeVisible();
  });

  test("goes back to the full list with Show everything", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    await expect(page.getByLabel("Sort")).toHaveCount(0);
    await page.getByRole("button", { name: "Show everything" }).click();
    await expect(rows(page)).toHaveCount(71);
    await expect(page.getByLabel("Sort")).toBeVisible();
    await expect(row(page, "Moonsight Rifle")).toHaveCount(0);
    await expect(page).not.toHaveURL(/class=/);
  });

  test("warns that soulbound pieces are for their crafter only", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    const warning = page.getByText("Soulbound crafted pieces can only be worn by whoever crafts them.");
    await expect(warning).toBeVisible();
    await page.getByLabel("Tradeable only").check();
    await expect(warning).toHaveCount(0);
    await expect(section(page, "Head").nth(0)).toContainText("Green Iron Helm");
  });
});

test.describe("comparing with gear that is not crafted", () => {
  const section = (page: Page, slot: string) => page.getByRole("region", { name: slot, exact: true }).locator("[data-recipe]");
  const everySource = (page: Page) => page.getByLabel("Include drops and quest rewards");

  test("ranks drops and quest rewards beside what can be crafted, on request", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    await expect(section(page, "Chest").nth(0)).toContainText("Shining Silver Breastplate");
    await expect(row(page, "Avenger's Armor")).toHaveCount(0);

    await everySource(page).check();
    const chest = section(page, "Chest");
    await expect(chest.nth(0)).toContainText("Avenger's Armor");
    await expect(chest.nth(0)).toContainText("Razorfen Kraul");
    await expect(chest.nth(0)).toContainText("Drop");
    await expect(chest.nth(0)).toHaveAttribute("data-crafted", "false");
    // The best the guild could make is pointed out beside the best there is.
    await expect(chest.nth(1)).toContainText("Shining Silver Breastplate");
    await expect(chest.nth(1)).toContainText("Best craftable");
    await expect(page.getByText(/Best for a level 31 Retribution Paladin: 34 pieces for 11 slots · 7 not crafted/)).toBeVisible();
    await expect(page).toHaveURL(/all=1/);
  });

  test("shows the best craftable piece even when gear from elsewhere fills the list", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31&all=1");
    const twoHand = section(page, "Two-Hand");
    await expect(twoHand).toHaveCount(4);
    await expect(twoHand.nth(0)).toContainText("Thermaplugg's Left Arm");
    await expect(twoHand.nth(2)).toContainText("Manual Crowd Pummeler");
    await expect(twoHand.nth(3)).toContainText("Bronze Battle Axe");
    await expect(twoHand.nth(3)).toContainText("Best craftable · 4th");
  });

  test("says where a piece comes from, with links to read up on it", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31&all=1");
    await row(page, "Thermaplugg's Left Arm").click();
    const pane = detail(page);
    await expect(pane).toContainText("Not crafted · Drop");
    await expect(pane.getByRole("region", { name: "Where it comes from" })).toContainText(
      "Drops from Mekgineer Thermaplugg in Gnomeregan",
    );
    await expect(pane.getByRole("link", { name: "Mekgineer Thermaplugg" })).toHaveAttribute(
      "href",
      "https://wowforever.be/guides/dungeons/gnomeregan/#mekgineer-thermaplugg",
    );
    await expect(pane.getByRole("link", { name: "Wowhead" })).toHaveAttribute(
      "href",
      "https://www.wowhead.com/forever/item=9459",
    );
    // No recipe, so nothing about reagents, crafters or learning it.
    await expect(pane.getByRole("region", { name: "Reagents" })).toHaveCount(0);
    await expect(pane).not.toContainText("Not available yet");
    await expect(page).toHaveURL(/item=9459/);
  });

  test("marks a quest reward only one side can earn", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31&all=1");
    const cape = row(page, "Grimsteel Cape");
    await expect(cape).toContainText("Quest reward");
    await expect(cape.getByText("Horde only", { exact: true })).toHaveCSS("color", "rgb(255, 32, 32)");
    await row(page, "Chausses of Westfall").click();
    await expect(detail(page).getByRole("region", { name: "Where it comes from" })).toContainText(
      "Reward of the quest The Defias Brotherhood in The Deadmines (Alliance only)",
    );
  });

  test("only offers what the character can equip, like everything else", async ({ page }) => {
    await page.goto("/?class=mage&spec=frost&lvl=20&all=1");
    await expect(section(page, "Chest").nth(0)).toContainText("Robe of Evocation");
    await expect(row(page, "Avenger's Armor")).toHaveCount(0);
    // A mace is no use to a Mage at any level. A Priest can wield it, but not this one before level 57.
    await page.getByLabel("Character level").fill("60");
    await expect(row(page, "Hand of Edward the Odd")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Class", exact: true }).selectOption({ label: "Priest" });
    await page.getByLabel("Character level").fill("56");
    await expect(row(page, "Robe of Evocation")).toHaveCount(1);
    await expect(row(page, "Hand of Edward the Odd")).toHaveCount(0);
    await page.getByLabel("Character level").fill("57");
    // It comes from a best-in-slot list, which says only this of its source.
    await expect(row(page, "Hand of Edward the Odd")).toContainText("World drop");
    await expect(row(page, "Hand of Edward the Odd")).toContainText("Listed");
  });

  test("opens a pasted link on the same piece", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31&all=1&item=6087");
    await expect(everySource(page)).toBeChecked();
    await expect(detail(page).getByRole("heading", { name: "Chausses of Westfall" })).toBeVisible();
  });

  test("never puts such gear in the ordinary list", async ({ page }) => {
    await page.goto("/?class=paladin&spec=retribution&lvl=31&all=1");
    await expect(row(page, "Avenger's Armor")).toHaveCount(1);
    await everySource(page).uncheck();
    await expect(row(page, "Avenger's Armor")).toHaveCount(0);
    await page.goto("/?class=paladin&spec=retribution&lvl=31&all=1");
    await page.getByRole("button", { name: "Show everything" }).click();
    await expect(rows(page)).toHaveCount(71);
    await page.getByRole("searchbox").fill("avenger");
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
    await expect(page).not.toHaveURL(/all=1/);
  });
});

test.describe("reading up on an item", () => {
  test("links a crafted item to its page and to where its recipe is listed", async ({ page }) => {
    await page.goto("/");
    await row(page, "Silvered Bronze Gauntlets").click();
    const pane = detail(page);
    await expect(pane.getByRole("link", { name: "Wowhead" })).toHaveAttribute(
      "href",
      "https://www.wowhead.com/forever/item=3483",
    );
    await expect(pane.getByRole("link", { name: "wowforever.be Blacksmithing recipes" })).toHaveAttribute(
      "href",
      "https://wowforever.be/tradeskills/forever/blacksmithing/recipes/",
    );
  });
});

test.describe("search and filters", () => {
  test("searches item names", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").fill("silver");
    await expect(row(page, "Silvered Bronze Gauntlets")).toBeVisible();
    await expect(row(page, "Copper Chain Belt")).toHaveCount(0);
    await expect(page.getByText(/of 71 recipes/)).toBeVisible();
  });

  test("finds recipes by a reagent they use", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").fill("green dye");
    await expect(row(page, "Green Iron Leggings")).toBeVisible();
    await expect(row(page, "Silvered Bronze Gauntlets")).toHaveCount(0);
  });

  test("filters by slot", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Slot").selectOption("Hands");
    await expect(row(page, "Silvered Bronze Gauntlets")).toBeVisible();
    await expect(row(page, "Green Iron Leggings")).toHaveCount(0);
  });

  test("hides soulbound crafts with Tradeable only", async ({ page }) => {
    await page.goto("/");
    await expect(row(page, "Veteran's Silvered Chain Helm")).toBeVisible();
    await page.getByLabel("Tradeable only").check();
    await expect(row(page, "Veteran's Silvered Chain Helm")).toHaveCount(0);
    await expect(row(page, "Silvered Bronze Gauntlets")).toBeVisible();
  });

  test("offers a way out when nothing matches", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").fill("thunderfury");
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(rows(page)).toHaveCount(71);
  });
});

test.describe("links", () => {
  test("keeps filters and the open item in the address", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Slot").selectOption("Hands");
    await row(page, "Silvered Bronze Gauntlets").click();
    await expect(page).toHaveURL(/\?slot=Hands&recipe=3333$/);
  });

  test("reopens the same item and filters from a pasted link", async ({ page }) => {
    await page.goto("/?slot=Legs&recipe=3506");
    await expect(detail(page).getByRole("heading", { name: "Green Iron Leggings" })).toBeVisible();
    await expect(page.getByLabel("Slot")).toHaveValue("Legs");
    await expect(row(page, "Silvered Bronze Gauntlets")).toHaveCount(0);
  });
});

test.describe("on a phone @phone", () => {
  test("opens details as a full-screen sheet that Back closes", async ({ page }) => {
    await page.goto("/");
    const sheet = page.getByRole("dialog", { name: "Item details" });
    await expect(sheet).toBeHidden();

    await row(page, "Silvered Bronze Gauntlets").tap();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("118 Armor")).toBeVisible();
    await expect(sheet.getByText("Coarse Grinding Stone")).toBeVisible();

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(rows(page).first()).toBeVisible();
  });

  test("closes the sheet with its close button", async ({ page }) => {
    await page.goto("/");
    await row(page, "Green Iron Leggings").tap();
    const sheet = page.getByRole("dialog", { name: "Item details" });
    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();
  });

  test("lets a crafter be chosen without opening the extra filters", async ({ page }) => {
    await page.goto("/");
    await expect(crafterPicker(page)).toBeVisible();
    await crafterPicker(page).selectOption({ label: "Stitches" });
    await expect(rows(page)).toHaveCount(6);
    await expect(page.getByRole("region", { name: "Stitches's profile" })).toBeVisible();
  });

  test("keeps extra filters folded away until asked for", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Slot")).toBeHidden();
    await page.getByRole("button", { name: /^Filters/ }).tap();
    await page.getByLabel("Slot").selectOption("Hands");
    await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
    await expect(row(page, "Green Iron Leggings")).toHaveCount(0);
  });
});
