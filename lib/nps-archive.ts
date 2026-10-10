import { load } from "cheerio";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { setTimeout as delay } from "node:timers/promises";
import { NPS_SOURCE_URL } from "@/lib/nps-import";

const origin = "https://www.data.go.kr";
export type ArchiveFile = {
  key: string; history: string; title: string; publishedAt: string;
  filePath?: string; downloadUrl?: string; snapshotMonth?: string;
  status?: "imported" | "duplicate" | "failed"; error?: string; checksum?: string;
};

async function request(url: string, fields?: Record<string, string>) {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: fields ? "POST" : "GET",
        body: fields ? new URLSearchParams(fields) : undefined,
        signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return response;
    } catch (error) { failure = error; await delay(1000 * (attempt + 1)); }
  }
  throw failure;
}

export function parseArchiveList(html: string): ArchiveFile[] {
  const $ = load(html);
  return $(".openFileDetailPopup").toArray().map((element) => ({
    key: $(element).attr("data-public-pk")!,
    history: $(element).attr("data-public-detail-sn")!,
    title: $(element).text().trim(),
    publishedAt: $(element).closest("tr").find("td").last().text().trim()
  })).filter((entry) => entry.key && entry.history);
}

export async function discoverArchive() {
  const html = await (await request(NPS_SOURCE_URL)).text();
  const $ = load(html);
  const detail = $("#publicDataDetailPk").val() as string | undefined
    ?? html.match(/const detailPk\s*=\s*"([^"]+)"/)?.[1];
  if (!detail) throw new Error("포털 상세 식별자를 찾지 못했습니다.");
  const list = await (await request(`${origin}/tcs/dss/selectHistAndCsvData.do`, {
    publicDataPk: "15083277", publicDataDetailPk: detail
  })).text();
  const entries = parseArchiveList(list);
  if (!entries.length) throw new Error("과거 파일 목록이 비어 있습니다.");
  // The official list is newest-first, including backfilled legacy files.
  const latestTitle = $("meta[property='og:title']").attr("content") ?? "";
  const published = latestTitle.match(/(\d{4})(\d{2})(\d{2})$/)?.slice(1).join("-");
  if (!published) throw new Error("최신 공개 파일 날짜를 찾지 못했습니다.");
  return [...entries.reverse(), { key: detail, history: "1", title: latestTitle, publishedAt: published }];
}

export async function downloadArchiveFile(entry: ArchiveFile, directory: string) {
  fs.mkdirSync(directory, { recursive: true });
  const tag = entry.title.match(/(\d{8})$/)?.[1]
    ?? entry.title.match(/(\d{4})년\s*(\d{1,2})월/)?.slice(1).map((part) => part.padStart(2, "0")).join("")
    ?? "archive";
  const filename = `nps-${tag}-${crypto.createHash("sha256").update(entry.key + entry.history).digest("hex").slice(0, 8)}.csv.gz`;
  const filePath = path.join(directory, filename);
  if (fs.existsSync(filePath)) return { filePath, downloadUrl: entry.downloadUrl };
  const detailHtml = await (await request(`${origin}/tcs/dss/selectDpkDetailInfo.do`, {
    publicDataDetailPk: entry.key, publicDataHistSn: entry.history
  })).text();
  const $ = load(detailHtml);
  const button = $("a[onclick]").toArray().map((element) => $(element).attr("onclick")!)
    .find((action) => action.includes("fn_fileDataDown") && action.includes("'csv'"));
  const args = button?.match(/'([^']*)'/g)?.map((value) => value.slice(1, -1));
  if (!args || args.length < 5) throw new Error(`CSV 다운로드 항목 없음: ${entry.title}`);
  const url = new URL(`${origin}/cmm/cmm/fileDownload.do`);
  url.search = new URLSearchParams({ atchFileId: args[2], fileDetailSn: args[3], insertDataPrcus: "N" }).toString();
  const temporary = `${filePath}.part`;
  try {
    const response = await request(url.toString());
    if (!response.body) throw new Error("다운로드 응답이 비어 있습니다.");
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createGzip(), fs.createWriteStream(temporary));
    fs.renameSync(temporary, filePath);
  } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  return { filePath, downloadUrl: url.toString() };
}
