import { expect, test } from "@playwright/test";

const sections = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Sections" });

test.describe("the site", () => {
  test("opens on the home page, with its sections across the top", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Missile Mafia HQ");
    await expect(page.getByRole("heading", { level: 1, name: "What do you need made?" })).toBeVisible();
    await expect(sections(page).getByRole("link")).toHaveText(["Home", "Crafting", "Best gear", "Roster", "Events", "Guild bank"]);
    await expect(sections(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("62 recipes from 2 crafters across 2 professions.")).toBeVisible();
  });

  test("moves between sections and marks the one in view", async ({ page }) => {
    await page.goto("/");
    await sections(page).getByRole("link", { name: "Roster" }).click();
    await expect(page).toHaveURL(/\/roster$/);
    await expect(page).toHaveTitle("Roster · Missile Mafia HQ");
    await expect(sections(page).getByRole("link", { name: "Roster" })).toHaveAttribute("aria-current", "page");
    await expect(sections(page).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");

    await sections(page).getByRole("link", { name: "Best gear" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Best gear" })).toBeVisible();
    await page.getByRole("link", { name: "Missile Mafia HQ, home" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("searches the crafting list from the home page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search items and reagents" }).fill("battle axe");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/crafting\?q=battle\+axe$/);
    await expect(page.getByRole("heading", { level: 1, name: "Crafting" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search items and reagents" })).toHaveValue("battle axe");
    await expect(page.locator("[data-recipe]:visible")).toHaveCount(2);
    await expect(page.locator("[data-recipe]:visible").first()).toContainText("Battle Axe");
  });

  test("names who to ask for each profession, and opens their recipes", async ({ page }) => {
    await page.goto("/");
    const blacksmithing = page.getByRole("row", { name: /Blacksmithing/ });
    await expect(blacksmithing).toContainText("Damien 145");
    await blacksmithing.getByRole("link", { name: "Damien" }).click();
    await expect(page).toHaveURL(/\/crafting\?crafter=damien&prof=blacksmithing$/);
    await expect(page.getByRole("combobox", { name: "Crafter", exact: true })).toHaveValue("damien");
    await expect(page.locator("[data-recipe]:visible").first()).toBeVisible();
  });

  test("leads from a class straight to its gear", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Paladin", exact: true }).click();
    await expect(page).toHaveURL(/\/gear\?class=paladin$/);
    await expect(page.getByRole("combobox", { name: "Class", exact: true })).toHaveValue("paladin");
    await expect(page.getByRole("region", { name: "Chest", exact: true })).toBeVisible();
  });

  test("lists every crafter against every profession on the roster", async ({ page }) => {
    await page.goto("/roster");
    await expect(page.getByRole("columnheader")).toHaveText(["Character", "Recipes", "Blacksmithing", "Tailoring"]);
    const damien = page.getByRole("row", { name: /^Damien/ });
    await expect(damien).toContainText("Level 24 Paladin");
    await expect(damien.getByRole("cell")).toHaveText(["58", "145", ""]);
    await page.getByRole("link", { name: "Stitches: Tailoring 60" }).click();
    await expect(page).toHaveURL(/\/crafting\?crafter=stitches&prof=tailoring$/);
    await expect(page.getByRole("combobox", { name: "Profession", exact: true })).toHaveValue("tailoring");
  });

  test("keeps links from before the site had sections working", async ({ page }) => {
    await page.goto("/?crafter=damien&prof=blacksmithing&recipe=3333");
    await expect(page).toHaveURL(/\/crafting\?crafter=damien&prof=blacksmithing&recipe=3333$/);
    await expect(page.locator('[data-testid="detail"]:visible')).toContainText("Silvered Bronze Gauntlets");

    await page.goto("/?class=paladin&spec=retribution&lvl=31");
    await expect(page).toHaveURL(/\/gear\?class=paladin&spec=retribution&lvl=31$/);
    await expect(page.getByText("Best for a level 31 Retribution Paladin")).toBeVisible();

    // A class named on the crafting list belongs to the gear page as well.
    await page.goto("/crafting?class=mage&spec=frost&lvl=20");
    await expect(page).toHaveURL(/\/gear\?class=mage&spec=frost&lvl=20$/);
  });

  test("uses the width of a wide screen: filters at the side, the list in columns", async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto("/crafting");
    const [filters, list, first, second] = await Promise.all([
      page.getByRole("complementary", { name: "Filters" }).boundingBox(),
      page.locator("[data-recipe]:visible").first().locator("xpath=ancestor::ul").boundingBox(),
      page.locator("[data-recipe]:visible").nth(0).boundingBox(),
      page.locator("[data-recipe]:visible").nth(1).boundingBox(),
    ]);
    // The filters stand to the left of the list, and the second recipe sits beside the first.
    expect(filters!.x + filters!.width).toBeLessThanOrEqual(list!.x);
    expect(second!.y).toBe(first!.y);
    expect(second!.x).toBeGreaterThan(first!.x);
    const window = await page.getByRole("region", { name: "Crafting", exact: true }).boundingBox();
    expect(window!.width).toBeGreaterThan(1400);
  });
});

test.describe("on a phone @phone", () => {
  test("keeps the sections within reach and nothing wider than the screen", async ({ page }) => {
    for (const path of ["/", "/crafting", "/gear", "/roster", "/events", "/bank"]) {
      await page.goto(path);
      await expect(sections(page).getByRole("link", { name: "Home" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBe(0);
    }
  });
});

test.describe("the calendar", () => {
  test.use({ timezoneId: "Europe/Berlin" });

  test("lists what is coming up by day, in the reader's own time zone, and what has been", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
    await expect(page.getByText(/Times are in your own time zone \((CET|CEST)\)\./)).toBeVisible();

    const upcoming = page.getByRole("region", { name: "Coming up" });
    await expect(upcoming.getByRole("listitem").filter({ hasText: "Molten Core" }).last()).toContainText("Bring fire resistance and two flasks.");
    // The sample raid starts at 19:30 UTC: half past eight in Berlin in winter, half past nine in summer.
    await expect(upcoming.getByRole("listitem").filter({ hasText: "Molten Core" }).last().getByRole("time")).toHaveText(/^2[01]:30$/);
    await expect(upcoming.getByText("Guild meeting")).toBeVisible();
    await expect(upcoming.getByText("Scarlet Monastery run")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Earlier" })).toContainText("Scarlet Monastery run");
  });

  test("shows the next events on the home page, with a way to the rest", async ({ page }) => {
    await page.goto("/");
    const next = page.getByRole("region", { name: "Coming up" });
    await expect(next).toContainText("Molten Core");
    await expect(next).not.toContainText("Bring fire resistance");
    await next.getByRole("link", { name: "The calendar" }).click();
    await expect(page).toHaveURL(/\/events$/);
  });
});

test.describe("the guild bank", () => {
  test("is kept for guild members: a visitor is asked to sign in", async ({ page }) => {
    await page.goto("/");
    await sections(page).getByRole("link", { name: "Guild bank" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Guild bank" })).toBeVisible();
    await expect(page.getByText("is for guild members")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(page.getByText("What it holds")).toHaveCount(0);
  });
});

test.describe("going back", () => {
  test("finds a page as it was left, and filters do not follow from one page to the next", async ({ page }) => {
    await page.goto("/gear?class=paladin&spec=retribution&lvl=31");
    const profession = () => page.getByRole("combobox", { name: "Profession", exact: true });
    await profession().selectOption({ label: "Blacksmithing" });
    await expect(page).toHaveURL(/prof=blacksmithing/);

    await sections(page).getByRole("link", { name: "Crafting" }).click();
    await expect(page).toHaveURL(/\/crafting$/);
    await expect(profession()).toHaveValue("");
    await expect(page.locator("[data-recipe]:visible")).toHaveCount(71);

    await page.goBack();
    await expect(page).toHaveURL(/\/gear\?prof=blacksmithing&class=paladin&spec=retribution&lvl=31$/);
    await expect(profession()).toHaveValue("blacksmithing");
    await expect(page.getByText("Best for a level 31 Retribution Paladin")).toBeVisible();
  });

  test("the way past the bar leads to the page in view", async ({ page }) => {
    await page.goto("/");
    await sections(page).getByRole("link", { name: "Roster" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Roster" })).toBeVisible();
    await expect(page.locator("#main")).toHaveCount(1);
    await expect(page.locator("#main")).toContainText("Level 24 Paladin");
  });
});
