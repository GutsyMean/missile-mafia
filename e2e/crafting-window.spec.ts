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
    await expect(rows(page)).toHaveCount(63);
    await expect(page.getByText("63 recipes · 5 not available yet")).toBeVisible();

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
    await expect(mail.nth(26)).toContainText("Green Iron Hauberk");
    await expect(mail.nth(27)).toContainText("Golden Scale Bracers");
    await expect(mail.nth(28)).toContainText("Steel Breastplate");
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
    await expect(rows(page)).toHaveCount(69);
    await expect(page.locator('[data-recipe][data-available="false"]')).toHaveCount(7);
    await expect(page.getByText("69 recipes · 7 not available yet")).toBeVisible();
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

    await expect(rows(page)).toHaveCount(63);
    await expect(row(page, "Green Iron Hauberk")).toHaveAttribute("data-available", "false");
    await expect(row(page, "Linen Belt")).toHaveCount(0);
    await expect(page).toHaveURL(/prof=blacksmithing/);

    await professionPicker(page).selectOption({ label: "All professions" });
    await expect(rows(page)).toHaveCount(69);
  });

  test("opens a pasted link on the same crafter and profession", async ({ page }) => {
    await page.goto("/?crafter=damien&prof=blacksmithing");
    await expect(crafterPicker(page)).toHaveValue("damien");
    await expect(professionPicker(page)).toHaveValue("blacksmithing");
    await expect(rows(page)).toHaveCount(63);
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
    await expect(rows(page)).toHaveCount(69);
    await expect(crafterPicker(page)).toHaveValue("");
  });
});

test.describe("search and filters", () => {
  test("searches item names", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").fill("silver");
    await expect(row(page, "Silvered Bronze Gauntlets")).toBeVisible();
    await expect(row(page, "Copper Chain Belt")).toHaveCount(0);
    await expect(page.getByText(/of 69 recipes/)).toBeVisible();
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
    await expect(rows(page)).toHaveCount(69);
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
