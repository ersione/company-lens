import path from "node:path";
import {
  defaultRawDir,
  parseArgs,
  readManifest
} from "./nps-manifest";
import { downloadSource } from "./nps-download";

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

function printUsage() {
  console.log(`Usage: npm run download:nps -- [options]

Options:
  --from YYYY-MM        시작 스냅샷 월
  --to YYYY-MM          종료 스냅샷 월
  --force               기존 파일도 다시 다운로드
  --manifest <path>     manifest 경로
  --raw-dir <path>      다운로드 저장 디렉터리
`);
}
