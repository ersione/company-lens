import { expect, test } from "@playwright/test";

test("search and company navigation hydrate without mismatches", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (
      /hydrat|server rendered HTML|server-rendered HTML/i.test(message.text())
    ) {
      failures.push(message.text());
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".results-section")).toHaveCount(0);
  await expect(page.locator("a.result-row")).toHaveCount(0);
  await page.route("**/?q=**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.getByRole("textbox", { name: "회사 검색" }).fill("삼성전자");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("button", { name: "검색", exact: true })).toHaveAttribute("aria-busy", "true");
  const firstResult = page.locator("a.result-row").first();
  await expect(firstResult).toContainText("삼성전자(주)");
  await firstResult.click();
  await expect(
    page.getByRole("heading", { name: "삼성전자(주)", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-chart")).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".calculation-note")).toContainText("9.5%");
  await page.getByRole("link", { name: "검색으로 돌아가기" }).click();
  await expect(page.getByRole("textbox", { name: "회사 검색" })).toBeVisible();
  await expect(page.locator(".results-section")).toHaveCount(0);
  await page.getByRole("textbox", { name: "회사 검색" }).fill("   ");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.locator(".results-section")).toHaveCount(0);
  expect(failures).toEqual([]);
});
