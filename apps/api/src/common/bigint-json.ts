// ─── BigInt JSON serialization ─────────────────────────────────
// Prisma returns BigInt for money/weight columns (e.g. sellingPricePaise,
// makingCharges). Express serializes REST responses with JSON.stringify, which
// throws "Do not know how to serialize a BigInt". The tRPC transformer already
// emits decimal strings; this gives REST the same wire format.

/**
 * Defines `BigInt.prototype.toJSON` so BigInt values serialize as decimal
 * strings (exact for any magnitude). Idempotent: a second call is a no-op.
 * Non-enumerable so it does not leak into `for...in` over BigInt-keyed objects.
 */
export function installBigIntJson(): void {
  if (Object.prototype.hasOwnProperty.call(BigInt.prototype, 'toJSON')) return;
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function toJSON(this: bigint): string {
      return this.toString();
    },
    configurable: true,
    writable: true,
    enumerable: false,
  });
}
