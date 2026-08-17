/**
 * A small recursive-descent parser for the expressions the model supplies to
 * interactive function plots.
 *
 * These strings arrive from a language model, so `eval` and `new Function` are
 * both off the table — this compiles to a closure over an explicit scope and can
 * evaluate nothing that is not in the grammar below.
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | implicit) unary)*
 *   unary   := ('-' | '+') unary | power
 *   power   := primary ('^' unary)?          -- right associative
 *   primary := number | name | name '(' expr ')' | '(' expr ')'
 *
 * Unary minus sits above `power` rather than below it, so `-2^2` is -(2^2) = -4 as
 * mathematical convention requires, while `2^-1` still parses.
 *
 * Implicit multiplication is accepted because models write `2x`, `3sin(x)` and
 * `2(x+1)` far more often than the explicit form.
 */

export type Scope = Record<string, number>;
export type CompiledExpression = (scope: Scope) => number;

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  // School convention: `log` is base 10, `ln` is natural.
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

/** Own-property lookup, so an inherited name like `constructor` is never callable. */
function lookupFunction(name: string): ((x: number) => number) | undefined {
  const key = name.toLowerCase();
  return Object.hasOwn(FUNCTIONS, key) ? FUNCTIONS[key] : undefined;
}

function lookupConstant(name: string): number | undefined {
  const key = name.toLowerCase();
  return Object.hasOwn(CONSTANTS, key) ? CONSTANTS[key] : undefined;
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

export class ExpressionError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j += 1;
      if (input[j] === '.') {
        j += 1;
        while (j < input.length && input[j] >= '0' && input[j] <= '9') j += 1;
      }
      tokens.push({ kind: 'number', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }

    // A leading '.5' is legal in the wild.
    if (ch === '.' && input[i + 1] >= '0' && input[i + 1] <= '9') {
      let j = i + 1;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j += 1;
      tokens.push({ kind: 'number', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j += 1;
      tokens.push({ kind: 'name', value: input.slice(i, j) });
      i = j;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      // '**' is the same thing as '^' to anyone who has written code.
      if (ch === '*' && input[i + 1] === '*') {
        tokens.push({ kind: 'op', value: '^' });
        i += 2;
        continue;
      }
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }

    throw new ExpressionError(`Unexpected character '${ch}' in expression`);
  }

  return tokens;
}

export function compileExpression(source: string): CompiledExpression {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];

  function startsPrimary(token: Token | undefined): boolean {
    return !!token && (token.kind === 'number' || token.kind === 'name' || token.kind === 'lparen');
  }

  function parseExpression(): CompiledExpression {
    let left = parseTerm();
    for (;;) {
      const token = peek();
      if (token?.kind === 'op' && (token.value === '+' || token.value === '-')) {
        pos += 1;
        const right = parseTerm();
        const op = token.value;
        const lhs = left;
        left = op === '+' ? (s) => lhs(s) + right(s) : (s) => lhs(s) - right(s);
      } else {
        return left;
      }
    }
  }

  function parseTerm(): CompiledExpression {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (token?.kind === 'op' && (token.value === '*' || token.value === '/')) {
        pos += 1;
        const right = parseUnary();
        const lhs = left;
        left = token.value === '*' ? (s) => lhs(s) * right(s) : (s) => lhs(s) / right(s);
      } else if (startsPrimary(token)) {
        // Implicit multiplication: `2x`, `3sin(x)`, `2(x+1)`.
        const right = parseUnary();
        const lhs = left;
        left = (s) => lhs(s) * right(s);
      } else {
        return left;
      }
    }
  }

  function parseUnary(): CompiledExpression {
    const token = peek();
    if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
      pos += 1;
      const operand = parseUnary();
      return token.value === '-' ? (s) => -operand(s) : operand;
    }
    return parsePower();
  }

  function parsePower(): CompiledExpression {
    const base = parsePrimary();
    const token = peek();
    if (token?.kind === 'op' && token.value === '^') {
      pos += 1;
      // Right associative (2^3^2 is 2^(3^2)) and the exponent may be signed (2^-1).
      const exponent = parseUnary();
      return (s) => Math.pow(base(s), exponent(s));
    }
    return base;
  }

  function parsePrimary(): CompiledExpression {
    const token = peek();
    if (!token) throw new ExpressionError('Expression ended unexpectedly');

    if (token.kind === 'number') {
      pos += 1;
      const { value } = token;
      return () => value;
    }

    if (token.kind === 'lparen') {
      pos += 1;
      const inner = parseExpression();
      if (peek()?.kind !== 'rparen') throw new ExpressionError('Missing closing parenthesis');
      pos += 1;
      return inner;
    }

    if (token.kind === 'name') {
      pos += 1;
      const name = token.value;
      const fn = lookupFunction(name);

      if (fn && peek()?.kind === 'lparen') {
        pos += 1;
        const argument = parseExpression();
        if (peek()?.kind !== 'rparen') throw new ExpressionError(`Missing closing parenthesis after ${name}`);
        pos += 1;
        return (s) => fn(argument(s));
      }

      // A bare function name with no argument is a mistake worth naming.
      if (fn) throw new ExpressionError(`${name} needs a value in brackets, e.g. ${name}(x)`);

      return (s) => {
        // Scope wins over the constant table, so a parameter named `e` behaves as
        // the student's slider rather than silently as Euler's number.
        if (Object.hasOwn(s, name)) return s[name];
        const constant = lookupConstant(name);
        if (constant !== undefined) return constant;
        throw new ExpressionError(`Unknown value '${name}'`);
      };
    }

    throw new ExpressionError('Unexpected operator in expression');
  }

  const compiled = parseExpression();
  if (pos !== tokens.length) throw new ExpressionError('Unexpected trailing characters in expression');
  return compiled;
}

/** Every name the expression refers to that is neither a function nor a constant. */
export function freeVariables(source: string): string[] {
  const names = new Set<string>();
  const tokens = tokenize(source);
  tokens.forEach((token, index) => {
    if (token.kind !== 'name') return;
    if (lookupConstant(token.value) !== undefined) return;
    if (lookupFunction(token.value) && tokens[index + 1]?.kind === 'lparen') return;
    names.add(token.value);
  });
  return [...names];
}

/**
 * Compiles once, then samples across the domain. Points that are not finite —
 * asymptotes, roots of negative numbers, division by zero — come back as null so
 * the chart breaks the line there instead of drawing through infinity.
 */
export function samplePoints(
  source: string,
  scope: Scope,
  xMin: number,
  xMax: number,
  steps = 240
): { x: number; y: number | null }[] {
  const compiled = compileExpression(source);
  const span = xMax - xMin;
  const points: { x: number; y: number | null }[] = [];

  for (let i = 0; i <= steps; i++) {
    const x = xMin + (span * i) / steps;
    let y: number | null;
    try {
      const value = compiled({ ...scope, x });
      y = Number.isFinite(value) ? value : null;
    } catch {
      y = null;
    }
    points.push({ x, y });
  }

  return points;
}
