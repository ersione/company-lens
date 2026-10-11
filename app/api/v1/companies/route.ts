import { searchApi } from "@/lib/company-api";
import { observedApiResponse } from "@/lib/observe-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return observedApiResponse(request, "search", () => searchApi(request));
}
