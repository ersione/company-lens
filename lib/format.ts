export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatIndustry(value: string | null | undefined) {
  return !value || value === "BIZ_NO미존재사업장" ? "업종 정보 없음" : value;
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "산출 불가";
  }
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(value / 10000))}만원`;
}

export function formatSnapshotMonth(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}
