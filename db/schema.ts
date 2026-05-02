import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    importedAt: text("imported_at").notNull()
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
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    identityUnique: uniqueIndex("companies_identity_key_unique").on(table.identityKey)
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
    employeeCount: integer("employee_count"),
    monthlyBilledAmount: integer("monthly_billed_amount"),
    newJoiners: integer("new_joiners"),
    departures: integer("departures"),
    estimatedAverageMonthlySalary: integer("estimated_average_monthly_salary"),
    estimatedAverageAnnualSalary: integer("estimated_average_annual_salary"),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    companyMonthSourceUnique: uniqueIndex("company_snapshots_company_month_source_unique").on(
      table.companyId,
      table.snapshotMonth,
      table.sourceFileId
    ),
    companyMonthIdIdx: index("company_snapshots_company_month_id_idx").on(table.companyId, table.snapshotMonth, table.id),
    monthEmployeeIdx: index("company_snapshots_month_employee_idx").on(table.snapshotMonth, table.employeeCount)
  })
);

export type Company = typeof companies.$inferSelect;
export type CompanySnapshot = typeof companySnapshots.$inferSelect;
export type SourceFile = typeof sourceFiles.$inferSelect;
