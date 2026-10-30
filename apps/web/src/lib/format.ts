// Every date is shown in UTC so the screen agrees with the API's UTC day boundaries, whatever the viewer's timezone.

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** 'YYYY-MM-DD' -> 'Oct 30' */
export function formatDay(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

/** ISO timestamp -> 'Oct 30, 14:05 UTC' */
export function formatWhen(iso: string): string {
  return `${WHEN.format(new Date(iso))} UTC`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
