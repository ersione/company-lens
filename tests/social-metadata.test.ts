import assert from "node:assert/strict";
import { test } from "node:test";
import { homeMetadata, websiteStructuredData, companySocialMetadata, publicOrigin, siteTitle, siteDescription, socialImageAlt, socialMetadata } from "../lib/social-metadata";
import type { CompanyDetail } from "../lib/company-queries";

const company: CompanyDetail = {
  id: 42, name: "테스트회사", industry: null, address: null, snapshotMonth: "2026-08",
  employeeCount: 1000, estimatedAverageAnnualSalary: 60000000, newJoiners: null, departures: null,
  registrationNumber: null, roadAddress: null, lotAddress: null, sourceFileName: "private.csv",
  sourceImportedAt: null, monthlyBilledAmount: null, estimatedAverageMonthlySalary: null
};

test("company previews contain company-specific facts and an estimate caveat, not raw provenance", () => {
  const metadata = companySocialMetadata(company);
  assert.equal(metadata.title, "테스트회사 고용·연봉 정보 | Company Lens");
  assert.match(metadata.description!, /2026년 8월 기준 · 국민연금 가입자 1,000명 · 추정 평균 연봉 6,000만원/);
  assert.match(metadata.description!, /국민연금 기반 추정치/);
  assert.equal(metadata.alternates?.canonical, "/companies/42");
  assert.equal(metadata.openGraph?.url, "/companies/42");
  assert.equal(metadata.twitter?.title, metadata.title);
  assert.ok(!JSON.stringify(metadata).includes("private.csv"));
});

test("missing values are omitted and zero remains valid in previews", () => {
  const missing = companySocialMetadata({ ...company, snapshotMonth: null, employeeCount: null, estimatedAverageAnnualSalary: null });
  assert.ok(!missing.description!.includes("null"));
  assert.ok(!missing.description!.includes("산출 불가"));
  assert.match(companySocialMetadata({ ...company, employeeCount: 0 }).description!, /가입자 0명/);
});

test("home preview uses the fixed public origin and shared image", () => {
  assert.equal(publicOrigin, "https://companylens.ersione.com");
  const metadata = socialMetadata(siteTitle, siteDescription, "/");
  assert.equal(metadata.title, "숫자로 보는 회사 | Company Lens");
  assert.match(metadata.description!, /숫자로 보는 회사/);
  assert.equal(metadata.openGraph?.title, metadata.title);
  assert.equal(metadata.openGraph?.description, metadata.description);
  assert.equal(metadata.twitter?.description, metadata.description);
  assert.equal(metadata.alternates?.canonical, "/");
  assert.deepEqual(metadata.openGraph?.images, [{ url: "/opengraph-image", width: 1200, height: 630, alt: socialImageAlt }]);
});


test("search states are noindex while home and tracking parameters remain indexable", () => {
  for (const params of [{ q: "삼성" }, { q: "a" }, { q: ["삼성", "엘지"] }, { page: "oops" }]) {
    assert.deepEqual(homeMetadata(params).robots, { index: false, follow: true });
  }
  for (const params of [{}, { q: "" }, { utm_source: "share" }]) {
    assert.equal(homeMetadata(params).robots, undefined);
  }
  assert.equal(homeMetadata({ q: "삼성" }).title, "삼성 검색 결과 | Company Lens");
  assert.equal(websiteStructuredData.url, `${publicOrigin}/`);
});
