import fs from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { defaultRawDir, sourceFilePath, type NpsSource } from "./nps-manifest";

type DownloadOptions = {
  force?: boolean;
  rawDir?: string;
};

export async function downloadSource(source: NpsSource, options: DownloadOptions = {}) {
  const rawDir = path.resolve(options.rawDir ?? defaultRawDir);
  const outputPath = sourceFilePath(source, rawDir);
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (!options.force && fs.existsSync(outputPath)) {
    const fileStat = await stat(outputPath);
    console.log(`SKIP ${source.snapshotMonth} ${source.fileName} (${formatBytes(fileStat.size)})`);
    return outputPath;
  }

  const tempPath = `${outputPath}.tmp`;
  console.log(`GET  ${source.snapshotMonth} ${source.fileName}`);

  const response = await fetch(source.downloadUrl);
  if (!response.ok || !response.body) {
    throw new Error(`다운로드 실패: ${source.snapshotMonth} ${response.status} ${response.statusText}`);
  }

  const responseBody = response.body as unknown as NodeReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(responseBody), fs.createWriteStream(tempPath));
  await fs.promises.rename(tempPath, outputPath);

  const fileStat = await stat(outputPath);
  console.log(`DONE ${source.snapshotMonth} ${source.fileName} (${formatBytes(fileStat.size)})`);
  return outputPath;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
