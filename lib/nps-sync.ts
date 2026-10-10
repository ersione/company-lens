import fs from "node:fs";
import path from "node:path";
import type { createDb } from "@/db/client";
import { discoverArchive, downloadArchiveFile, type ArchiveFile } from "@/lib/nps-archive";
import { fileChecksum, importNpsCsv } from "@/lib/nps-import";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";
import { pruneRawData } from "@/lib/prune-raw-data";

export async function syncNpsHistory(client: ReturnType<typeof createDb>, options: {
  rawDirectory?: string; manifestPath?: string; dryRun?: boolean; prune?: boolean; limit?: number;
  discover?: typeof discoverArchive; download?: typeof downloadArchiveFile; log?: (message: string) => void;
} = {}) {
  const raw = path.resolve(options.rawDirectory ?? "data/raw");
  const manifestPath = path.resolve(options.manifestPath ?? "data/nps-history-manifest.json");
  const log = options.log ?? console.log;
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) as ArchiveFile[] : [];
  const discovered = await (options.discover ?? discoverArchive)();
  if (!discovered.length) throw new Error("Official source list is empty; nothing changed.");
  const latestPublishedAt = discovered.at(-1)!.publishedAt;
  const manifest = discovered.map((entry) => ({
    // Current releases change history number when a new release is published.
    ...previous.find((old) => old.key === entry.key && old.title === entry.title && old.publishedAt === entry.publishedAt), ...entry
  }));
  const known = client.sqlite.prepare("SELECT snapshot_month AS month FROM source_files WHERE checksum = ?");
  const pending = manifest.filter((entry) => {
    if (!entry.checksum && entry.filePath && (entry.status === "imported" || entry.status === "duplicate")) {
      const legacy = client.sqlite.prepare(`SELECT checksum FROM source_files WHERE file_name = ?
        AND (? IS NULL OR snapshot_month = ?)`).all(path.basename(entry.filePath), entry.snapshotMonth ?? null, entry.snapshotMonth ?? null) as { checksum: string }[];
      if (legacy.length === 1) entry.checksum = legacy[0].checksum;
    }
    const imported = entry.checksum ? known.get(entry.checksum) as { month: string } | undefined : undefined;
    if (imported) { entry.status = entry.status === "imported" ? "imported" : "duplicate"; entry.snapshotMonth = imported.month; delete entry.error; }
    return !imported;
  });
  const save = () => {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
    fs.renameSync(`${manifestPath}.tmp`, manifestPath);
  };
  log(`Discovered ${manifest.length} sources; ${pending.length} pending.`);
  if (options.dryRun) return { discovered: manifest.length, pending: pending.length, imported: 0, duplicates: 0, dryRun: true, latestPublishedAt };
  fs.mkdirSync(raw, { recursive: true });
  const sources = client.sqlite.prepare("SELECT id, file_name AS name, imported_at AS importedAt FROM source_files WHERE published_at IS NULL").all() as { id: number; name: string; importedAt: string }[];
  for (const source of sources) {
    const date = source.name.match(/(\d{4})(\d{2})(\d{2})/)?.slice(1).join("-") ?? source.importedAt.slice(0, 10);
    client.sqlite.prepare("UPDATE source_files SET published_at = ? WHERE id = ?").run(date, source.id);
  }
  const missing = client.sqlite.prepare(`SELECT DISTINCT sf.snapshot_month AS month FROM source_files sf
    WHERE NOT EXISTS (SELECT 1 FROM monthly_statistics m WHERE m.snapshot_month = sf.snapshot_month)`).all() as { month: string }[];
  client.sqlite.transaction(() => { for (const { month } of missing) refreshMonthlyStatistics(client.sqlite, month); }).immediate();
  save();
  let imported = 0, duplicates = 0, failed = 0, processed = 0;
  for (const entry of pending.slice(0, options.limit ?? pending.length)) {
    const disk = fs.statfsSync(raw);
    if (disk.bavail * disk.bsize < 3 * 1024 ** 3) throw new Error("Less than 3 GiB free disk space; stopped safely.");
    log(`Processing ${entry.title}`);
    try {
      Object.assign(entry, await (options.download ?? downloadArchiveFile)(entry, path.join(raw, "archive")));
      save();
      entry.checksum = await fileChecksum(entry.filePath!);
      const existing = known.get(entry.checksum) as { month: string } | undefined;
      if (existing) { entry.status = "duplicate"; entry.snapshotMonth = existing.month; duplicates++; }
      else {
        const result = await importNpsCsv(entry.filePath!, client, (rows) => log(`  ${rows} rows`), { publishedAt: entry.publishedAt });
        entry.status = "imported"; entry.snapshotMonth = result.sourceFile.snapshotMonth; imported++;
        log(`  Imported ${result.rowCount} rows for ${entry.snapshotMonth}`);
      }
      delete entry.error;
      client.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      entry.status = "failed"; entry.error = error instanceof Error ? error.message : String(error); failed++;
      log(`Failed: ${entry.error}`);
    }
    processed++; save();
  }
  if (failed) throw new Error(`${failed} source imports failed; raw files were not pruned. See manifest errors.`);
  if (options.prune && processed < pending.length) throw new Error("Sync incomplete (limit reached); raw files were not pruned.");
  if (options.prune) {
    const newest = client.sqlite.prepare(`SELECT file_name AS name, checksum FROM source_files
      ORDER BY snapshot_month DESC, COALESCE(published_at, '') DESC, id DESC LIMIT 1`).get() as { name: string; checksum: string } | undefined;
    if (!newest) throw new Error("No imported source; raw files were not pruned.");
    const candidates = [path.join(raw, newest.name), path.join(raw, "archive", newest.name),
      ...manifest.filter((entry) => entry.checksum === newest.checksum).map((entry) => entry.filePath ?? "")];
    const keep = candidates.find((file) => file && fs.existsSync(file));
    if (!keep) throw new Error("Latest original is missing; raw files were not pruned.");
    log(JSON.stringify(await pruneRawData(client.sqlite, raw, keep, { apply: true, log })));
  }
  return { discovered: manifest.length, pending: pending.length - processed, imported, duplicates, dryRun: false, latestPublishedAt };
}
