import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const adminCookie = "company_lens_admin";
export const adminSessionSeconds = 8 * 3600;

function config() {
  const username = process.env.ADMIN_USER_ID;
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.COMPANY_LENS_ADMIN_SESSION_SECRET;
  return username && password && secret && secret.length >= 32 ? { username, password, secret } : null;
}
export const adminConfigured = () => Boolean(config());
const digest = (value: string) => createHash("sha256").update(value).digest();
export function checkAdminCredentials(username: string, password: string) {
  const settings = config();
  if (!settings || username.length > 100 || password.length > 256) return false;
  const userMatches = timingSafeEqual(digest(username), digest(settings.username));
  const passwordMatches = timingSafeEqual(digest(password), digest(settings.password));
  return userMatches && passwordMatches;
}
function signature(payload: string) {
  const settings = config();
  if (!settings) throw new Error("Admin is not configured");
  const key = createHmac("sha256", settings.secret).update(JSON.stringify([settings.username, settings.password])).digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}
export function createAdminSession(now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const payload = `v1.${issued}.${issued + adminSessionSeconds}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${signature(payload)}`;
}
export function validAdminSession(token: string | undefined, now = Date.now()) {
  if (!config() || !token || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !/^\d{10}$/.test(parts[1]) || !/^\d{10}$/.test(parts[2])
    || !/^[a-f0-9]{32}$/.test(parts[3]) || !/^[\w-]{43}$/.test(parts[4])) return false;
  const issued = Number(parts[1]);
  const expires = Number(parts[2]);
  const seconds = Math.floor(now / 1000);
  if (issued > seconds || expires <= seconds || expires - issued !== adminSessionSeconds) return false;
  return timingSafeEqual(Buffer.from(parts[4]), Buffer.from(signature(parts.slice(0, 4).join("."))));
}

// A deliberately small, process-local guard; no IPs, accounts or auth database.
const globalState = globalThis as typeof globalThis & { companyLensAdminAttempts?: { start: number; count: number } };
export function allowAdminAttempt(now = Date.now()) {
  let state = globalState.companyLensAdminAttempts;
  if (!state || now - state.start >= 60000) state = globalState.companyLensAdminAttempts = { start: now, count: 0 };
  return ++state.count <= 20;
}

export function allowedAdminOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === "https://companylens.ersione.com") return { secure: true };
  // Local HTTP is explicitly opt-in; Next can normalize 127.0.0.1 URLs to localhost.
  try {
    const url = new URL(request.url);
    const source = new URL(origin ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    const localEnabled = process.env.COMPANY_LENS_ADMIN_ALLOW_LOCAL_HTTP === "1" || process.env.NODE_ENV === "development";
    if (localEnabled && source.host === (request.headers.get("host") ?? url.host)
      && source.port === url.port && loopback.includes(url.hostname) && loopback.includes(source.hostname)
      && source.protocol === "http:" && url.protocol === "http:") return { secure: false };
  } catch { /* Reject malformed origins. */ }
  return null;
}

export async function boundedForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return null;
  if (Number(request.headers.get("content-length")) > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
