import type { Broadcast, BroadcastFilters, DB, Exhibitor, Lang, Template } from '../data/types';
import { uid } from '../lib/id';
import { paidFor } from './derive';
import { fmtRange, interpolate, money } from './format';
import { log } from './log';
import { stallCode } from './stallcode';

export interface Audience {
  included: Exhibitor[];
  excludedNoConsent: Exhibitor[];
}

/** Match filters, then drop anyone without WhatsApp marketing consent. */
export function resolveAudience(db: DB, f: BroadcastFilters): Audience {
  const pastIds = f.pastEventId
    ? new Set(db.bookings.filter((b) => b.eventId === f.pastEventId).map((b) => b.exhibitorId))
    : undefined;
  const matched = db.exhibitors.filter(
    (e) =>
      (!f.categories.length || f.categories.includes(e.category)) &&
      (!f.languages.length || f.languages.includes(e.language)) &&
      (!f.tags.length || f.tags.some((t) => e.tags.includes(t))) &&
      (!pastIds || pastIds.has(e.id)),
  );
  return { included: matched.filter((e) => e.consent), excludedNoConsent: matched.filter((e) => !e.consent) };
}

/** Variables for one recipient. Stall fields come from their booking/hold in the chosen event. */
export function templateVars(db: DB, ex: Exhibitor, eventId: string | undefined, lang: Lang) {
  const event = db.events.find((e) => e.id === eventId);
  const venue = event && db.venues.find((v) => v.id === event.venueId);
  const booking = event && db.bookings.find((b) => b.eventId === event.id && b.exhibitorId === ex.id && b.status === 'active');
  const hold = !booking && event ? db.holds.find((h) => h.eventId === event.id && h.exhibitorId === ex.id && h.status === 'active') : undefined;
  const stallId = booking?.stallId ?? hold?.stallId;
  const stall = stallId ? db.stalls.find((s) => s.id === stallId) : undefined;
  const type = stall && db.stallTypes.find((t) => t.id === stall.typeId);
  const minPrice = event ? Math.min(...db.stallTypes.filter((t) => t.eventId === event.id).map((t) => t.basePrice)) : undefined;
  return {
    name: ex.ownerName.split(' ')[0],
    business: ex.businessName,
    event_name: event?.name ?? '',
    venue: venue ? `${venue.name}, ${venue.city}` : '',
    dates: event ? fmtRange(event.startDate, event.endDate, lang) : '',
    stall_type: type ? `${type.name} (${type.size})` : '—',
    price: booking ? money(booking.total) : type ? money(type.basePrice) : minPrice !== undefined && isFinite(minPrice) ? money(minPrice) : '—',
    stall_number: stall ? stallCode(db, stall) : '—',
    amount_due: booking ? money(booking.total - paidFor(db, booking.id)) : '—',
  };
}

export function renderMessage(db: DB, template: Template, ex: Exhibitor, eventId?: string) {
  const lang = ex.language;
  return { lang, text: interpolate(template.body[lang] || template.body.en, templateVars(db, ex, eventId, lang)) };
}

/** Simulated send: records the broadcast and a timeline entry per recipient. Nothing leaves the app. */
export function sendBroadcast(db: DB, input: { templateId: string; eventId?: string; filters: BroadcastFilters }, now = Date.now()): Broadcast {
  const { included, excludedNoConsent } = resolveAudience(db, input.filters);
  const template = db.templates.find((t) => t.id === input.templateId)!;
  const countsByLang: Record<Lang, number> = { en: 0, mr: 0, hi: 0 };
  for (const ex of included) {
    countsByLang[ex.language]++;
    log(db, { at: now, kind: 'message_sent', actor: 'staff', exhibitorId: ex.id, eventId: input.eventId, data: { template: template.name[ex.language] || template.name.en, lang: ex.language } });
  }
  const b: Broadcast = {
    id: uid('bc'),
    templateId: input.templateId,
    eventId: input.eventId,
    filters: input.filters,
    recipientIds: included.map((e) => e.id),
    excludedCount: excludedNoConsent.length,
    countsByLang,
    createdAt: now,
    updatedAt: now,
  };
  db.broadcasts.push(b);
  return b;
}
