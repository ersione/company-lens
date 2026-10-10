import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const sourceFiles = sqliteTable(
  "source_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    fileName: text("file_name").notNull(),
    snapshotMonth: text("snapshot_month").notNull(),
    checksum: text("checksum").notNull(),
    rowCount: integer("row_count").notNull(),
    importedAt: text("imported_at").notNull(),
    publishedAt: text("published_at")
  },
  (table) => ({
    checksumUnique: uniqueIndex("source_files_checksum_unique").on(table.checksum)
  })
);

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    identityKey: text("identity_key").notNull(),
    registrationNumber: text("registration_number"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    industry: text("industry"),
    address: text("address"),
    roadAddress: text("road_address"),
    lotAddress: text("lot_address"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    latestSnapshotMonth: text("latest_snapshot_month").notNull().default("")
  },
  (table) => ({
    identityUnique: uniqueIndex("companies_identity_key_unique").on(table.identityKey),
    nameOrder: index("companies_name_order_idx").on(table.name, table.id),
    searchCovering: index("companies_search_covering_idx").on(table.normalizedName, table.name, table.registrationNumber)
  })
);

export const companySnapshots = sqliteTable(
  "company_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceFileId: integer("source_file_id")
      .notNull()
      .references(() => sourceFiles.id, { onDelete: "restrict" }),
    snapshotMonth: text("snapshot_month").notNull(),
    subscriptionStatusCode: text("subscription_status_code"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    monthlyBilledAmount: integer("monthly_billed_amount"),
    newJoiners: integer("new_joiners"),
    departures: integer("departures")
  },
  (table) => ({
    latest: index("company_snapshots_latest_idx").on(table.companyId, sql`${table.snapshotMonth} DESC`, sql`${table.id} DESC`),
    source: uniqueIndex("company_snapshots_source_idx").on(table.sourceFileId, table.companyId, table.snapshotMonth),
    month: index("company_snapshots_month_idx").on(sql`${table.snapshotMonth} DESC`)
  })
);

export type Company = typeof companies.$inferSelect;
export const companyLatest = sqliteTable("company_latest", {
  companyId: integer("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  snapshotId: integer("snapshot_id").notNull(),
  sourceFileId: integer("source_file_id").notNull().references(() => sourceFiles.id),
  snapshotMonth: text("snapshot_month").notNull(),
  employeeCount: integer("employee_count"),
  monthlyBilledAmount: integer("monthly_billed_amount"),
  newJoiners: integer("new_joiners"),
  departures: integer("departures")
});
export const companyLatestState = sqliteTable("company_latest_state", {
  id: integer("id").primaryKey(),
  rebuiltAt: text("rebuilt_at").notNull()
});
export type CompanySnapshot = typeof companySnapshots.$inferSelect;
export type SourceFile = typeof sourceFiles.$inferSelect;

export type Distribution = { label: string; workplaceCount: number; subscriberCount: number };
export const companyBenchmarks = sqliteTable("company_benchmarks", {
  companyId: integer("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  snapshotMonth: text("snapshot_month").notNull(),
  sourceFileId: integer("source_file_id").notNull().references(() => sourceFiles.id),
  employeeTopPercent: real("employee_top_percent").notNull(),
  salaryTopPercent: real("salary_top_percent"),
  industryEmployeeTopPercent: real("industry_employee_top_percent"),
  industrySalaryTopPercent: real("industry_salary_top_percent"),
  employeeSampleCount: integer("employee_sample_count").notNull(),
  salarySampleCount: integer("salary_sample_count").notNull(),
  industryEmployeeSampleCount: integer("industry_employee_sample_count").notNull(),
  industrySalarySampleCount: integer("industry_salary_sample_count").notNull()
});
export const monthlyStatistics = sqliteTable("monthly_statistics", {
  snapshotMonth: text("snapshot_month").primaryKey(),
  sourceFileId: integer("source_file_id").notNull().references(() => sourceFiles.id),
  workplaceCount: integer("workplace_count").notNull(),
  activeWorkplaceCount: integer("active_workplace_count").notNull(),
  subscriberCount: integer("subscriber_count").notNull(),
  unknownEmployeeCount: integer("unknown_employee_count").notNull(),
  newJoiners: integer("new_joiners").notNull(),
  departures: integer("departures").notNull(),
  industryDistribution: text("industry_distribution", { mode: "json" }).$type<Distribution[]>().notNull(),
  sizeDistribution: text("size_distribution", { mode: "json" }).$type<Distribution[]>().notNull(),
  generatedAt: text("generated_at").notNull()
});
