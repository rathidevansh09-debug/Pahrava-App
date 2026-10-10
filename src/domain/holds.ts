import type { DB } from '../data/types';
import { log } from './log';

/**
 * Return expired unpaid holds to Available and log each one.
 * Runs on app load, every 30 seconds, and before every stall action.
 */
export function expireHolds(db: DB, now = Date.now()): number {
  let n = 0;
  for (const h of db.holds) {
    if (h.status === 'active' && h.expiresAt <= now) {
      h.status = 'expired';
      h.updatedAt = now;
      n++;
      log(db, { at: now, kind: 'hold_expired', actor: 'system', exhibitorId: h.exhibitorId, eventId: h.eventId, stallId: h.stallId, data: {} });
    }
  }
  return n;
}
