import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { fileChecksum } from "@/lib/nps-import";

export async function pruneRawData(sqlite: Database.Database, directory: string, keep: string,
  options: { apply?: boolean; log?: (message: string) => void } = {}) {
  const root = fs.realpathSync(directory);
  const retained = fs.realpathSync(keep);
  const sourceVersion = sqlite.pragma("data_version", { simple: true });
  if (path.relative(root, retained).startsWith("..")) throw new Error("Retained CSV must be inside the raw directory");
  const latest = sqlite.prepare(`SELECT checksum FROM source_files
    ORDER BY snapshot_month DESC, COALESCE(published_at, '') DESC, id DESC LIMIT 1`).get() as { checksum: string } | undefined;
  if (!latest || await fileChecksum(retained) !== latest.checksum) throw new Error("Retained file is not the latest imported source");
  const known = new Set((sqlite.prepare("SELECT checksum FROM source_files").all() as { checksum: string }[]).map(({ checksum }) => checksum));
  const files: { file: string; size: number; mtimeMs: number; ino: number }[] = [];
  const directories: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) { visit(file); directories.push(file); }
      else if (entry.isFile() && /\.csv(?:\.gz)?$/i.test(file)) {
        const { size, mtimeMs, ino } = fs.statSync(file);
        files.push({ file, size, mtimeMs, ino });
      } else throw new Error(`Unexpected raw entry; nothing deleted: ${file}`);
    }
  };
  visit(root);
  for (const [index, entry] of files.entries()) {
    if (!known.has(await fileChecksum(entry.file))) throw new Error(`Unimported or changed source; nothing deleted: ${entry.file}`);
    if ((index + 1) % 10 === 0 || index + 1 === files.length) options.log?.(`Verified ${index + 1}/${files.length} raw checksums`);
  }
  for (const entry of files) {
    const current = fs.statSync(entry.file);
    if (entry.size !== current.size || entry.mtimeMs !== current.mtimeMs || entry.ino !== current.ino) {
      throw new Error(`File changed during verification; nothing deleted: ${entry.file}`);
    }
  }
  const removals = files.filter(({ file }) => file !== retained);
  if (sqlite.pragma("data_version", { simple: true }) !== sourceVersion) {
    throw new Error("Database changed during verification; nothing deleted");
  }
  if (options.apply) {
    for (const { file } of removals) fs.unlinkSync(file);
    for (const directory of directories) if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
  return { applied: !!options.apply, verifiedFiles: files.length, removedFiles: options.apply ? removals.length : 0,
    removableFiles: removals.length, removableBytes: removals.reduce((sum, { size }) => sum + size, 0), retained };
}
