/** Local calendar presentation only; never used for storage or pagination. */
export function chatDayKey(iso: string, local: boolean): string {
  const date = new Date(iso);
  if (!local) return date.toISOString().slice(0, 10);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
export function chatDayLabel(iso: string, local: boolean, now = new Date()): string {
  const key = chatDayKey(iso, local);
  if (local) {
    if (key === chatDayKey(now.toISOString(), true)) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === chatDayKey(yesterday.toISOString(), true)) return "Yesterday";
  }
  return new Intl.DateTimeFormat("en-GB", {day:"numeric", month:"short", year:"numeric", ...(local ? {} : {timeZone:"UTC"})}).format(new Date(iso)) + (local ? "" : " · UTC");
}
