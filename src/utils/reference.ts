import { randomInt } from 'node:crypto';

// No 0/O/1/I/L to keep codes easy to read out over the phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Human-friendly booking reference, e.g. "BC-7KQ2MX". ~887M combinations; uniqueness is enforced by the DB. */
export function generateReferenceCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `BC-${code}`;
}

export function normalizeReferenceCode(input: string): string {
  return input.trim().toUpperCase();
}
