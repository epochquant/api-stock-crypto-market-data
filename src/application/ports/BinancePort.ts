import { type Symbol } from '../../domain/symbol/Symbol';

/**
 * Input port for the Binance data source.
 * Defines the operations the application layer needs from Binance;
 * the concrete HTTP adapter lives in infrastructure.
 */
export interface BinancePort {
  getActiveSymbols(): Promise<Symbol[]>;
  getExchangeInfo(): Promise<unknown>;
  getTickers24hr(): Promise<unknown[]>;
  getBookTickers(): Promise<unknown[]>;
  getKlines(
    symbols: string[],
    interval: string,
    limit?: number,
    startTime?: number,
    endTime?: number,
  ): Promise<Map<string, unknown[][]>>;
  getBalances(): Promise<unknown[]>;
  getMyTrades(symbol: string): Promise<unknown[]>;
  getOpenOrders(): Promise<unknown[]>;
  getOrderBook(symbol: string, limit?: number): Promise<unknown>;
  getTickerPrices(symbol?: string): Promise<unknown[] | unknown>;
  cancelOrder(symbol: string, orderId: number | string): Promise<unknown>;
  createMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number): Promise<unknown>;
  getPremiumIndex(symbol: string): Promise<unknown>;
  getOpenInterest(symbol: string): Promise<unknown>;
  getTicker24hr(symbol: string): Promise<unknown>;
}
