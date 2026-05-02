import path from "node:path";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { importNpsCsv } from "@/lib/nps-import";
import { downloadSource } from "./nps-download";
import { defaultRawDir, parseArgs, readManifest, sourceFilePath } from "./nps-manifest";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const rawDir = path.resolve(String(args["raw-dir"] ?? defaultRawDir));
const { manifestPath, sources } = readManifest({
  manifestPath: typeof args.manifest === "string" ? args.manifest : undefined,
  from: typeof args.from === "string" ? args.from : undefined,
  to: typeof args.to === "string" ? args.to : undefined
});

console.log(`Manifest: ${manifestPath}`);
console.log(`Raw dir: ${rawDir}`);
console.log(`Sources: ${sources.length}`);

for (const source of sources) {
  await downloadSource(source, {
    force: Boolean(args.force),
    rawDir
  });
}

const client = createDb();
try {
  migrate(client.sqlite);
  for (const source of sources) {
    const filePath = sourceFilePath(source, rawDir);
    try {
      const result = await importNpsCsv(filePath, client);
      console.log(`IMPORTED ${result.sourceFile.snapshotMonth} ${result.snapshotCount} snapshots`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("이미 가져온 파일입니다:")) {
        console.log(`SKIP import ${source.snapshotMonth} ${source.fileName}`);
        continue;
      }
      throw error;
    }
  }
} finally {
  client.sqlite.close();
}

function printUsage() {
  console.log(`Usage: npm run sync:nps -- [options]

Options:
  --from YYYY-MM        시작 스냅샷 월
  --to YYYY-MM          종료 스냅샷 월
  --force               기존 파일도 다시 다운로드
  --manifest <path>     manifest 경로
  --raw-dir <path>      다운로드 저장 디렉터리
`);
}
