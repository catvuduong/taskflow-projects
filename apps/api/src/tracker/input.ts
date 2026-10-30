import { BadRequestException } from '@nestjs/common';

// Hand-rolled checks keep the API free of validation packages; each helper returns the trimmed or typed value.

export function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new BadRequestException(`${field} must be at most ${max} characters`);
  return trimmed;
}

/** `undefined` stays undefined (not provided); anything else must be a string of at most `max` characters. */
export function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
  if (value.length > max) throw new BadRequestException(`${field} must be at most ${max} characters`);
  return value.trim();
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], field: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) {
    throw new BadRequestException(`${field} must be one of ${options.join(', ')}`);
  }
  return value as T;
}

export function optionalOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  field: string,
): T | undefined {
  return value === undefined ? undefined : oneOf(value, options, field);
}

/** A positive integer id. Required when `nullable` is false. */
export function id(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value;
}

/** Id that may be cleared with null: undefined = not provided, null = unassigned. */
export function optionalNullableId(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return id(value, field);
}

export function optionalPosition(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException('position must be a non-negative integer');
  }
  return value;
}

/** 'YYYY-MM-DD' that is a real calendar date. Undefined = not provided, null or '' = no date. */
export function optionalDay(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date`);
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} must be a real date`);
  }
  return value;
}
