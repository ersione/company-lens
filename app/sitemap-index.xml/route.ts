import { companySitemapShards, readCompanySitemap, sitemapHeaders } from "@/lib/company-sitemap";
import { publicOrigin } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";
export function GET() {
  const shards = readCompanySitemap(companySitemapShards);
  const paths = ["/sitemap.xml", ...shards.map(id => `/sitemaps/companies/${id}.xml`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<sitemap><loc>${publicOrigin}${path}</loc></sitemap>`).join("")}</sitemapindex>`, { headers: sitemapHeaders });
}
