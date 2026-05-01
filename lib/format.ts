export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("ko-KR").format(value);
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
