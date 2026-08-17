export function isEduAuEmail(email: string): boolean {
  return /\.edu\.au$/i.test(email.trim());
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const CODE_DIGITS = 6;
const CODE_CEILING = 10 ** CODE_DIGITS;

/**
 * A zero-padded 6-digit sign-in code.
 *
 * Rejection sampling rather than `% 1000000`: 2^32 is not a multiple of 10^6, so
 * a plain modulo would make the low codes measurably likelier than the high ones.
 */
export function generateCode(): string {
  const limit = Math.floor(0xffffffff / CODE_CEILING) * CODE_CEILING;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return String(value % CODE_CEILING).padStart(CODE_DIGITS, '0');
}

/** Accepts a code as typed, tolerating the spaces and dashes people add. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}
