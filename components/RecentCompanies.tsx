"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, History, Trash2, X } from "lucide-react";
import { parseRecentCompanies, recentCompaniesKey, rememberRecentCompany, type RecentCompany } from "@/lib/recent-companies";

const changeEvent = "company-lens:recent-companies-changed";
function read() {
  try { return window.localStorage.getItem(recentCompaniesKey); }
  catch { return null; }
}
function write(items: RecentCompany[]) {
  try {
    if (items.length) window.localStorage.setItem(recentCompaniesKey, JSON.stringify(items));
    else window.localStorage.removeItem(recentCompaniesKey);
    window.dispatchEvent(new Event(changeEvent));
    return true;
  } catch { return false; }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === recentCompaniesKey || event.key === null) notify(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, notify);
  window.addEventListener("pageshow", notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener("pageshow", notify);
  };
}
const serverSnapshot = () => null;

export function RecordCompanyVisit({ id, name }: { id: number; name: string }) {
  useEffect(() => { write(rememberRecentCompany(read(), { id, name })); }, [id, name]);
  return null;
}

export function RecentCompanies() {
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const items = parseRecentCompanies(raw);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (raw !== null) {
      const valid = parseRecentCompanies(raw);
      if (JSON.stringify(valid) !== raw) write(valid);
    }
  }, [raw]);
  if (!items.length) return null;
  const remove = (id?: number) => {
    // Read again so an older tab does not overwrite visits added in another tab.
    setError(!write(id === undefined ? [] : parseRecentCompanies(read()).filter((item) => item.id !== id)));
  };
  return <section className="recent-companies" aria-labelledby="recent-companies-heading">
    <div className="recent-companies-heading">
      <h2 id="recent-companies-heading"><History size={17} aria-hidden="true" />최근 방문 사업장</h2>
      <span>이 브라우저</span>
      <button type="button" onClick={() => remove()} aria-label="최근 방문 사업장 전체 지우기" title="최근 방문 사업장 전체 지우기"><Trash2 size={16} aria-hidden="true" /></button>
    </div>
    <ul>{items.map((company) => <li key={company.id}>
      <Link href={`/companies/${company.id}`} prefetch={false} title={company.name}><Building2 size={17} aria-hidden="true" /><span>{company.name}</span><ArrowUpRight size={15} aria-hidden="true" /></Link>
      <button type="button" onClick={() => remove(company.id)} aria-label={`${company.name} 방문 기록 삭제`} title="방문 기록 삭제"><X size={15} aria-hidden="true" /></button>
    </li>)}</ul>
    {error && <p role="alert">방문 기록을 지우지 못했습니다. 브라우저 저장소 설정을 확인해 주세요.</p>}
  </section>;
}
