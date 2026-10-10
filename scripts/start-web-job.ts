import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const label = "com.ersione.company-lens-web";
const target = `gui/${process.getuid!()}`;
const directory = path.join(os.homedir(), "Library", "LaunchAgents");
const logs = path.join(root, "data", "logs");
const plist = path.join(directory, `${label}.plist`);

if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
  throw new Error("Run npm run build before starting the web service.");
}
let registered = false;
try {
  execFileSync("/bin/launchctl", ["print", `${target}/${label}`], { stdio: "ignore" });
  registered = true;
} catch (error) {
  if (!(error && typeof error === "object" && "status" in error)) throw error;
}
if (registered) {
  console.log(`Already registered: ${label}. Check launchctl print for status.`);
} else {
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  const temporary = path.join(logs, "web-job.json");
  fs.writeFileSync(temporary, JSON.stringify({
    Label: label,
    WorkingDirectory: root,
    ProgramArguments: [process.execPath, path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "0.0.0.0", "--port", "3100"],
    EnvironmentVariables: {
      PATH: `${path.dirname(process.execPath)}:/opt/local/bin:/usr/bin:/bin`,
      NODE_ENV: "production",
    },
    RunAtLoad: true,
    KeepAlive: true,
    ThrottleInterval: 10,
    ProcessType: "Standard",
    StandardOutPath: path.join(logs, "web.log"),
    StandardErrorPath: path.join(logs, "web-error.log"),
  }));
  try {
    execFileSync("/usr/bin/plutil", ["-convert", "xml1", "-o", plist, temporary]);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  execFileSync("/bin/launchctl", ["bootstrap", target, plist]);
  console.log(`Started ${label} on port 3100. Logs: ${logs}`);
}
