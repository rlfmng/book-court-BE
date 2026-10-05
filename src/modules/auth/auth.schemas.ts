import { z } from 'zod';

export const LoginBody = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

/** A JWT from Neon Auth (GET {NEON_AUTH_URL}/token after signing in). */
export const NeonLoginBody = z.object({ token: z.string().min(20).max(8192) });

export const StaffUser = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(['owner', 'staff']),
});

export const LoginResponse = z.object({
  data: z.object({
    token: z.string(),
    expiresIn: z.string(),
    user: StaffUser,
    tenant: z.object({ slug: z.string(), name: z.string(), timezone: z.string(), currency: z.string() }),
  }),
});

export const MeResponse = z.object({ data: StaffUser });
