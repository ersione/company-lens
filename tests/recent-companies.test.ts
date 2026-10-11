import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentCompanies, rememberRecentCompany, recentCompaniesRetention } from "@/lib/recent-companies";

test("recent visits validate storage, expire after 30 days, deduplicate and keep five newest", () => {
  const now = 2000000000000;
  const row = { id: 1, name: "회사", visitedAt: now };
  for (const raw of [null, "broken", "{}", "null", JSON.stringify([null, 3, "abc", {}, { ...row, id: -1 },
    { ...row, name: "" }, { ...row, visitedAt: now + 1 }, { ...row, visitedAt: now - recentCompaniesRetention }])]) {
    assert.deepEqual(parseRecentCompanies(raw, now), []);
  }
  const rows = Array.from({ length: 8 }, (_, i) => ({ ...row, id: i + 1, visitedAt: now - i }));
  assert.deepEqual(parseRecentCompanies(JSON.stringify([...rows, { ...row, visitedAt: now - 1 }]), now).map(r => r.id), [1,2,3,4,5]);
  assert.deepEqual(rememberRecentCompany(JSON.stringify(rows), { id: 3, name: "변경된 회사명" }, now).map(r => r.id), [3,1,2,4,5]);
  assert.equal(rememberRecentCompany(JSON.stringify(rows), { id: 3, name: "변경된 회사명" }, now)[0].name, "변경된 회사명");
  assert.deepEqual(Object.keys(parseRecentCompanies(JSON.stringify([{ ...row, private: "ignored" }]), now)[0]).sort(), ["id","name","visitedAt"]);
  assert.deepEqual(parseRecentCompanies(" ".repeat(65537), now), []);
});
