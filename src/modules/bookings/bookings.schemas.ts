import { z } from 'zod';
import { DateString, Sport, TimeString } from '../../utils/schemas.js';
import { PHONE_RE } from '../../utils/phone.js';

export const BookingStatus = z.enum(['confirmed', 'cancelled']);
export const BookingSource = z.enum(['online', 'walk_in']);

export const Booking = z.object({
  id: z.uuid(),
  referenceCode: z.string(),
  courtId: z.uuid(),
  courtName: z.string(),
  sport: Sport,
  customerName: z.string(),
  customerPhone: z.string(),
  customerEmail: z.string().nullable(),
  date: z.string().describe('Local date YYYY-MM-DD'),
  startTime: z.string().describe('Local start HH:MM'),
  endTime: z.string().describe('Local end HH:MM'),
  startsAt: z.string(),
  endsAt: z.string(),
  hours: z.number(),
  status: BookingStatus,
  source: BookingSource,
  totalPrice: z.number(),
  currency: z.string(),
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
});
export type Booking = z.infer<typeof Booking>;

export const BookingResponse = z.object({ data: Booking });

const Phone = z.string().trim().regex(PHONE_RE, 'must be a valid phone number');

const SlotFields = {
  courtId: z.uuid(),
  date: DateString,
  startTime: TimeString.describe('Local start time HH:MM, must align with a slot'),
  hours: z.number().int().min(1).max(3).default(1),
};

const CustomerFields = {
  customerName: z.string().trim().min(2).max(100),
  customerPhone: Phone,
};

/** Public booking. Note: no price field — the server computes it. */
export const CreateBookingBody = z.object({
  ...SlotFields,
  ...CustomerFields,
  customerEmail: z.email().trim().max(200),
});
export type CreateBookingBody = z.infer<typeof CreateBookingBody>;

/** Walk-in created by staff: email optional. */
export const CreateWalkInBody = z.object({
  ...SlotFields,
  ...CustomerFields,
  customerEmail: z.email().trim().max(200).optional(),
});
export type CreateWalkInBody = z.infer<typeof CreateWalkInBody>;

export const LookupQuery = z.object({
  reference: z.string().trim().min(4).max(32),
  phone: Phone,
});

export const CancelBody = z
  .object({
    reference: z.string().trim().min(4).max(32).optional(),
    phone: Phone.optional(),
  })
  .nullish()
  .describe('Required for customers (reference + phone). Staff can cancel with a bearer token and no body.');

export const AdminBookingsQuery = z.object({
  date: DateString,
  courtId: z.uuid().optional(),
  status: BookingStatus.optional(),
});

export const BookingListResponse = z.object({
  data: z.array(Booking),
  meta: z.object({ date: z.string(), timezone: z.string(), total: z.number(), confirmed: z.number(), revenue: z.number() }),
});
