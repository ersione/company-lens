import { companySitemapRows, companySitemapXml, readCompanySitemap, sitemapHeaders } from "@/lib/company-sitemap";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^(0|[1-9]\d*)\.xml$/.test(id)) return new Response("Not found", { status: 404 });
  const shard = Number(id.slice(0, -4));
  const rows = readCompanySitemap(db => companySitemapRows(db, shard));
  if (!rows.length) return new Response("Not found", { status: 404 });
  return new Response(companySitemapXml(rows), { headers: sitemapHeaders });
}
