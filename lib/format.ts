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

export function formatIndustry(value: string | null | undefined) {
  if (!value || value === "BIZ_NO미존재사업장") {
    return "공공데이터 업종 미분류";
  }

  return value;
}

export function isDataQualityIndustry(value: string | null | undefined) {
  return value === "BIZ_NO미존재사업장";
}
