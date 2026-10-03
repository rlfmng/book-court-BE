import { localDateTime, localTimeLabel, timeToMinutes } from '../../utils/time.js';

export type SlotStatus = 'available' | 'booked' | 'past';

export interface Slot {
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  startTime: string; // local HH:MM
  endTime: string; // local HH:MM
  status: SlotStatus;
  available: boolean;
  price: number;
}

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export interface GenerateSlotsInput {
  date: string; // YYYY-MM-DD, local to timeZone
  openTime: string; // HH:MM[:SS]
  closeTime: string; // HH:MM[:SS], may be 24:00
  timeZone: string;
  pricePerHour: number;
  bookings: Interval[]; // confirmed bookings that may overlap the day
  now?: Date;
  slotMinutes?: number;
}

const overlaps = (a: Interval, b: Interval) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * Pure function: builds the hourly slot grid for one court on one local date.
 * Slots start at opening time and step by `slotMinutes`; a trailing partial slot is dropped.
 * A slot is 'past' once its start time has passed, 'booked' if any confirmed booking overlaps it.
 */
export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const { date, timeZone, pricePerHour, bookings, now = new Date(), slotMinutes = 60 } = input;
  const open = timeToMinutes(input.openTime);
  const close = timeToMinutes(input.closeTime);
  const price = Math.round(pricePerHour * (slotMinutes / 60) * 100) / 100;

  const slots: Slot[] = [];
  for (let m = open; m + slotMinutes <= close; m += slotMinutes) {
    const slot = { startsAt: localDateTime(date, m, timeZone), endsAt: localDateTime(date, m + slotMinutes, timeZone) };
    const status: SlotStatus =
      slot.startsAt <= now ? 'past' : bookings.some((b) => overlaps(b, slot)) ? 'booked' : 'available';
    slots.push({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      startTime: localTimeLabel(slot.startsAt, timeZone),
      endTime: localTimeLabel(slot.endsAt, timeZone),
      status,
      available: status === 'available',
      price,
    });
  }
  return slots;
}
