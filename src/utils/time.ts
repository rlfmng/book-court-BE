import { addDays, addHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** 'YYYY-MM-DD' calendar date. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 'HH:MM' (also accepts 'HH:MM:SS' from Postgres). '24:00' is allowed as a closing time. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$|^24:00(:00)?$/;

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date);
}

/** '06:00:00' -> 360 (minutes after midnight). '24:00' -> 1440. */
export function timeToMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** Normalise Postgres TIME ('06:00:00') to API format ('06:00'). */
export function toHHMM(time: string): string {
  return time.slice(0, 5);
}

/** UTC instant of local midnight for `date` in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  return fromZonedTime(`${date}T00:00:00`, timeZone);
}

/**
 * UTC instant for `date` + `minutes` after local midnight in `timeZone`.
 * NOTE: assumes no DST transition within the day — true for Asia/Manila. Revisit for DST tenants.
 */
export function localDateTime(date: string, minutes: number, timeZone: string): Date {
  return new Date(startOfLocalDay(date, timeZone).getTime() + minutes * 60_000);
}

/** Today's calendar date ('YYYY-MM-DD') in `timeZone`. */
export function todayIn(timeZone: string, now = new Date()): string {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
}

/** Shift a 'YYYY-MM-DD' date by n days. */
export function shiftDate(date: string, days: number): string {
  return addDays(new Date(`${date}T00:00:00Z`), days).toISOString().slice(0, 10);
}

/** Local 'HH:mm' label of an instant. */
export function localTimeLabel(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'HH:mm');
}

/** Local 'YYYY-MM-DD' of an instant. */
export function localDate(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'yyyy-MM-dd');
}

export { addHours };
