import type { Queryable } from '../../utils/db.js';
import type { Sport } from '../../utils/schemas.js';

export interface BookingRow {
  id: string;
  tenant_id: string;
  court_id: string;
  court_name: string;
  sport: Sport;
  reference_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  starts_at: Date;
  ends_at: Date;
  status: 'confirmed' | 'cancelled';
  source: 'online' | 'walk_in';
  total_price: number;
  created_at: Date;
  cancelled_at: Date | null;
}

const SELECT = `
  SELECT b.id, b.tenant_id, b.court_id, c.name AS court_name, c.sport, b.reference_code,
         b.customer_name, b.customer_phone, b.customer_email, b.starts_at, b.ends_at,
         b.status, b.source, b.total_price, b.created_at, b.cancelled_at
  FROM bookings b JOIN courts c ON c.id = b.court_id AND c.tenant_id = b.tenant_id`;

export interface NewBooking {
  courtId: string;
  referenceCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  startsAt: Date;
  endsAt: Date;
  totalPrice: number;
  source: 'online' | 'walk_in';
}

export async function insertBooking(db: Queryable, tenantId: string, b: NewBooking): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (tenant_id, court_id, reference_code, customer_name, customer_phone, customer_email,
                           starts_at, ends_at, total_price, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      tenantId,
      b.courtId,
      b.referenceCode,
      b.customerName,
      b.customerPhone,
      b.customerEmail,
      b.startsAt,
      b.endsAt,
      b.totalPrice,
      b.source,
    ],
  );
  return rows[0]!.id;
}

export async function findBookingById(db: Queryable, tenantId: string, id: string): Promise<BookingRow | null> {
  const { rows } = await db.query<BookingRow>(`${SELECT} WHERE b.tenant_id = $1 AND b.id = $2`, [tenantId, id]);
  return rows[0] ?? null;
}

export async function findBookingByReference(
  db: Queryable,
  tenantId: string,
  reference: string,
): Promise<BookingRow | null> {
  const { rows } = await db.query<BookingRow>(`${SELECT} WHERE b.tenant_id = $1 AND b.reference_code = $2`, [
    tenantId,
    reference,
  ]);
  return rows[0] ?? null;
}

export async function listBookingsBetween(
  db: Queryable,
  tenantId: string,
  from: Date,
  to: Date,
  filter: { courtId?: string; status?: 'confirmed' | 'cancelled' },
): Promise<BookingRow[]> {
  const params: unknown[] = [tenantId, from, to];
  let sql = `${SELECT} WHERE b.tenant_id = $1 AND b.starts_at >= $2 AND b.starts_at < $3`;
  if (filter.courtId) {
    params.push(filter.courtId);
    sql += ` AND b.court_id = $${params.length}`;
  }
  if (filter.status) {
    params.push(filter.status);
    sql += ` AND b.status = $${params.length}`;
  }
  sql += ' ORDER BY b.starts_at, c.name';
  const { rows } = await db.query<BookingRow>(sql, params);
  return rows;
}

/** Flip a confirmed booking to cancelled. Returns false if it was not confirmed (already cancelled). */
export async function markCancelled(db: Queryable, tenantId: string, id: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
     WHERE tenant_id = $1 AND id = $2 AND status = 'confirmed'`,
    [tenantId, id],
  );
  return (res.rowCount ?? 0) > 0;
}
