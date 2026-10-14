"use client";
import { useRouter } from "next/navigation";

export function StatisticsGroupSelect({ groups, path }: { groups: string[]; path: string }) {
  const router = useRouter();
  return <label className="statistics-group-select">{path === "/industries" ? "업종 선택" : "지역 선택"}
    <select defaultValue="" onChange={(event) => { if (event.target.value) router.push(`${path}/${encodeURIComponent(event.target.value)}`); }}>
      <option value="">전체 목록에서 선택</option>{groups.map((key) => <option key={key} value={key}>{key}</option>)}
    </select></label>;
}
