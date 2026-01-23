import { GraphQLScalarType, Kind } from 'graphql';
import { Decimal } from 'decimal.js';

// DateTime scalar (ISO 8601 string)
export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO 8601 date-time string',
  serialize(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }
    throw new Error('Invalid DateTime value');
  },
  parseValue(value: unknown): Date {
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Invalid DateTime input');
  },
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    throw new Error('Invalid DateTime literal');
  },
});

// BigInt scalar (string representation for safety with large numbers)
export const BigIntScalar = new GraphQLScalarType({
  name: 'BigInt',
  description: 'BigInt represented as string',
  serialize(value: unknown): string {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value instanceof Decimal) {
      return value.toFixed(0);
    }
    // Handle Prisma Decimal (different class than decimal.js Decimal)
    if (value !== null && typeof value === 'object' && 'toFixed' in value && typeof (value as { toFixed: unknown }).toFixed === 'function') {
      return (value as { toFixed: (dp: number) => string }).toFixed(0);
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return value.toString();
    }
    throw new Error('Invalid BigInt value');
  },
  parseValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    throw new Error('Invalid BigInt input');
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return ast.value;
    }
    throw new Error('Invalid BigInt literal');
  },
});

// Decimal scalar (string representation for precision)
export const DecimalScalar = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Decimal number with arbitrary precision, represented as string',
  serialize(value: unknown): string {
    if (value instanceof Decimal) {
      return value.toString();
    }
    // Handle Prisma Decimal (different class than decimal.js Decimal)
    if (value !== null && typeof value === 'object' && 'toFixed' in value && typeof (value as { toFixed: unknown }).toFixed === 'function') {
      return String(value);
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Decimal(value).toString();
    }
    throw new Error('Invalid Decimal value');
  },
  parseValue(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') {
      return new Decimal(value).toString();
    }
    throw new Error('Invalid Decimal input');
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.STRING || ast.kind === Kind.FLOAT || ast.kind === Kind.INT) {
      return new Decimal(ast.value).toString();
    }
    throw new Error('Invalid Decimal literal');
  },
});

// JSON scalar (passthrough)
export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value: unknown): unknown {
    return value;
  },
  parseValue(value: unknown): unknown {
    return value;
  },
  parseLiteral(ast): unknown {
    if (ast.kind === Kind.OBJECT) {
      return ast;
    }
    if (ast.kind === Kind.STRING) {
      return JSON.parse(ast.value);
    }
    throw new Error('Invalid JSON literal');
  },
});
