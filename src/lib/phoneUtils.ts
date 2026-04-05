/**
 * Phone normalization utilities — shared across chat, webhook, and tracking.
 * Single source of truth for phone number comparison.
 */

/** Strip country code prefix, non-digits, and leading zeros */
export function normalizePhone(value?: string | null): string {
  const digits = String(value || "")
    .replace(/^WA-/i, "")
    .replace(/@.*/, "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");

  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
}

/** Check if two phone numbers likely belong to the same person */
export function phonesMatch(first?: string | null, second?: string | null): boolean {
  const left = normalizePhone(first);
  const right = normalizePhone(second);

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.endsWith(right) || right.endsWith(left)) return true;

  const leftLast8 = left.slice(-8);
  const rightLast8 = right.slice(-8);
  return Boolean(leftLast8 && rightLast8 && leftLast8 === rightLast8);
}
