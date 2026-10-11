import { NextResponse } from "next/server";
import { adminConfigured, adminCookie, adminSessionSeconds, allowAdminAttempt, allowedAdminOrigin, boundedForm, checkAdminCredentials, createAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const origin = allowedAdminOrigin(request);
  if (!origin) return reply("HTTPS 관리자 주소에서 다시 시도해 주세요.", 403);
  if (!adminConfigured()) return reply("관리자 접근이 아직 설정되지 않았습니다.", 503);
  if (!allowAdminAttempt()) {
    const response = reply("시도가 너무 많습니다. 1분 후 다시 시도해 주세요.", 429);
    response.headers.set("Retry-After", "60");
    return response;
  }
  let form: URLSearchParams | null;
  try { form = await boundedForm(request); }
  catch { return reply("입력 내용을 확인해 주세요.", 400); }
  if (!form || form.getAll("username").length !== 1 || form.getAll("password").length !== 1) return reply("입력 내용을 확인해 주세요.", 400);
  if (!checkAdminCredentials(form.get("username") ?? "", form.get("password") ?? "")) return reply("아이디 또는 비밀번호를 확인해 주세요.", 401);
  const response = reply("로그인되었습니다.", 200);
  response.cookies.set(adminCookie, createAdminSession(), {
    httpOnly: true, secure: origin.secure, sameSite: "strict", path: "/admin", maxAge: adminSessionSeconds
  });
  return response;
}
