import { historyApi } from "@/lib/company-api";
import { observedApiResponse } from "@/lib/observe-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return observedApiResponse(request, "history", () => historyApi(request, id));
}
