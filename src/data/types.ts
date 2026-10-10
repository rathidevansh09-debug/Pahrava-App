// Core data model. Every entity carries an id and timestamps so it can later be
// moved to a server-side database (staff logins, WhatsApp BSP, Razorpay, GST)
// without reshaping.

export type Lang = 'en' | 'mr' | 'hi';
export const LANGS: Lang[] = ['en', 'mr', 'hi'];

export type EventStatus = 'planning' | 'booking_open' | 'sold_out' | 'completed';
export const EVENT_STATUSES: EventStatus[] = ['planning', 'booking_open', 'sold_out', 'completed'];

export type StallStatus = 'available' | 'on_hold' | 'booked_unpaid' | 'partly_paid' | 'fully_paid';
export const STALL_STATUSES: StallStatus[] = ['available', 'on_hold', 'booked_unpaid', 'partly_paid', 'fully_paid'];

export type Category = 'fashion' | 'food' | 'jewellery' | 'home_decor' | 'kids' | 'other';
export const CATEGORIES: Category[] = ['fashion', 'food', 'jewellery', 'home_decor', 'kids', 'other'];

export type Source = 'call' | 'whatsapp' | 'walk_in' | 'referral' | 'instagram';
export const SOURCES: Source[] = ['call', 'whatsapp', 'walk_in', 'referral', 'instagram'];

export type PayMode = 'upi' | 'cash' | 'bank' | 'cheque';
export const PAY_MODES: PayMode[] = ['upi', 'cash', 'bank', 'cheque'];

export type CallOutcome = 'interested' | 'not_now' | 'booked' | 'call_back';
export const CALL_OUTCOMES: CallOutcome[] = ['interested', 'not_now', 'booked', 'call_back'];

export type AgeGroup = 'under_18' | '18_25' | '26_35' | '36_50' | '50_plus';
export const AGE_GROUPS: AgeGroup[] = ['under_18', '18_25', '26_35', '36_50', '50_plus'];

/** Built-in tag keys (translated). Staff can add free-text tags in Settings. */
export const DEFAULT_TAGS = [
  'repeat',
  'asked_discount',
  'early_bird',
  'no_show',
  'payment_delay',
  'high_priority',
  'interested_next',
] as const;

export type Actor = 'staff' | 'whatsapp' | 'system';

interface Base {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Venue extends Base {
  name: string;
  city: string;
}

export interface Event extends Base {
  name: string;
  venueId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  status: EventStatus;
  holdHours: number;
  dueWarningDays: number;
  cornerSurcharge: number;
  /** Charged per partner when a stall is shared by 2+ partners. */
  partnerSurcharge: number;
}

/** Architectural floor plan drawn under the stalls. Coordinates are plan units (any scale). */
export interface PlanFeature {
  kind: 'hall' | 'stage' | 'room' | 'stairs' | 'passage' | 'entry' | 'exit' | 'label';
  x: number;
  y: number;
  /** rect kinds */
  w?: number;
  h?: number;
  /** passage end point */
  x2?: number;
  y2?: number;
  /** entry/exit arrow direction */
  dir?: 'up' | 'down' | 'left' | 'right';
  /** translated label key (plan.*) for rooms/labels, e.g. 'trial', 'lobby' */
  label?: string;
  /** free text shown after the label, e.g. "2.67 m" */
  note?: string;
}

export interface FloorPlan {
  /** [minX, minY, width, height] in plan units */
  viewBox: [number, number, number, number];
  features: PlanFeature[];
}

export interface Floor extends Base {
  eventId: string;
  name: string;
  order: number;
  /** Short prefix used when stall numbers repeat across floors, e.g. "O" → "O-5". */
  code?: string;
  /** If set, stalls with a `pos` are drawn on this plan; otherwise a simple row grid. */
  plan?: FloorPlan;
}

export interface PlanRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StallType extends Base {
  eventId: string;
  name: string;
  size: string;
  basePrice: number;
  /** Optional colour swatch, e.g. for "Red Premium". Never used for status. */
  accent?: string;
  note?: string;
}

export interface Stall extends Base {
  eventId: string;
  floorId: string;
  number: string;
  typeId: string;
  row: number;
  col: number;
  isCorner: boolean;
  priceOverride?: number;
  /** Position on the floor plan (plan units). */
  pos?: PlanRect;
}

export interface Exhibitor extends Base {
  ownerName: string;
  businessName: string;
  phone: string;
  altPhone?: string;
  category: Category;
  language: Lang;
  city: string;
  tags: string[];
  source: Source;
  consent: boolean;
  consentDate?: string;
  notes: string;
}

export interface Hold extends Base {
  stallId: string;
  eventId: string;
  exhibitorId: string;
  expiresAt: number;
  status: 'active' | 'converted' | 'expired' | 'released';
  source: Actor;
}

export interface Booking extends Base {
  stallId: string;
  eventId: string;
  exhibitorId: string;
  holdId?: string;
  basePrice: number;
  cornerAmt: number;
  partners: number; // 1 = single exhibitor
  partnerName?: string;
  partnerAmt: number;
  discount: number;
  discountReason?: string;
  total: number;
  status: 'active' | 'cancelled';
  source: Actor;
  /** Reserved for a payment gateway (e.g. Razorpay payment link id). */
  paymentLinkId?: string;
}

export interface Payment extends Base {
  bookingId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  mode: PayMode;
  ref?: string;
  note?: string;
  source: Actor;
}

export interface CallLog extends Base {
  exhibitorId: string;
  eventId?: string;
  outcome: CallOutcome;
  callbackDate?: string;
  note: string;
  done: boolean;
}

export type TemplateKey = 'new_event' | 'early_bird' | 'booking_confirmation' | 'payment_reminder' | 'hold_expiring';

export interface Template extends Base {
  key: TemplateKey | string;
  name: Record<Lang, string>;
  body: Record<Lang, string>;
}

export interface BroadcastFilters {
  categories: Category[];
  tags: string[];
  languages: Lang[];
  pastEventId?: string;
}

export interface Broadcast extends Base {
  templateId: string;
  eventId?: string;
  filters: BroadcastFilters;
  recipientIds: string[];
  excludedCount: number;
  countsByLang: Record<Lang, number>;
}

export interface Visitor extends Base {
  eventId: string;
  name: string;
  phone: string;
  city: string;
  ageGroup: AgeGroup;
  consent: boolean;
}

export type ActivityKind =
  | 'exhibitor_created'
  | 'exhibitor_updated'
  | 'hold_created'
  | 'hold_extended'
  | 'hold_expired'
  | 'hold_released'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_updated'
  | 'payment_recorded'
  | 'payment_link'
  | 'call_logged'
  | 'message_sent'
  | 'stall_added'
  | 'stall_removed';

export interface ActivityLog {
  id: string;
  at: number;
  kind: ActivityKind;
  actor: Actor;
  exhibitorId?: string;
  eventId?: string;
  stallId?: string;
  data: Record<string, string | number | undefined>;
}

export interface Settings {
  defaultHoldHours: number;
  customTags: string[];
}

export interface DB {
  schema: 2;
  rev: number;
  venues: Venue[];
  events: Event[];
  floors: Floor[];
  stallTypes: StallType[];
  stalls: Stall[];
  exhibitors: Exhibitor[];
  holds: Hold[];
  bookings: Booking[];
  payments: Payment[];
  callLogs: CallLog[];
  templates: Template[];
  broadcasts: Broadcast[];
  visitors: Visitor[];
  activity: ActivityLog[];
  settings: Settings;
}
