# Project memory

## Product intent & audience

- Adult classifieds / pay-per-lead platform ("Sutil.Intimates") for escort advertiser profiles.
- Mobile-first; primary users are mobile visitors browsing profiles and advertisers managing their listings.
- Admin/CEO accesses a hidden admin panel via a specific login (311519@gmail.com / "HPL") entered in the advertiser login area — not a separate login screen, not a public profile.

## Brand personality & voice

- Direct, discreet, pragmatic. No unnecessary internal-mechanic disclosures to end users.
- Language: Portuguese (pt-BR) for user-facing strings.

## Visual design & UX direction

- Stack: Next.js (App Router, TS), Tailwind CSS, shadcn/ui, lucide-react, Supabase.
- Profile modal: image sits in a bounded container at the top of scrollable content; scrolls naturally with the page (no fixed/overlay image). Image remains prominent but doesn't block reading other fields.
- Cards on feed; clicking opens full profile modal.
- Responsive, mobile-first layout.

## Decisions, constraints & rationale

- No "24h recharge / cost-per-click" messaging shown to end users — internal billing mechanics only, to avoid confusion.
- View counting: only counts after visitor stays 5 seconds on a profile, and deduplicates per device/visitor within 1 hour. Prevents inflation from quick re-entries.
- Admin account must never appear in the public feed; it has no public profile.
- Admin panel shows: total paid contact clicks, total transferred to Asaas (credited revenue), total existing profiles, plus a hide/unhide-profile control (equivalent to advertiser's pause). Keep additions minimal and strategically useful.
- Admin login is a "secret passage" through the standard advertiser login form — not a separate admin login route.
- Asaas used as payment/credit backend.
- Anti-spam click protection in place (server-side).

## Open questions & assumptions

- Exact device identifier used for view deduplication (assumed per-device/per-session) — confirm.
- Whether 5-second view delay and 1-hour dedup are enforced server-side in `record_profile_view` or client-side — assumed server-side via Supabase function; verify.
- Admin email/password is hardcoded in current flow; consider env-based config for production.
- No mention of role/RLS policy details for admin — assumed handled in Supabase.