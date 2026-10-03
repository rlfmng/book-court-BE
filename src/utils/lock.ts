import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

// Only delete the lock if we still own it (value matches), atomically.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

export interface Lock {
  release(): Promise<void>;
}

/**
 * Acquire short-lived Redis locks on all `keys` (SET NX PX). All-or-nothing:
 * returns null (after releasing anything it took) if any key is already held.
 *
 * This is a fast-path guard that turns concurrent attempts for the same slot into an
 * immediate 409; the Postgres exclusion constraint remains the source of truth.
 */
export async function acquireLocks(redis: Redis, keys: string[], ttlMs: number): Promise<Lock | null> {
  const token = randomUUID();
  const taken: string[] = [];
  const release = async () => {
    await Promise.all(taken.map((k) => redis.eval(RELEASE_SCRIPT, 1, k, token).catch(() => undefined)));
  };

  for (const key of keys) {
    const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') {
      await release();
      return null;
    }
    taken.push(key);
  }
  return { release };
}
