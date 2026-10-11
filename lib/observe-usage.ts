import { after } from "next/server";
import { headers } from "next/headers";
import { apiResponse } from "./company-api";
import { recordUsage, skipWebMetrics, type UsageEvent } from "./usage-metrics";

type Scheduler = (callback: () => void) => void;
function schedule(event: UsageEvent, scheduler: Scheduler) {
  if (process.env.METRICS_DISABLED === "1") return;
  try { scheduler(() => recordUsage(event)); }
  catch { /* Metrics must never change a response, including outside a Next request context. */ }
}

export function observedApiResponse(request: Request, operation: UsageEvent["operation"], action: () => unknown, scheduler: Scheduler = after) {
  const start = performance.now();
  let result: unknown;
  const response = apiResponse(() => { result = action(); return result; });
  const event: UsageEvent = { channel: "api", operation, status: response.status, durationMs: performance.now() - start };
  if (operation === "search") {
    const data = result as { query: string; page: number; totalCount: number } | undefined;
    event.search = { query: data?.query ?? "", page: data?.page ?? 1,
      outcome: response.status >= 500 ? "failed" : response.status === 200 ? data?.totalCount ? "matched" : "empty" : "invalid" };
  }
  if (operation === "detail" && response.status === 200) {
    const data = result as { id: number; employeeCount: number | null; snapshotMonth: string | null };
    event.company = { id: data.id, employeeCount: data.employeeCount, snapshotMonth: data.snapshotMonth };
  }
  if (request.headers.get("next-router-prefetch") !== "1") schedule(event, scheduler);
  return response;
}

// Count page handlers, not metadata, nested DB queries, or browser-local visit history.
export function observeWebPage<P, T>(operation: UsageEvent["operation"], render: (props: P, event: UsageEvent) => Promise<T>) {
  return async (props: P): Promise<T> => {
    const requestHeaders = await headers();
    const skip = skipWebMetrics(requestHeaders);
    const start = performance.now();
    const event: UsageEvent = { channel: "web", operation, status: 200, durationMs: 0 };
    try { return await render(props, event); }
    catch (error) {
      const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : "";
      event.status = digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;") ? Number(digest.split(";")[1]) : 500;
      if (digest.startsWith("NEXT_REDIRECT;")) event.status = 307;
      if (event.search && event.status >= 500) event.search.outcome = "failed";
      throw error;
    } finally {
      event.durationMs = performance.now() - start;
      if (!skip) schedule(event, after);
    }
  };
}
