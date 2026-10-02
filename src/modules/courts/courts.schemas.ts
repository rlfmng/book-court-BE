import { z } from 'zod';
import { Sport, TimeString } from '../../utils/schemas.js';
import { timeToMinutes } from '../../utils/time.js';

export const Court = z.object({
  id: z.uuid(),
  name: z.string(),
  sport: Sport,
  pricePerHour: z.number(),
  currency: z.string(),
  openTime: z.string().describe('Local opening time, HH:MM'),
  closeTime: z.string().describe('Local closing time, HH:MM'),
  isActive: z.boolean(),
});
export type Court = z.infer<typeof Court>;

export const CourtListQuery = z.object({
  sport: Sport.optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true')
    .describe('Admin only: also return inactive courts'),
});

const hoursValid = (v: { openTime?: string; closeTime?: string }) =>
  !v.openTime || !v.closeTime || timeToMinutes(v.closeTime) - timeToMinutes(v.openTime) >= 60;
const hoursMessage = { message: 'closeTime must be at least 1 hour after openTime', path: ['closeTime'] };

const CourtFields = {
  name: z.string().trim().min(2).max(80),
  sport: Sport,
  pricePerHour: z.number().min(0).max(100_000).multipleOf(0.01),
  openTime: TimeString,
  closeTime: TimeString,
  isActive: z.boolean(),
};

export const CreateCourtBody = z
  .object({ ...CourtFields, isActive: CourtFields.isActive.default(true) })
  .refine(hoursValid, hoursMessage);
export type CreateCourtBody = z.infer<typeof CreateCourtBody>;

export const UpdateCourtBody = z
  .object(CourtFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
  .refine(hoursValid, hoursMessage);
export type UpdateCourtBody = z.infer<typeof UpdateCourtBody>;
