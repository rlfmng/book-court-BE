/**
 * Normalise Philippine mobile numbers to E.164 (+639XXXXXXXXX) so lookups match however the
 * customer typed it: "0917 123 4567", "+63 917-123-4567", "639171234567" -> "+639171234567".
 * Non-PH numbers are kept as digits with a leading '+'.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  return `+${digits}`;
}

export const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
