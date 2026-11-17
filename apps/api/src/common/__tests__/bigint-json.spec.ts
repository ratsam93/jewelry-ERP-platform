import { describe, it, expect } from 'vitest';
import { installBigIntJson } from '../bigint-json';

describe('installBigIntJson', () => {
  installBigIntJson();

  it('serializes BigInt values inside objects and arrays as strings', () => {
    expect(JSON.stringify({ a: 10n, b: [5n], c: { d: 0n } })).toBe(
      '{"a":"10","b":["5"],"c":{"d":"0"}}',
    );
  });

  it('serializes negative and huge values exactly', () => {
    expect(JSON.stringify({ neg: -42n, huge: 2n ** 70n })).toBe(
      `{"neg":"-42","huge":"${(2n ** 70n).toString()}"}`,
    );
    expect(JSON.parse(JSON.stringify({ huge: 2n ** 70n })).huge).toBe('1180591620717411303424');
  });

  it('is idempotent: installing again keeps the same working function', () => {
    const before = BigInt.prototype.toJSON;
    installBigIntJson();
    installBigIntJson();
    expect(BigInt.prototype.toJSON).toBe(before);
    expect(JSON.stringify([7n])).toBe('["7"]');
  });

  it('defines toJSON as non-enumerable and configurable', () => {
    const desc = Object.getOwnPropertyDescriptor(BigInt.prototype, 'toJSON');
    expect(desc).toBeDefined();
    expect(desc!.enumerable).toBe(false);
    expect(desc!.configurable).toBe(true);
  });
});
