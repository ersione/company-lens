import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSearchOptions, parseSearchOptions, regionPrefixes, searchHref } from "../lib/company-search-options";

test("search options validate enums, duplicates, and bounded positive integers", () => {
  assert.deepEqual(parseSearchOptions({}).options, defaultSearchOptions);
  assert.deepEqual(parseSearchOptions({ region: "", minEmployees: "", sort: "relevance" }).options, defaultSearchOptions);
  assert.deepEqual(parseSearchOptions({ region: "경기도", minEmployees: "50", sort: "employees", page: "2" }), {
    options: { region: "경기도", minEmployees: 50, sort: "employees", page: 2 }, error: null
  });
  for (const params of [{ page: "0" }, { page: "" }, { sort: "" }, { page: "1001" }, { page: "1e2" }, { page: "01" }, { page: ["1", "2"] },
    { minEmployees: "-1" }, { minEmployees: "10000001" }, { minEmployees: "NaN" }, { region: "서울" }, { sort: "oops" }]) {
    assert.ok(parseSearchOptions(params).error, JSON.stringify(params));
  }
  assert.deepEqual(regionPrefixes("강원특별자치도"), ["강원특별자치도", "강원도"]);
  assert.deepEqual(regionPrefixes("전북특별자치도"), ["전북특별자치도", "전라북도"]);
});

test("pagination URLs preserve filters and omit first-page defaults", () => {
  const href = searchHref("삼성전자", { region: "경기도", minEmployees: 50, sort: "employees", page: 2 });
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("q"), "삼성전자");
  assert.equal(url.searchParams.get("region"), "경기도");
  assert.equal(url.searchParams.get("minEmployees"), "50");
  assert.equal(url.searchParams.get("sort"), "employees");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(new URL(searchHref("삼성전자", defaultSearchOptions), url).searchParams.size, 1);
});
