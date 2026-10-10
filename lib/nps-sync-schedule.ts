export const syncCalendar = [1, 2, 3, 28, 29, 30, 31].map((Day) => ({ Day, Hour: 4, Minute: 0 }));

export function dueSyncMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const year = value("year"), month = value("month"), day = value("day");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const due = new Date(Date.UTC(year, day === lastDay && value("hour") >= 4 ? month - 1 : month - 2, 1));
  return due.toISOString().slice(0, 7);
}
