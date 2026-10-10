import { apiResponse, searchApi } from "@/lib/company-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiResponse(() => searchApi(request));
}
