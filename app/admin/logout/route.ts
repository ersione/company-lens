import { NextResponse } from "next/server";
import { adminCookie, allowedAdminOrigin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const origin = allowedAdminOrigin(request);
  if (!origin) return NextResponse.json({ message: "허용되지 않은 요청입니다." }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(adminCookie, "", { httpOnly: true, secure: origin.secure, sameSite: "strict", path: "/admin", maxAge: 0 });
  return response;
}
