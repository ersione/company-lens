import { expect, test } from "@playwright/test";

test("Korean webfont is served locally and secondary metrics remain readable", async ({ page }) => {
  const fonts: { url: string; status: number }[] = [];
  page.on("response", (response) => {
    if (/\.woff2(?:\?|$)/.test(response.url())) fonts.push({ url: response.url(), status: response.status() });
  });
  await page.goto("/companies/177744");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".history-chart")).toHaveAttribute("data-ready", "true");
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Noto Sans KR Variable");
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every(({ url, status }) => new URL(url).origin === new URL(page.url()).origin && status === 200)).toBe(true);
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument");
  const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".company-header h1" });
  const rendered = await client.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(rendered.fonts.some((font) => font.isCustomFont && /Noto Sans KR/.test(font.familyName))).toBe(true);
  await client.detach();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.locator(".metric-comparison strong").evaluateAll((elements) => elements.every((element) =>
      parseFloat(getComputedStyle(element).fontSize) >= 16 && Number(getComputedStyle(element).fontWeight) >= 700))).toBe(true);
    expect(await page.locator(".monthly-salary strong, .movement-breakdown dd").evaluateAll((elements) => elements.every((element) =>
      parseFloat(getComputedStyle(element).fontSize) >= 20))).toBe(true);
    expect(await page.locator(".movement-breakdown").evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".detail-metrics").screenshot({ path: `test-results/typography-metrics-${width}.png` });
  }
  await page.goto("/companies/4270");
  await expect(page.locator(".history-chart")).toHaveAttribute("data-ready", "true");
  expect(await page.locator(".detail-metric > strong").evaluateAll((elements) => elements.every((element) =>
    element.getBoundingClientRect().height <= parseFloat(getComputedStyle(element).lineHeight) + 1))).toBe(true);
  await page.locator(".detail-metrics").screenshot({ path: "test-results/typography-samsung-320.png" });
});
