import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";

const client = createDb();

try {
  migrate(client.sqlite);
  const count = client.sqlite.prepare("SELECT COUNT(*) AS count FROM companies").get() as { count: number };
  console.log(`Rebuilding company search index for ${count.count.toLocaleString("ko-KR")} companies...`);

  client.sqlite.transaction(() => {
    client.sqlite.prepare("DELETE FROM company_search_fts").run();
    client.sqlite
      .prepare(
        `
        INSERT INTO company_search_fts (
          rowid,
          name,
          normalized_name
        )
        SELECT
          id,
          name,
          normalized_name
        FROM companies
      `
      )
      .run();
  })();

  console.log("Company search index rebuilt.");
} finally {
  client.sqlite.close();
}
