export const recentCompaniesKey = "company-lens:recent-companies:v1";
export const recentCompaniesLimit = 5;
export const recentCompaniesRetention = 30 * 24 * 60 * 60 * 1000;
export type RecentCompany = { id: number; name: string; visitedAt: number };

export function parseRecentCompanies(raw: string | null, now = Date.now()): RecentCompany[] {
  if (!raw || raw.length > 65536) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<number>();
    return value.slice(0, 100).filter((item): item is RecentCompany => Boolean(item)
      && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === "string"
      && item.name.trim().length > 0 && item.name.length <= 1000
      && Number.isFinite(item.visitedAt) && item.visitedAt > now - recentCompaniesRetention
      && item.visitedAt <= now)
      .map(({ id, name, visitedAt }) => ({ id, name, visitedAt }))
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .filter(({ id }) => { if (seen.has(id)) return false; seen.add(id); return true; })
      .slice(0, recentCompaniesLimit);
  } catch { return []; }
}

export function rememberRecentCompany(raw: string | null, company: { id: number; name: string }, now = Date.now()) {
  return parseRecentCompanies(JSON.stringify([{ ...company, visitedAt: now },
    ...parseRecentCompanies(raw, now).filter(({ id }) => id !== company.id)]), now);
}
