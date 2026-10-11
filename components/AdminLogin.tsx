"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, LogOut } from "lucide-react";

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await fetch("/admin/session", { method: "POST", body: new URLSearchParams({
        username: String(form.get("username") ?? ""), password: String(form.get("password") ?? "")
      }) });
      if (!response.ok) { setError((await response.json()).message); return; }
      router.replace("/admin"); router.refresh();
    } catch { setError("연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setPending(false); }
  }
  return <main className="admin-login-shell"><section className="admin-login-panel">
    <span className="admin-login-icon"><LockKeyhole size={25} aria-hidden="true" /></span>
    <p className="eyebrow">COMPANY LENS ADMIN</p><h1>관리자 로그인</h1>
    <form onSubmit={submit}>
      <label htmlFor="admin-username">아이디</label><input id="admin-username" name="username" autoComplete="username" maxLength={100} required disabled={!configured || pending} />
      <label htmlFor="admin-password">비밀번호</label><div className="admin-password-field">
        <input id="admin-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" maxLength={256} required disabled={!configured || pending} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"} title={visible ? "비밀번호 숨기기" : "비밀번호 표시"}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
      </div>
      {(!configured || error) && <p role="alert">{error || "관리자 접근이 아직 설정되지 않았습니다."}</p>}
      <button className="admin-submit" type="submit" disabled={!configured || pending}>{pending ? <LoaderCircle size={18} className="admin-spin" /> : <LogIn size={18} />}로그인</button>
    </form>
  </section></main>;
}

export function AdminLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <div className="admin-logout"><button type="button" disabled={pending} onClick={async () => {
    setPending(true); setError(false);
    try {
      const response = await fetch("/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/admin"); router.refresh();
    } catch { setError(true); }
    finally { setPending(false); }
  }}><LogOut size={16} />로그아웃</button>{error && <span role="alert">다시 시도해 주세요.</span>}</div>;
}
