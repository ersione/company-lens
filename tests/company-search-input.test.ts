import assert from "node:assert/strict";
import test from "node:test";
import { validateCompanySearch } from "@/lib/company-search-input";

test("web and API search share length, wildcard, control and numeric validation", () => {
  for (const query of ["가", "a", "𠮷", "abc%", "abc_", "abc\0", "\n삼성전자", "삼성전자\t", "---", "1--", "가".repeat(101)]) {
    assert.ok(validateCompanySearch(query).error, query);
    assert.ok(validateCompanySearch(query, true).error, query);
  }
  for (const query of ["티빙", " 티빙 ", "회사", "ab", "삼성전자", " 네이버 ", "12", "1 - 2", "123-456", "가".repeat(100), "𠮷𠮷"]) {
    assert.deepEqual(validateCompanySearch(query), { query: query.trim(), error: null });
    assert.deepEqual(validateCompanySearch(query, true), validateCompanySearch(query));
  }
});

test("web landing allows absent or whitespace input but rejects duplicate q", () => {
  for (const query of [undefined, "", "   "]) {
    assert.deepEqual(validateCompanySearch(query, true), { query: "", error: null });
    assert.ok(validateCompanySearch(query).error);
  }
  for (const query of [["삼성전자", "네이버"], ["", ""], []]) {
    assert.ok(validateCompanySearch(query, true).error);
    assert.ok(validateCompanySearch(query).error);
  }
  assert.ok(validateCompanySearch("\n", true).error);
});

test("rejected form values are bounded and do not contain control characters", () => {
  const value = validateCompanySearch("𠮷".repeat(200) + "\0", true);
  assert.ok(value.error);
  assert.equal([...value.query].length, 100);
  assert.ok(!value.query.includes("\0"));
});
