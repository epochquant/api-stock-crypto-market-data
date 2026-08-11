import { type Price, type SymbolId, type VolumeAmount } from '../shared/types';

/**
 * Symbol entity – represents a trading pair on Binance.
 * All fields are readonly to enforce immutability.
 */
export interface Symbol {
  readonly id: SymbolId;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly volumeUsdt: VolumeAmount;
  readonly volumeAsset: VolumeAmount;
  readonly lastPrice: Price;
  readonly priceChangePercent: number;
  readonly count: number;
  readonly bidQty: VolumeAmount;
  readonly askQty: VolumeAmount;
  readonly status: SymbolStatus;
}

export type SymbolStatus = 'TRADING' | 'BREAK' | 'END_OF_DAY' | 'HALT' | 'PRE_DELIVERING';

export function createSymbol(params: {
  id: SymbolId;
  baseAsset: string;
  quoteAsset: string;
  volumeUsdt: VolumeAmount;
  volumeAsset: VolumeAmount;
  lastPrice: Price;
  priceChangePercent: number;
  count: number;
  bidQty: VolumeAmount;
  askQty: VolumeAmount;
  status: SymbolStatus;
}): Symbol {
  return Object.freeze({ ...params });
}
