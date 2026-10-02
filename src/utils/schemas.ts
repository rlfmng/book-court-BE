import { z } from 'zod';
import { DATE_RE, TIME_RE, isValidDate } from './time.js';

export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export const SPORTS = ['pickleball', 'basketball', 'badminton'] as const;
export const Sport = z.enum(SPORTS);
export type Sport = z.infer<typeof Sport>;

export const DateString = z
  .string()
  .regex(DATE_RE, 'must be a date in YYYY-MM-DD format')
  .refine(isValidDate, 'must be a real calendar date');

export const TimeString = z.string().regex(TIME_RE, 'must be a time in HH:MM format');

export const UuidParam = z.object({ id: z.uuid() });

// Loose: validated headers replace request.headers, so unknown headers (authorization...) must be kept.
export const TenantHeader = z.looseObject({
  'x-tenant-slug': z.string().min(1).describe('Tenant slug, e.g. demo-arena'),
});
