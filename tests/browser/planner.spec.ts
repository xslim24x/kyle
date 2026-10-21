import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";
const monday = DateTime.now()
  .setZone("America/Toronto")
  .startOf("week")
  .toISODate()!;
test("employer can plan coverage, assign a shift, fund it, publish it, and sign out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-only");
  await page.getByRole("button", { name: "Open planner" }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer week ahead." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const state = await (await fetch("/api/state")).json();
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: state.revision,
        data: { employees: [], needs: [], shifts: [], budgets: [] },
      }),
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Support staff", exact: true })
    .click();
  await page.getByRole("button", { name: "Add staff" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Alex Morgan");
  await page.getByRole("button", { name: "Add rate" }).click();
  await page.getByLabel("Effective from").fill(monday);
  await page.getByLabel("CAD per hour").fill("25");
  await page.getByRole("button", { name: "Save employee" }).click();
  await expect(page.getByText("Alex Morgan", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Coverage needs", exact: true })
    .click();
  await page.getByRole("button", { name: "Add need" }).click();
  await page.getByRole("button", { name: "Save coverage need" }).click();
  await expect(page.getByText("Support", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  await page
    .getByRole("button", { name: "Add shift", exact: false })
    .first()
    .click();
  await page
    .getByLabel("Support staff", { exact: true })
    .selectOption({ label: "Alex Morgan" });
  await page.getByRole("button", { name: "Save shift" }).click();
  await expect(
    page.locator(".fc").getByText("Alex Morgan", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit budget" }).click();
  await page.getByLabel("Weekly funding (CAD)").fill("1000");
  await page.getByLabel("Employer cost (% of estimated wages)").fill("15");
  await page.getByLabel("Fixed employer costs for this week (CAD)").fill("10");
  await page.getByRole("button", { name: "Save weekly budget" }).click();
  await expect(page.getByText("$240.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish week" }).click();
  await page.getByLabel("I acknowledge incomplete estimates").check();
  await page.getByRole("button", { name: "Publish schedule" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "/tmp/kyle-planner-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Calendars", exact: true }).click();
  await page.getByRole("button", { name: "Generate private URL" }).click();
  const url = await page
    .getByLabel("Private shift subscription URL")
    .inputValue();
  const feed = await page.request.get(url);
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("Alex Morgan");
  await page.getByRole("button", { name: "Revoke export access" }).click();
  await expect(
    page.getByLabel("Private shift subscription URL"),
  ).not.toBeVisible();
  expect((await page.request.get(url)).status()).toBe(404);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile navigation and dialog fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-only");
  await page.getByRole("button", { name: "Open planner" }).click();
  await page.getByRole("button", { name: "Add shift" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({
    path: "/tmp/kyle-planner-mobile.png",
    fullPage: true,
  });
});
