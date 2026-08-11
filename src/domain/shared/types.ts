/**
 * Branded primitive types used across the domain to avoid
 * primitive obsession and improve type safety.
 */

export type SymbolId = string & { readonly __brand: 'SymbolId' };
export type Price = number & { readonly __brand: 'Price' };
export type VolumeAmount = number & { readonly __brand: 'VolumeAmount' };

export function toSymbolId(value: string): SymbolId {
  if (!value || value.trim().length === 0) {
    throw new Error('SymbolId cannot be empty');
  }
  return value.toUpperCase() as SymbolId;
}

export function toPrice(value: number): Price {
  if (value < 0) throw new Error(`Price must be non-negative, got ${value}`);
  return value as Price;
}

export function toVolumeAmount(value: number): VolumeAmount {
  if (value < 0) throw new Error(`VolumeAmount must be non-negative, got ${value}`);
  return value as VolumeAmount;
}
