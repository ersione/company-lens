import { apiResponse, historyApi } from "@/lib/company-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return apiResponse(() => historyApi(request, id));
}
