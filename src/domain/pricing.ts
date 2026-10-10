import type { DB, Stall } from '../data/types';

export interface QuoteInput {
  partners?: number;
  discount?: number;
}

export interface Quote {
  basePrice: number;
  cornerAmt: number;
  partnerAmt: number;
  discount: number;
  total: number;
}

/** total = base (or stall override) + corner surcharge + partners × partner surcharge − discount */
export function quote(db: DB, stall: Stall, input: QuoteInput = {}): Quote {
  const type = db.stallTypes.find((t) => t.id === stall.typeId);
  const event = db.events.find((e) => e.id === stall.eventId);
  const basePrice = stall.priceOverride ?? type?.basePrice ?? 0;
  const cornerAmt = stall.isCorner ? event?.cornerSurcharge ?? 0 : 0;
  const partners = Math.max(1, Math.floor(input.partners ?? 1));
  const partnerAmt = partners > 1 ? partners * (event?.partnerSurcharge ?? 0) : 0;
  const gross = basePrice + cornerAmt + partnerAmt;
  const discount = Math.min(Math.max(0, input.discount ?? 0), gross);
  return { basePrice, cornerAmt, partnerAmt, discount, total: gross - discount };
}

/** List price shown on the map/WhatsApp (no partner surcharge or discount). */
export function listPrice(db: DB, stall: Stall) {
  return quote(db, stall).total;
}
