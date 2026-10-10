export type ErrorCode =
  | 'taken'
  | 'already_yours'
  | 'not_found'
  | 'not_held'
  | 'no_booking'
  | 'invalid_amount'
  | 'exceeds_due'
  | 'has_claims'
  | 'duplicate_number'
  | 'duplicate_phone'
  | 'invalid_phone'
  | 'event_closed';

export interface Claim {
  kind: 'hold' | 'booking';
  exhibitorId: string;
  until?: number;
}

export type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: ErrorCode; claim?: Claim };

export const fail = (error: ErrorCode, claim?: Claim): { ok: false; error: ErrorCode; claim?: Claim } => ({ ok: false, error, claim });
