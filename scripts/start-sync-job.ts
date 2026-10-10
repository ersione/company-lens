import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { syncCalendar } from "@/lib/nps-sync-schedule";

if (new Intl.DateTimeFormat().resolvedOptions().timeZone !== "Asia/Seoul") {
  throw new Error("This launchd calendar requires the Mac system timezone to be Asia/Seoul.");
}
const root = process.cwd(), label = "com.ersione.company-lens-sync";
const oldLabel = "com.ersione.company-lens-history";
const target = `gui/${process.getuid!()}`;
const directory = path.join(os.homedir(), "Library", "LaunchAgents");
const logs = path.join(root, "data", "logs"), plist = path.join(directory, `${label}.plist`);
const state = (name: string) => {
  try { return execFileSync("/bin/launchctl", ["print", `${target}/${name}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch (error) { if (!(error && typeof error === "object" && "status" in error)) throw error; return undefined; }
};
const current = state(label), old = state(oldLabel);
const config = {
  Label: label, WorkingDirectory: root,
  ProgramArguments: [process.execPath, path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "scripts", "sync-nps-history.ts"), "--scheduled", "--prune"],
  EnvironmentVariables: { PATH: `${path.dirname(process.execPath)}:/opt/local/bin:/usr/bin:/bin`, TZ: "Asia/Seoul" },
  StartCalendarInterval: syncCalendar, RunAtLoad: true, KeepAlive: false, ProcessType: "Background",
  StandardOutPath: path.join(logs, "nps-sync.log"), StandardErrorPath: path.join(logs, "nps-sync-error.log")
};
const same = fs.existsSync(plist) && isDeepStrictEqual(config,
  JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" })));
if (current && same && !old && !fs.existsSync(path.join(directory, `${oldLabel}.plist`))) {
  console.log(`Already registered: ${label}; no restart required.`);
} else {
  if ([current, old].some((value) => value && /\n\s*pid = \d+/.test(value))) {
    throw new Error("A collection job is running; finish it before changing registration.");
  }
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(logs, { recursive: true });
  const temporary = path.join(logs, "sync-job.json");
  fs.writeFileSync(temporary, JSON.stringify(config));
  try {
    execFileSync("/usr/bin/plutil", ["-convert", "xml1", "-o", `${plist}.new`, temporary]);
    execFileSync("/usr/bin/plutil", ["-lint", `${plist}.new`]);
    if (current) execFileSync("/bin/launchctl", ["bootout", `${target}/${label}`]);
    fs.renameSync(`${plist}.new`, plist);
    execFileSync("/bin/launchctl", ["bootstrap", target, plist]);
    if (old) execFileSync("/bin/launchctl", ["bootout", `${target}/${oldLabel}`]);
    const oldPlist = path.join(directory, `${oldLabel}.plist`);
    if (fs.existsSync(oldPlist)) fs.unlinkSync(oldPlist);
  } finally { fs.unlinkSync(temporary); }
  console.log(`Registered ${label}: month-end 04:00 KST, plus login catch-up. Logs: ${logs}`);
}
