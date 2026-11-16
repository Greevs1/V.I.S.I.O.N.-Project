/**
 * valuationEngine/decimal.ts — Exact decimal arithmetic for financial calculations.
 * Uses integer-based arithmetic to avoid floating-point errors.
 * No external dependencies. Deterministic and auditable.
 *
 * Strategy: Convert to integer "micros" (1/1,000,000) for internal arithmetic,
 * then round to the required precision on output. This guarantees deterministic
 * results for all addition, subtraction, and multiplication operations.
 */

const PRECISION = 6; // Internal precision: 6 decimal places (micros)
const FACTOR = 10 ** PRECISION;

export class Decimal {
  private readonly _micros: bigint;

  private constructor(micros: bigint) {
    this._micros = micros;
  }

  // ── Factory methods ──────────────────────────────────────────────────

  static fromNumber(value: number): Decimal {
    if (!Number.isFinite(value)) {
      throw new Error('Decimal.fromNumber: value is not finite');
    }
    // Round to avoid floating-point representation errors
    const rounded = Math.round(value * FACTOR);
    return new Decimal(BigInt(rounded));
  }

  static fromString(value: string): Decimal {
    const num = parseFloat(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Decimal.fromString: invalid value "${value}"`);
    }
    return Decimal.fromNumber(num);
  }

  static zero(): Decimal {
    return new Decimal(0n);
  }

  static max(...values: Decimal[]): Decimal {
    if (values.length === 0) return Decimal.zero();
    return values.reduce((max, v) => (v._micros > max._micros ? v : max), values[0]);
  }

  static min(...values: Decimal[]): Decimal {
    if (values.length === 0) return Decimal.zero();
    return values.reduce((min, v) => (v._micros < min._micros ? v : min), values[0]);
  }

  // ── Arithmetic operations ────────────────────────────────────────────

  add(other: Decimal): Decimal {
    return new Decimal(this._micros + other._micros);
  }

  subtract(other: Decimal): Decimal {
    return new Decimal(this._micros - other._micros);
  }

  multiply(other: Decimal): Decimal {
    // (a * b) / FACTOR — but we need to be careful with BigInt overflow
    const result = (this._micros * other._micros) / BigInt(FACTOR);
    return new Decimal(result);
  }

  divide(other: Decimal): Decimal {
    if (other._micros === 0n) {
      throw new Error('Decimal.divide: division by zero');
    }
    // (a * FACTOR) / b — for precision
    const result = (this._micros * BigInt(FACTOR)) / other._micros;
    return new Decimal(result);
  }

  // ── Comparison ───────────────────────────────────────────────────────

  compareTo(other: Decimal): number {
    if (this._micros < other._micros) return -1;
    if (this._micros > other._micros) return 1;
    return 0;
  }

  greaterThan(other: Decimal): boolean {
    return this._micros > other._micros;
  }

  greaterThanOrEqual(other: Decimal): boolean {
    return this._micros >= other._micros;
  }

  lessThan(other: Decimal): boolean {
    return this._micros < other._micros;
  }

  lessThanOrEqual(other: Decimal): boolean {
    return this._micros <= other._micros;
  }

  equals(other: Decimal): boolean {
    return this._micros === other._micros;
  }

  isZero(): boolean {
    return this._micros === 0n;
  }

  isNegative(): boolean {
    return this._micros < 0n;
  }

  isPositive(): boolean {
    return this._micros > 0n;
  }

  // ── Utility ─────────────────────────────────────────────────────────

  abs(): Decimal {
    return new Decimal(this._micros < 0n ? -this._micros : this._micros);
  }

  negate(): Decimal {
    return new Decimal(-this._micros);
  }

  // ── Conversion ───────────────────────────────────────────────────────

  toNumber(): number {
    return Number(this._micros) / FACTOR;
  }

  toString(): string {
    return this.toNumber().toString();
  }

  toFixed(decimalPlaces: number): string {
    return this.toNumber().toFixed(decimalPlaces);
  }

  // Round to a specific number of decimal places
  round(decimalPlaces: number): Decimal {
    const factor = 10 ** decimalPlaces;
    const microsFactor = 10 ** (PRECISION - decimalPlaces);
    const rounded = Math.round(Number(this._micros) / microsFactor) * microsFactor;
    return new Decimal(BigInt(rounded));
  }

  // ── Formatting ───────────────────────────────────────────────────────

  formatCurrency(): string {
    const value = this.toNumber();
    if (Math.abs(value) >= 1_000_000) {
      return '$' + (value / 1_000_000).toFixed(1) + 'M';
    }
    if (Math.abs(value) >= 1_000) {
      return '$' + (value / 1_000).toFixed(0) + 'K';
    }
    return '$' + Math.round(value).toLocaleString();
  }

  formatMultiple(): string {
    return this.toFixed(2) + 'x';
  }

  formatPercentage(): string {
    return (this.toNumber() * 100).toFixed(1) + '%';
  }
}

// ── Helper functions ───────────────────────────────────────────────────

export function money(value: number | string): Decimal {
  if (typeof value === 'string') return Decimal.fromString(value);
  return Decimal.fromNumber(value);
}

export function percentage(value: number): Decimal {
  return Decimal.fromNumber(value);
}

export function multiple(value: number): Decimal {
  return Decimal.fromNumber(value);
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.add(v), Decimal.zero());
}