import { expect, test } from "@playwright/test";
import { load } from "cheerio";

const origin = "https://companylens.ersione.com";

test("Slack and Kakao receive company metadata in head without JavaScript", async ({ request }) => {
  const found = await request.get("/api/v1/companies?q=삼성전자&limit=1");
  const company = (await found.json()).data.companies[0];
  for (const agent of ["Slackbot-LinkExpanding 1.0", "facebookexternalhit/1.1; kakaotalk-scrap/1.0"]) {
    for (const path of ["/", `/companies/${company.id}`]) {
      const response = await request.get(path, { headers: { "User-Agent": agent } });
      expect(response.status()).toBe(200);
      const $ = load(await response.text());
      expect($("head meta[property='og:site_name']").attr("content")).toBe("Company Lens");
      expect(new URL($("head meta[property='og:url']").attr("content")!).href).toBe(`${origin}${path}`);
      expect(new URL($("head link[rel='canonical']").attr("href")!).href).toBe(`${origin}${path}`);
      expect($("head meta[name='twitter:card']").attr("content")).toBe("summary_large_image");
      expect($("head meta[property='og:image']").attr("content")).toMatch(/^https:\/\/companylens\.ersione\.com\/opengraph-image/);
      if (path !== "/") {
        expect($("head meta[property='og:title']").attr("content")).toContain(company.name);
        expect($("head meta[property='og:description']").attr("content")).toContain("국민연금 기반 추정치");
      }
    }
  }
  expect((await request.get("/companies/9007199254740991", { headers: { "User-Agent": "Slackbot" } })).status()).toBe(404);
});

test("preview image is a valid 1200 by 630 PNG", async ({ request, page }) => {
  const response = await request.get("/opengraph-image");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const png = await response.body();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  expect(png.length).toBeLessThan(5 * 1024 * 1024);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto("/opengraph-image");
  await page.locator("img").evaluate(async (image: HTMLImageElement) => { await image.decode(); });
  await page.locator("img").screenshot({ path: "test-results/social-preview.png" });
});
