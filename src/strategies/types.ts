export type ArbType = "fx-premium" | "triangular" | "cross-exchange";

export interface Signal {
  type: ArbType;
  /** Net edge in basis points after fees and walk-the-book slippage. */
  edgeBps: number;
  /** TWD notional at which the edge was computed. */
  notionalTwd: number;
  /** Human label e.g. "MAX->Binance", "Cycle A" */
  route: string;
  /** Free-form strategy debug payload, included in JSON log. */
  detail: Record<string, unknown>;
  /** Optional tags like DEPEG_WARNING, ABORTED. */
  tags?: string[];
  ts: number;
}

export type EvaluateFn = (notionalTwd: number) => Promise<Signal[]>;
