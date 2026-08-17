import { describe, it, expect } from 'vitest';
import { compileExpression, freeVariables, samplePoints, ExpressionError } from './mathExpression';

function evaluate(source: string, scope: Record<string, number> = {}): number {
  return compileExpression(source)(scope);
}

describe('compileExpression', () => {
  it('evaluates arithmetic with correct precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('10 - 4 - 3')).toBe(3);
    expect(evaluate('100 / 5 / 2')).toBe(10);
  });

  it('treats exponentiation as right associative', () => {
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('2**3')).toBe(8);
  });

  it('binds unary minus looser than power, as convention requires', () => {
    expect(evaluate('-3 + 5')).toBe(2);
    // -2^2 is -(2^2), not (-2)^2.
    expect(evaluate('-2^2')).toBe(-4);
    expect(evaluate('(-2)^2')).toBe(4);
    // A signed exponent still parses.
    expect(evaluate('2^-1')).toBe(0.5);
    expect(evaluate('--5')).toBe(5);
  });

  it('substitutes x and named coefficients', () => {
    expect(evaluate('a*x^2 + b*x + c', { a: 2, b: 3, c: 1, x: 2 })).toBe(15);
  });

  it('accepts implicit multiplication, which is how people write maths', () => {
    expect(evaluate('2x', { x: 5 })).toBe(10);
    expect(evaluate('2(x+1)', { x: 3 })).toBe(8);
    expect(evaluate('3sin(0)')).toBe(0);
    expect(evaluate('2a', { a: 6 })).toBe(12);
  });

  it('reads adjacent letters as one name, not as a product', () => {
    // `ab` must be a single identifier — a slider can legitimately be called `ab`,
    // and silently reading it as a*b would make that name unusable.
    expect(evaluate('ab', { ab: 12 })).toBe(12);
    expect(() => evaluate('ab', { a: 3, b: 4 })).toThrow(/Unknown value 'ab'/);
  });

  it('supports the functions and constants a school syllabus uses', () => {
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('abs(-3)')).toBe(3);
    expect(evaluate('cos(0)')).toBe(1);
    expect(evaluate('ln(e)')).toBeCloseTo(1);
    // `log` is base 10 and `ln` is natural, matching school convention.
    expect(evaluate('log(1000)')).toBeCloseTo(3);
    expect(evaluate('pi')).toBeCloseTo(Math.PI);
  });

  it('parses decimals, including a leading point', () => {
    expect(evaluate('0.5 + 1.25')).toBe(1.75);
    expect(evaluate('.5 * 4')).toBe(2);
  });

  it('lets a coefficient shadow a constant of the same name', () => {
    // A slider named `e` must behave as the student's slider, not Euler's number.
    expect(evaluate('e', { e: 7 })).toBe(7);
  });

  it('rejects an unknown name at evaluation time', () => {
    expect(() => evaluate('q + 1')).toThrow(ExpressionError);
    expect(() => evaluate('q + 1')).toThrow(/Unknown value 'q'/);
  });

  it('rejects malformed input rather than guessing', () => {
    expect(() => evaluate('2 +')).toThrow(ExpressionError);
    expect(() => evaluate('(2 + 3')).toThrow(/closing parenthesis/);
    expect(() => evaluate('2 + 3)')).toThrow(/trailing/);
    expect(() => evaluate('* 3')).toThrow(ExpressionError);
    expect(() => evaluate('sin')).toThrow(/needs a value in brackets/);
    expect(() => evaluate('2 $ 3')).toThrow(/Unexpected character/);
  });

  it('cannot reach anything outside the grammar', () => {
    // The whole reason this parser exists instead of `new Function`: names resolve
    // only against the supplied scope and a fixed table.
    expect(() => evaluate('constructor')).toThrow(ExpressionError);
    expect(() => evaluate('toString(1)')).toThrow(ExpressionError);
    expect(() => evaluate('globalThis')).toThrow(ExpressionError);
  });
});

describe('freeVariables', () => {
  it('finds coefficients while ignoring x, functions and constants', () => {
    expect(freeVariables('a*x^2 + b*x + c').sort()).toEqual(['a', 'b', 'c', 'x']);
    expect(freeVariables('k*sin(x) + pi').sort()).toEqual(['k', 'x']);
  });

  it('de-duplicates repeated names', () => {
    expect(freeVariables('a*x + a*x')).toEqual(['a', 'x']);
  });
});

describe('samplePoints', () => {
  it('samples across the domain inclusive of both ends', () => {
    const points = samplePoints('x', {}, -2, 2, 4);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ x: -2, y: -2 });
    expect(points[4]).toEqual({ x: 2, y: 2 });
  });

  it('returns null where the function is undefined, so the line breaks', () => {
    const points = samplePoints('1/x', {}, -1, 1, 2);
    // The midpoint is x = 0: joining across an asymptote would draw a lie.
    expect(points[1]).toEqual({ x: 0, y: null });
    expect(points[0].y).toBe(-1);
  });

  it('returns null for complex results rather than NaN', () => {
    const points = samplePoints('sqrt(x)', {}, -4, -1, 3);
    expect(points.every((p) => p.y === null)).toBe(true);
  });

  it('applies the current coefficient values', () => {
    const points = samplePoints('a*x', { a: 3 }, 0, 2, 2);
    expect(points[2]).toEqual({ x: 2, y: 6 });
  });

  it('throws once, at compile time, for a malformed expression', () => {
    expect(() => samplePoints('2 +', {}, 0, 1, 2)).toThrow(ExpressionError);
  });
});
