import { expect, test } from "@playwright/test";
import { load } from "cheerio";

test("server HTML distinguishes search, API docs and home for crawlers", async ({ request }) => {
  for (const path of ["/", "/?q=삼성", "/?q=a", "/api-docs"]) {
    const response = await request.get(path, { headers: { "User-Agent": "Googlebot" } });
    expect(response.status()).toBe(200);
    const $ = load(await response.text());
    const canonical = $("head link[rel=canonical]").attr("href");
    expect(canonical).toBe(`https://companylens.ersione.com${path === "/api-docs" ? path : ""}`);
    if (path.startsWith("/?")) {
      expect($("head meta[name=robots]").attr("content")).toContain("noindex");
      expect($("script[type='application/ld+json']")).toHaveLength(0);
    } else if (path === "/") {
      const data = JSON.parse($("script[type='application/ld+json']").html()!);
      expect(data["@type"]).toBe("WebSite");
      expect(data.name).toBe("Company Lens");
      expect($("h1").text()).toContain("숫자로 보는 회사");
    } else {
      expect($("head meta[property='og:url']").attr("content")).toBe(canonical);
      expect($("head meta[name=description]").attr("content")).toContain("API");
    }
  }
  expect(await (await request.get("/sitemap.xml")).text()).toContain("https://companylens.ersione.com/api-docs");
  expect((await request.get("/companies/0", { headers: { "User-Agent": "Googlebot" } })).status()).toBe(404);
});

test("sitemap index exposes bounded company shards and rejects unknown shard URLs", async ({ request }) => {
  const response = await request.get("/sitemap-index.xml");
  expect(response.status()).toBe(200);
  const $ = load(await response.text(), { xmlMode: true });
  const locations = $("loc").map((_, node) => $(node).text()).get();
  expect(locations).toContain("https://companylens.ersione.com/sitemap.xml");
  const shard = locations.find(url => url.includes("/sitemaps/companies/"));
  expect(shard).toBeTruthy();
  const document = await request.get(new URL(shard!).pathname);
  expect(document.status()).toBe(200);
  const urls = load(await document.text(), { xmlMode: true });
  expect(urls("url").length).toBeGreaterThan(0);
  expect(urls("url").length).toBeLessThanOrEqual(10000);
  expect(urls("lastmod").first().text()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  for (const id of ["bad.xml", "-1.xml", "999999999999999999.xml", "999999.xml"]) {
    expect((await request.get(`/sitemaps/companies/${id}`)).status()).toBe(404);
  }
  expect(await (await request.get("/robots.txt")).text()).toContain("/sitemap-index.xml");
});
