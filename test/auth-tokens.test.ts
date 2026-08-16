import { describe, it, expect } from 'vitest';
import { isEduAuEmail, generateToken } from '../src/auth/tokens';

describe('isEduAuEmail', () => {
  it('accepts addresses ending in .edu.au', () => {
    expect(isEduAuEmail('student@newman.edu.au')).toBe(true);
    expect(isEduAuEmail('STUDENT@NEWMAN.EDU.AU')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isEduAuEmail('student@gmail.com')).toBe(false);
    expect(isEduAuEmail('student@edu.au.evil.com')).toBe(false);
    expect(isEduAuEmail('')).toBe(false);
  });
});

describe('generateToken', () => {
  it('produces distinct 64-char hex strings', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
