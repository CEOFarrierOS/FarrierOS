export function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return toLocalDateString(next);
}

export function monthDates(date: string) {
  const selected = new Date(`${date}T12:00:00`);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => toLocalDateString(new Date(year, month, index + 1, 12)));
}

export const TODAY = toLocalDateString();
export const TOMORROW = shiftDate(TODAY, 1);
