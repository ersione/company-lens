import type Database from "better-sqlite3";
import { rebuildCompanyShortSearchIndex } from "./company-short-search";

export function rebuildCompanySearchIndex(sqlite: Database.Database, progress?: (count: number) => void) {
  sqlite.transaction(() => {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS company_search USING fts5(
        normalized_name, name, registration_number,
        content='companies', content_rowid='id', tokenize='trigram', columnsize=0
      );
      CREATE TRIGGER IF NOT EXISTS companies_search_insert AFTER INSERT ON companies BEGIN
        INSERT INTO company_search(rowid, normalized_name, name, registration_number)
          VALUES (new.id, new.normalized_name, new.name, new.registration_number);
      END;
      CREATE TRIGGER IF NOT EXISTS companies_search_delete AFTER DELETE ON companies BEGIN
        INSERT INTO company_search(company_search, rowid, normalized_name, name, registration_number)
          VALUES ('delete', old.id, old.normalized_name, old.name, old.registration_number);
      END;
      CREATE TRIGGER IF NOT EXISTS companies_search_update
        AFTER UPDATE OF normalized_name, name, registration_number ON companies
        WHEN old.normalized_name IS NOT new.normalized_name OR old.name IS NOT new.name
          OR old.registration_number IS NOT new.registration_number BEGIN
        INSERT INTO company_search(company_search, rowid, normalized_name, name, registration_number)
          VALUES ('delete', old.id, old.normalized_name, old.name, old.registration_number);
        INSERT INTO company_search(rowid, normalized_name, name, registration_number)
          VALUES (new.id, new.normalized_name, new.name, new.registration_number);
      END;
      INSERT INTO company_search(company_search) VALUES ('rebuild');
    `);
  }).immediate();
  rebuildCompanyShortSearchIndex(sqlite, progress);
}

export function searchIndexMatch(query: string, registrationQuery: string) {
  const term = registrationQuery || query.trim();
  // FTS trigram phrases require at least three Unicode characters.
  if ([...term].length < 3) return undefined;
  const phrase = `"${term.replaceAll('"', '""')}"`;
  if (registrationQuery) {
    const namePhrase = `"${query.trim().replaceAll('"', '""')}"`;
    return `{normalized_name name} : ${namePhrase} OR registration_number : ${phrase}`;
  }
  return `{normalized_name name} : ${phrase}`;
}
