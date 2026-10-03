import { describe, expect, it } from 'vitest';
import { generateSlots } from '../src/modules/availability/slots.js';

const base = {
  date: '2026-10-10',
  timeZone: 'Asia/Manila',
  pricePerHour: 400,
  bookings: [],
  now: new Date('2026-10-01T00:00:00Z'), // well before the date
};

const manila = (hhmm: string, date = '2026-10-10') => new Date(`${date}T${hhmm}:00+08:00`);

describe('generateSlots', () => {
  it('builds hourly slots from opening to closing time in the venue timezone', () => {
    const slots = generateSlots({ ...base, openTime: '06:00:00', closeTime: '22:00:00' });
    expect(slots).toHaveLength(16);
    expect(slots[0]).toMatchObject({
      startTime: '06:00',
      endTime: '07:00',
      startsAt: '2026-10-09T22:00:00.000Z', // 06:00 Manila = 22:00 UTC the day before
      status: 'available',
      available: true,
      price: 400,
    });
    expect(slots.at(-1)).toMatchObject({ startTime: '21:00', endTime: '22:00' });
  });

  it('drops a trailing partial hour and supports closing at midnight', () => {
    expect(generateSlots({ ...base, openTime: '06:00', closeTime: '21:30' })).toHaveLength(15);
    const lateNight = generateSlots({ ...base, openTime: '20:00', closeTime: '24:00' });
    expect(lateNight.map((s) => s.startTime)).toEqual(['20:00', '21:00', '22:00', '23:00']);
    expect(lateNight.at(-1)!.endsAt).toBe(manila('00:00', '2026-10-11').toISOString());
  });

  it('marks every slot overlapped by a confirmed booking as booked', () => {
    const slots = generateSlots({
      ...base,
      openTime: '06:00',
      closeTime: '12:00',
      bookings: [{ startsAt: manila('08:00'), endsAt: manila('10:00') }],
    });
    expect(slots.map((s) => `${s.startTime}:${s.status}`)).toEqual([
      '06:00:available',
      '07:00:available',
      '08:00:booked',
      '09:00:booked',
      '10:00:available',
      '11:00:available',
    ]);
  });

  it('treats back-to-back bookings as non-overlapping and partial overlaps as booked', () => {
    const slots = generateSlots({
      ...base,
      openTime: '06:00',
      closeTime: '10:00',
      bookings: [
        { startsAt: manila('05:00'), endsAt: manila('06:00') }, // ends exactly at opening
        { startsAt: manila('08:30'), endsAt: manila('09:00') }, // half-hour overlap
      ],
    });
    expect(slots.map((s) => s.status)).toEqual(['available', 'available', 'booked', 'available']);
  });

  it('marks slots that already started as past', () => {
    const slots = generateSlots({
      ...base,
      openTime: '06:00',
      closeTime: '10:00',
      now: manila('07:30'),
    });
    expect(slots.map((s) => s.status)).toEqual(['past', 'past', 'available', 'available']);
  });
});
