import fs from "node:fs";
import path from "node:path";

export const defaultManifestPath = path.join(process.cwd(), "config", "nps-source-manifest.json");
export const defaultRawDir = path.join(process.cwd(), "data", "raw");

export type NpsSource = {
  snapshotMonth: string;
  fileName: string;
  sourcePageUrl: string;
  downloadUrl: string;
  publishedDate?: string;
  publicDataDetailPk?: string;
  publicDataHistSn?: string;
  atchFileId?: string;
  fileDetailSn?: string;
};

type NpsSourceManifest = {
  sources: NpsSource[];
};

export type ManifestOptions = {
  from?: string;
  to?: string;
  manifestPath?: string;
};

export function readManifest(options: ManifestOptions = {}) {
  const manifestPath = path.resolve(options.manifestPath ?? defaultManifestPath);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`NPS source manifest를 찾을 수 없습니다: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as NpsSourceManifest;
  if (!Array.isArray(manifest.sources)) {
    throw new Error("NPS source manifest의 sources 값은 배열이어야 합니다.");
  }

  const sources = manifest.sources
    .map(validateSource)
    .filter((source) => !options.from || source.snapshotMonth >= options.from)
    .filter((source) => !options.to || source.snapshotMonth <= options.to)
    .sort((left, right) => left.snapshotMonth.localeCompare(right.snapshotMonth));

  return {
    manifestPath,
    sources
  };
}

export function sourceFilePath(source: NpsSource, rawDir = defaultRawDir) {
  return path.join(rawDir, source.fileName);
}

export function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function validateSource(source: NpsSource) {
  const required: Array<keyof NpsSource> = ["snapshotMonth", "fileName", "sourcePageUrl", "downloadUrl"];
  for (const key of required) {
    if (!source[key]) {
      throw new Error(`NPS source manifest 항목에 ${key} 값이 없습니다.`);
    }
  }

  if (!/^\d{4}-\d{2}$/.test(source.snapshotMonth)) {
    throw new Error(`snapshotMonth 형식이 올바르지 않습니다: ${source.snapshotMonth}`);
  }

  return source;
}
