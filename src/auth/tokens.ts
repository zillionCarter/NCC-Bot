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
