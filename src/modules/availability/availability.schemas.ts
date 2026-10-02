import { z } from 'zod';
import { DateString } from '../../utils/schemas.js';

export const AvailabilityQuery = z.object({ date: DateString });

export const SlotSchema = z.object({
  startsAt: z.string().describe('Slot start, ISO 8601 UTC'),
  endsAt: z.string().describe('Slot end, ISO 8601 UTC'),
  startTime: z.string().describe('Local start time HH:MM'),
  endTime: z.string().describe('Local end time HH:MM'),
  status: z.enum(['available', 'booked', 'past']),
  available: z.boolean(),
  price: z.number(),
});

export const AvailabilityResponse = z.object({
  data: z.object({
    courtId: z.uuid(),
    date: z.string(),
    timezone: z.string(),
    currency: z.string(),
    slots: z.array(SlotSchema),
  }),
});
export type AvailabilityResult = z.infer<typeof AvailabilityResponse>['data'];
