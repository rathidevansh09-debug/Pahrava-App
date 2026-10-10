# PAHRAVA Event Manager — prototype

Staff dashboard for PAHRAVA Exhibition & Lifestyle: events, a live stall map, holds, an exhibitor directory, a payments ledger and multilingual WhatsApp-style broadcasts. It also includes a simulated WhatsApp booking flow that writes to the same stall data, for client demos.

**Nothing is really sent or charged.** Data lives in the browser's localStorage.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain rules: double-booking, hold expiry, payments, pricing, broadcasts, CSV
npm run build      # type-check + production build into dist/ (static, works from any host)
```

**Settings → Reset demo data** restores the seed data before a demo.

## Seed data

Venues, dates and tariffs are PAHRAVA's real ones. People, businesses and phone numbers (`90000 1xxxx`) are fictional.

| Event | Floors | Pricing rules |
|---|---|---|
| Lakshika Banquets, Nashik — 23–24 Oct 2026 | **Main Hall** (stalls 1–48, drawn from the architect's plan) · **Lower Hall** (L-1 to L-30, grid until there's a drawing) | Red Premium ₹16,000 · Purple 3×2 ₹15,000 · Green 2×2 ₹13,000 · partnership of 2: +₹500 per partner |
| Agrasen Bhavan, Malegaon — 26–27 Oct 2026 | **AC Hall** (AC-1 to AC-26, from plan) · **Outside** (O-1 to O-37, from plan; 29–37 are food stalls) · **Single Tables** (T-1…, added as demand comes in) | AC Premium 3×2 ₹8,000 · AC Normal 2×2 ₹7,000 · Outside 3×2 ₹6,500 · Food ₹3,000 · Single table ₹4,500 · corner stalls +₹500 |

Floor plans are in `src/data/floorplans.ts`, transcribed from Ar. Vinita Agrawal's drawings. Stall numbers are unique per floor; a floor code (L, AC, O, T) is added wherever the floor isn't obvious. Corner stalls in Malegaon are set to the row ends; change them in **Edit layout**.

Two completed past events give exhibitors a history. Two holds expire within a few hours of loading the data.

## Where things are

| Path | What |
|---|---|
| `src/data/types.ts` | Data model (Event, Venue, Floor, StallType, Stall, Exhibitor, Hold, Booking, Payment, CallLog, Template, Broadcast, Visitor, ActivityLog) |
| `src/data/repo.ts` | Persistence boundary (localStorage). Replace with API calls to move to a server. |
| `src/data/store.ts` | `exec()` runs every write against the freshest saved state, so a second tab can't take a stall that was just held. Also sweeps expired holds every 30 seconds. |
| `src/domain/` | Pure business rules, unit-tested in `domain.test.ts` |
| `src/i18n/{en,mr,hi}.ts` | All UI text. `mr` and `hi` are typed against `en`, so a missing key fails the build. |
| `src/data/templates.ts` | The 5 seed WhatsApp templates in 3 languages |

**Stall status is never stored.** It is derived from holds, bookings and payments (`domain/derive.ts`), so the map, ledger, dashboard and WhatsApp demo always agree.

## Plugging in real services later

- **Payments:** `createPaymentLink()` in `src/domain/payments.ts` is the placeholder. Call Razorpay Payment Links there and store the id on `Booking.paymentLinkId`. A webhook then calls `recordPayment()`.
- **WhatsApp:** `sendBroadcast()` in `src/domain/broadcast.ts` currently only logs. Send each rendered message through a WhatsApp Business API provider (BSP) using Meta-approved templates. Only exhibitors with `consent = true` are ever included.
- **Staff logins:** `ActivityLog.actor` is ready to hold a staff user id.

## Before showing to the client

- Have a native speaker review the Marathi and Hindi text in `src/i18n/` and `src/data/templates.ts`.
- The ledger highlights unpaid balances only within *N* days of the event (default 7, editable per event). The Nashik event is currently more than 7 days away, so nothing is highlighted yet.
