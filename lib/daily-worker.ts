// Match reporting labels, including inconsistent delimiters, not ordinary company names.
const markers = ["(일용", "[일용", "/일용", "-일용", "_일용", "<일용", "건설일용",
  "일용근로자", "일용인부", "일용직)", "일용직/", "일용직-", "일용직]"];

export function isDailyWorkerWorkplace(name: string) {
  if (!name.includes("일용")) return false;
  const marked = name.replaceAll("（", "(").replaceAll("）", ")").replace(/[ \t\r\n　]/g, "");
  return markers.some((marker) => marked.includes(marker)) || marked.endsWith("일용직");
}

export function dailyWorkerSql(column: string) {
  let marked = `REPLACE(REPLACE(${column}, '（', '('), '）', ')')`;
  for (const whitespace of ["' '", "char(9)", "char(13)", "char(10)", "'　'"]) {
    marked = `REPLACE(${marked},${whitespace},'')`;
  }
  return `(instr(${column},'일용')>0 AND (${markers.map((marker) => `instr(${marked},'${marker}')>0`).join(" OR ")}
    OR substr(${marked},-3)='일용직'))`;
}
