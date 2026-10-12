import type Database from "better-sqlite3";

const asciiLower = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const token = (value: string) => `b${Buffer.from(value).toString("hex")}`;

export function shortSearchTokens(...values: (string | null)[]) {
  const terms = new Set<string>();
  for (const value of new Set(values.map((value) => asciiLower(value ?? "")))) {
    const chars = [...value];
    for (let i = 0; i + 1 < chars.length; i++) terms.add(token(chars[i] + chars[i + 1]));
  }
  return [...terms].join(" ");
}

export function shortSearchMatch(query: string, registration: string) {
  if ([...(registration || query.trim())].length !== 2) return undefined;
  const names = shortSearchTokens(query.trim().toLocaleLowerCase("ko-KR"));
  if (!names) return undefined;
  const nameMatch = `name_terms : (${names.split(" ").join(" AND ")})`;
  return registration ? `${nameMatch} OR registration_terms : ${token(registration)}` : nameMatch;
}

export function hasShortSearchIndex(sqlite: Database.Database) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='company_short_search_state'").get()
    && sqlite.prepare("SELECT 1 FROM company_short_search_state WHERE version=1").get());
}

// Pure SQLite trigger expressions keep future imports correct without connection-local functions.
function tokenSql(values: string[]) {
  return `(WITH RECURSIVE inputs(value) AS (${values.map((value) => `SELECT lower(${value})`).join(" UNION ")}),
    grams(value,pos) AS (SELECT value,1 FROM inputs WHERE length(value)>=2
      UNION ALL SELECT value,pos+1 FROM grams WHERE pos+1<length(value))
    SELECT group_concat(term,' ') FROM (SELECT DISTINCT 'b'||hex(substr(value,pos,2)) AS term FROM grams))`;
}

export function rebuildCompanyShortSearchIndex(sqlite: Database.Database, progress?: (count: number) => void) {
  sqlite.transaction(() => {
    sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS company_short_search USING fts5(
      name_terms,registration_terms,content='',contentless_delete=1,tokenize='unicode61'
    );
    CREATE TABLE IF NOT EXISTS company_short_search_state(version INTEGER PRIMARY KEY);
    DELETE FROM company_short_search_state;
    DELETE FROM company_short_search;
    CREATE TRIGGER IF NOT EXISTS companies_short_search_insert AFTER INSERT ON companies BEGIN
      INSERT INTO company_short_search(rowid,name_terms,registration_terms)
        VALUES(new.id,${tokenSql(["new.normalized_name", "new.name"])},${tokenSql(["new.registration_number"])});
    END;
    CREATE TRIGGER IF NOT EXISTS companies_short_search_delete AFTER DELETE ON companies BEGIN
      DELETE FROM company_short_search WHERE rowid=old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS companies_short_search_update AFTER UPDATE OF normalized_name,name,registration_number ON companies
      WHEN old.normalized_name IS NOT new.normalized_name OR old.name IS NOT new.name
        OR old.registration_number IS NOT new.registration_number BEGIN
      DELETE FROM company_short_search WHERE rowid=old.id;
      INSERT INTO company_short_search(rowid,name_terms,registration_terms)
        VALUES(new.id,${tokenSql(["new.normalized_name", "new.name"])},${tokenSql(["new.registration_number"])});
    END;`);
    const insert = sqlite.prepare("INSERT INTO company_short_search(rowid,name_terms,registration_terms) VALUES(?,?,?)");
    let count = 0;
    let lastId = 0;
    const batch = sqlite.prepare("SELECT id,normalized_name,name,registration_number FROM companies WHERE id>? ORDER BY id LIMIT 10000");
    while (true) {
      const rows = batch.all(lastId) as { id: number; normalized_name: string; name: string; registration_number: string | null }[];
      if (!rows.length) break;
      for (const row of rows) {
        insert.run(row.id, shortSearchTokens(row.normalized_name, row.name), shortSearchTokens(row.registration_number));
        if (++count % 100000 === 0) progress?.(count);
      }
      lastId = rows.at(-1)!.id;
    }
    sqlite.exec("INSERT INTO company_short_search(company_short_search) VALUES('optimize'); INSERT INTO company_short_search_state VALUES(1);");
    progress?.(count);
  }).immediate();
}
