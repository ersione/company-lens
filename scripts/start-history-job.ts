import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const label = "com.ersione.company-lens-history";
const directory = path.join(os.homedir(), "Library", "LaunchAgents");
const logs = path.join(root, "data", "logs");
const plist = path.join(directory, `${label}.plist`);
fs.mkdirSync(directory, { recursive: true });
fs.mkdirSync(logs, { recursive: true });
const target = `gui/${process.getuid!()}`;
try {
  execFileSync("/bin/launchctl", ["print", `${target}/${label}`], { stdio: "ignore" });
  throw new Error("History job already registered. Check launchctl print before restarting it.");
} catch (error) {
  if (!(error && typeof error === "object" && "status" in error)) throw error;
}
const temporary = path.join(logs, "history-job.json");
fs.writeFileSync(temporary, JSON.stringify({
  Label: label, WorkingDirectory: root,
  ProgramArguments: [process.execPath, path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "scripts", "sync-nps-history.ts")],
  EnvironmentVariables: { PATH: `${path.dirname(process.execPath)}:/opt/local/bin:/usr/bin:/bin` },
  RunAtLoad: true, KeepAlive: false, ProcessType: "Standard",
  StandardOutPath: path.join(logs, "nps-history.log"), StandardErrorPath: path.join(logs, "nps-history-error.log")
}));
execFileSync("/usr/bin/plutil", ["-convert", "xml1", "-o", plist, temporary]);
fs.rmSync(temporary);
execFileSync("/bin/launchctl", ["bootstrap", target, plist]);
console.log(`Started ${label}. Logs: ${logs}. This is resumable, not a recurring monthly schedule.`);
