import type { Queryable } from '../../utils/db.js';
import type { Sport } from '../../utils/schemas.js';

export interface CourtRow {
  id: string;
  tenant_id: string;
  name: string;
  sport: Sport;
  price_per_hour: number;
  open_time: string;
  close_time: string;
  is_active: boolean;
}

const COLUMNS = 'id, tenant_id, name, sport, price_per_hour, open_time, close_time, is_active';

export async function listCourts(
  db: Queryable,
  tenantId: string,
  filter: { sport?: Sport; includeInactive?: boolean },
): Promise<CourtRow[]> {
  const params: unknown[] = [tenantId];
  let sql = `SELECT ${COLUMNS} FROM courts WHERE tenant_id = $1`;
  if (!filter.includeInactive) sql += ' AND is_active';
  if (filter.sport) {
    params.push(filter.sport);
    sql += ` AND sport = $${params.length}`;
  }
  sql += ' ORDER BY sport, name';
  const { rows } = await db.query<CourtRow>(sql, params);
  return rows;
}

export async function findCourt(db: Queryable, tenantId: string, courtId: string): Promise<CourtRow | null> {
  const { rows } = await db.query<CourtRow>(`SELECT ${COLUMNS} FROM courts WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    courtId,
  ]);
  return rows[0] ?? null;
}

export async function insertCourt(
  db: Queryable,
  tenantId: string,
  c: { name: string; sport: Sport; pricePerHour: number; openTime: string; closeTime: string; isActive: boolean },
): Promise<CourtRow> {
  const { rows } = await db.query<CourtRow>(
    `INSERT INTO courts (tenant_id, name, sport, price_per_hour, open_time, close_time, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [tenantId, c.name, c.sport, c.pricePerHour, c.openTime, c.closeTime, c.isActive],
  );
  return rows[0]!;
}

const UPDATABLE: Record<string, string> = {
  name: 'name',
  sport: 'sport',
  pricePerHour: 'price_per_hour',
  openTime: 'open_time',
  closeTime: 'close_time',
  isActive: 'is_active',
};

export async function updateCourt(
  db: Queryable,
  tenantId: string,
  courtId: string,
  patch: Record<string, unknown>,
): Promise<CourtRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [tenantId, courtId];
  for (const [key, value] of Object.entries(patch)) {
    const column = UPDATABLE[key];
    if (!column || value === undefined) continue;
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return findCourt(db, tenantId, courtId);
  const { rows } = await db.query<CourtRow>(
    `UPDATE courts SET ${sets.join(', ')}, updated_at = now()
     WHERE tenant_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}
