import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookingPayload, createFixture, type Fixture } from './helpers.js';

let fx: Fixture;

beforeAll(async () => {
  fx = await createFixture({ price: 450 });
});

afterAll(async () => {
  await fx?.cleanup();
});

const book = (payload: Record<string, unknown>) =>
  fx.app.inject({ method: 'POST', url: '/api/v1/bookings', headers: fx.headers, payload });

const availability = async (date: string) => {
  const res = await fx.app.inject({
    method: 'GET',
    url: `/api/v1/courts/${fx.court.id}/availability?date=${date}`,
    headers: fx.headers,
  });
  expect(res.statusCode).toBe(200);
  return res.json().data.slots as Array<{ startTime: string; status: string }>;
};

const statusAt = async (date: string, time: string) => (await availability(date)).find((s) => s.startTime === time)?.status;

describe('availability', () => {
  it('returns hourly slots for a court and validates the date', async () => {
    const slots = await availability(fx.tomorrow);
    expect(slots).toHaveLength(16);
    expect(slots.every((s) => s.status === 'available')).toBe(true);

    const bad = await fx.app.inject({
      method: 'GET',
      url: `/api/v1/courts/${fx.court.id}/availability?date=2026-02-30`,
      headers: fx.headers,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: expect.any(String) } });
  });

  it('requires a known tenant', async () => {
    const res = await fx.app.inject({ method: 'GET', url: '/api/v1/courts', headers: { 'x-tenant-slug': 'no-such-venue' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('bookings', () => {
  it('creates a booking with a server-computed price and marks the slots as booked', async () => {
    const res = await book(bookingPayload(fx.court.id, fx.tomorrow, '08:00', { hours: 2, totalPrice: 1 }));
    expect(res.statusCode).toBe(201);
    const booking = res.json().data;
    expect(booking).toMatchObject({
      status: 'confirmed',
      startTime: '08:00',
      endTime: '10:00',
      hours: 2,
      totalPrice: 900, // 2h x 450, client-sent totalPrice ignored
      customerPhone: '+639171234567',
      currency: 'PHP',
    });
    expect(booking.referenceCode).toMatch(/^BC-[A-Z2-9]{6}$/);

    // Cache was invalidated: the next read reflects the booking.
    expect(await statusAt(fx.tomorrow, '08:00')).toBe('booked');
    expect(await statusAt(fx.tomorrow, '09:00')).toBe('booked');
    expect(await statusAt(fx.tomorrow, '10:00')).toBe('available');
  });

  it('returns 409 for exactly the same slot booked twice', async () => {
    const first = await book(bookingPayload(fx.court.id, fx.tomorrow, '12:00'));
    expect(first.statusCode).toBe(201);
    const second = await book(bookingPayload(fx.court.id, fx.tomorrow, '12:00'));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: { code: 'SLOT_UNAVAILABLE', message: expect.any(String) } });
  });

  it('allows exactly one of many concurrent requests for the same slot', async () => {
    const attempts = 15;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        book(bookingPayload(fx.court.id, fx.tomorrow, '15:00', { customerName: `Racer ${i}` })),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(attempts - 1);

    const { rows } = await fx.app.db.query(
      `SELECT count(*)::int AS n FROM bookings WHERE court_id = $1 AND status = 'confirmed'
         AND starts_at = (SELECT starts_at FROM bookings WHERE court_id = $1 AND customer_name LIKE 'Racer %' LIMIT 1)`,
      [fx.court.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('rejects an overlapping multi-hour booking at the database level (Redis lock keys differ)', async () => {
    // 17:00 is booked and its Redis lock is already released, so the 16:00-18:00 request acquires its
    // locks fine; only the Postgres exclusion constraint can reject it.
    expect((await book(bookingPayload(fx.court.id, fx.tomorrow, '17:00'))).statusCode).toBe(201);
    const overlap = await book(bookingPayload(fx.court.id, fx.tomorrow, '16:00', { hours: 2 }));
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe('SLOT_UNAVAILABLE');
    expect(await statusAt(fx.tomorrow, '16:00')).toBe('available');
  });

  it('enforces the exclusion constraint even for direct concurrent inserts', async () => {
    const insert = () =>
      fx.app.db.query(
        `INSERT INTO bookings (tenant_id, court_id, reference_code, customer_name, customer_phone, starts_at, ends_at, total_price)
         VALUES ($1, $2, 'BC-' || substr(md5(random()::text), 1, 8), 'Direct', '+639170000000',
                 $3::date + time '19:00' AT TIME ZONE 'Asia/Manila', $3::date + time '20:00' AT TIME ZONE 'Asia/Manila', 450)`,
        [fx.tenant.id, fx.court.id, fx.tomorrow],
      );
    const results = await Promise.allSettled([insert(), insert(), insert()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason.code).toBe('23P01');
    }
  });

  it('rejects slots outside opening hours or not aligned to the hour', async () => {
    for (const startTime of ['05:00', '21:30', '22:00']) {
      const res = await book(bookingPayload(fx.court.id, fx.tomorrow, startTime));
      expect(res.statusCode, startTime).toBe(400);
    }
    const tooLong = await book(bookingPayload(fx.court.id, fx.tomorrow, '20:00', { hours: 3 }));
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.code).toBe('INVALID_SLOT');
  });

  it('lets a customer look up and cancel with reference + phone, freeing the slot', async () => {
    const created = (await book(bookingPayload(fx.court.id, fx.tomorrow, '11:00'))).json().data;
    expect(await statusAt(fx.tomorrow, '11:00')).toBe('booked');

    const lookup = await fx.app.inject({
      method: 'GET',
      url: `/api/v1/bookings/lookup?reference=${created.referenceCode.toLowerCase()}&phone=%2B63%20917%20123%204567`,
      headers: fx.headers,
    });
    expect(lookup.statusCode).toBe(200);

    const wrongPhone = await fx.app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${created.id}/cancel`,
      headers: fx.headers,
      payload: { reference: created.referenceCode, phone: '09990000000' },
    });
    expect(wrongPhone.statusCode).toBe(404);

    const cancel = await fx.app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${created.id}/cancel`,
      headers: fx.headers,
      payload: { reference: created.referenceCode, phone: '09171234567' },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe('cancelled');
    expect(await statusAt(fx.tomorrow, '11:00')).toBe('available');

    // The freed slot can be booked again.
    expect((await book(bookingPayload(fx.court.id, fx.tomorrow, '11:00'))).statusCode).toBe(201);
  });
});

describe('admin', () => {
  it('requires a staff token for admin routes', async () => {
    const res = await fx.app.inject({ method: 'GET', url: `/api/v1/admin/bookings?date=${fx.tomorrow}`, headers: fx.headers });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('lists bookings by date and cancels one, freeing the slot', async () => {
    const auth = { ...fx.headers, authorization: `Bearer ${fx.token}` };
    const walkIn = await fx.app.inject({
      method: 'POST',
      url: '/api/v1/admin/bookings',
      headers: auth,
      payload: { courtId: fx.court.id, date: fx.tomorrow, startTime: '06:00', customerName: 'Walk In', customerPhone: '09180000000' },
    });
    expect(walkIn.statusCode).toBe(201);
    expect(walkIn.json().data).toMatchObject({ source: 'walk_in', customerEmail: null });

    const list = await fx.app.inject({ method: 'GET', url: `/api/v1/admin/bookings?date=${fx.tomorrow}`, headers: auth });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.data.some((b: { id: string }) => b.id === walkIn.json().data.id)).toBe(true);
    expect(body.meta.confirmed).toBeGreaterThan(0);

    const cancel = await fx.app.inject({ method: 'POST', url: `/api/v1/bookings/${walkIn.json().data.id}/cancel`, headers: auth });
    expect(cancel.statusCode).toBe(200);
    expect(await statusAt(fx.tomorrow, '06:00')).toBe('available');
  });

  it('rejects a token issued for another tenant', async () => {
    const other = await createFixture();
    try {
      const res = await other.app.inject({
        method: 'GET',
        url: `/api/v1/admin/bookings?date=${fx.tomorrow}`,
        headers: { ...other.headers, authorization: `Bearer ${fx.token}` },
      });
      expect(res.statusCode).toBe(403);
      // And tenant data is isolated: the other tenant cannot see this tenant's court.
      const court = await other.app.inject({ method: 'GET', url: `/api/v1/courts/${fx.court.id}`, headers: other.headers });
      expect(court.statusCode).toBe(404);
    } finally {
      await other.cleanup();
    }
  });
});
