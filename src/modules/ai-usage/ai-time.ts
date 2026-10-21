const TZ = 'Europe/Bucharest';

/** Offset (ms) of Europe/Bucharest from UTC at the given instant. */
function tzOffsetMs(at: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(at).map(x => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** UTC instant of 00:00 Europe/Bucharest on the given local calendar date (month 0-based, overflow allowed). */
function localMidnight(year: number, month: number, day: number): Date {
  const naive = Date.UTC(year, month, day);
  let t = naive - tzOffsetMs(new Date(naive));
  t = naive - tzOffsetMs(new Date(t));
  return new Date(t);
}

function localParts(at: Date): { y: number; m: number; d: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(at).map(x => [x.type, Number(x.value)]),
  );
  return { y: p.year, m: p.month - 1, d: p.day };
}

export function startOfDay(at = new Date()): Date {
  const { y, m, d } = localParts(at);
  return localMidnight(y, m, d);
}

export function startOfNextDay(at = new Date()): Date {
  const { y, m, d } = localParts(at);
  return localMidnight(y, m, d + 1);
}

export function startOfMonth(at = new Date()): Date {
  const { y, m } = localParts(at);
  return localMidnight(y, m, 1);
}

export function startOfNextMonth(at = new Date()): Date {
  const { y, m } = localParts(at);
  return localMidnight(y, m + 1, 1);
}
