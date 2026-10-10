import type { ActivityLog, DB } from '../data/types';
import { uid } from '../lib/id';

export function log(db: DB, entry: Omit<ActivityLog, 'id' | 'at'> & { at?: number }) {
  db.activity.push({ id: uid('act'), at: entry.at ?? Date.now(), ...entry });
}
