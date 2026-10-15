import type { MetadataRoute } from "next";
import { getStatisticsGroups, getStatisticsHistory, statisticsHref } from "@/lib/public-statistics";
import { publicOrigin } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const latest = getStatisticsHistory("total", "전국").at(-1);
  return [
    { url: `${publicOrigin}/api-docs` },
    ...["/", "/statistics", "/employment-trends", "/industries", "/regions"].map((path) => ({ url: `${publicOrigin}${path}`, lastModified: latest?.generatedAt })),
    ...(["industry", "region"] as const).flatMap((dimension) => getStatisticsGroups(dimension).map((row) => ({
      url: `${publicOrigin}${statisticsHref(dimension, row.key)}`, lastModified: row.generatedAt
    })))
  ];
}
