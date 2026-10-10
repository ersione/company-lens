import { getDatabasePath } from "@/db/client";
import { compactDatabase } from "@/lib/compact-database";

const [source = getDatabasePath(), destination = `${source}.compact`] = process.argv.slice(2);
try {
  compactDatabase(source, destination);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
