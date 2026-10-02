import type { Queryable } from '../../utils/db.js';
import type { Interval } from './slots.js';

/** Confirmed bookings on a court that overlap [from, to). */
export async function findConfirmedIntervals(
  db: Queryable,
  tenantId: string,
  courtId: string,
  from: Date,
  to: Date,
): Promise<Interval[]> {
  const { rows } = await db.query<{ starts_at: Date; ends_at: Date }>(
    `SELECT starts_at, ends_at FROM bookings
     WHERE tenant_id = $1 AND court_id = $2 AND status = 'confirmed'
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3, $4, '[)')
     ORDER BY starts_at`,
    [tenantId, courtId, from, to],
  );
  return rows.map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));
}
