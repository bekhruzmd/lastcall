# Leftover Bulls

## Inspiration

USF reports that 40% of its students experience food insecurity, while Feed-A-Bull
is only open Monday–Friday from 10 AM–4 PM. At the same time, evening and weekend
club events can leave perfectly good catered food uneaten.

We wanted to close that timing gap without turning it into a race or a charity
posting in a GroupMe. Leftover Bulls makes sharing local, immediate, and fair.

## What it does

Leftover Bulls lets a club officer post leftover food in seconds. Students see
active posts nearby, enter a short lottery, and receive a signed QR ticket if they
win. After the lottery closes, remaining portions are claimed first come, first
served with an atomic server-side portion count.

The officer verifies tickets in the browser with Ed25519, even offline, and marks
a ticket as picked up. The impact board shows a live rescued-meal counter, active
posts, countdowns, recent first-name-only pickups, and a QR for the student feed.

Fair-share weighting reduces the chance for students who have won more recently.
A private grocery-priority setting doubles a profile's weight but is never shown
to other users or on the board.

## How we built it

We used React and TypeScript with Vite, React Router, Supabase, Postgres,
Supabase Realtime, the Ed25519 implementation in `@noble/ed25519`, and
`qrcode` for board and ticket QR rendering.

Agent A built the shared API, mock backend, ticket verification, and database
rules. Agent B built the student feed and ticket flow. Agent C built the officer
posting and verification flow. Agent D built the board, about page, and
documentation.

For local testing, an optional mock backend synchronizes browser tabs through
local storage and BroadcastChannel. It issues signed development tickets and
runs the draw without remote data. Demo mode separately shortens the lottery
window and can be used with either the mock or the deployed Supabase backend.

## Challenges

The main challenge was fair allocation: the app needed to stop first-click wins,
prevent double claims, and keep a portion count exact across simultaneous users.
The answer was a server-owned draw and atomic decrement.

Ticket verification was another challenge. We kept it offline by separating
signature verification from network-dependent pickup updates. The public key
can verify locally, while Supabase remains responsible for status changes.

We also had to keep the board readable at a distance and resilient for hours,
with bounded refreshes and subscription cleanup.

## Accomplishments

We built a complete happy path from a club post through a live student claim,
signed ticket, officer verification, and live impact count.

The impact board uses the same realtime API as the rest of the app and remains
readable on a large landscape screen. It has no AI features, because the product
uses predictable campus rules and cryptographic ticket verification instead.

## What we learned

The fair part of fair-share allocation is not only a random number. Recent wins,
private needs, transparent rules, and atomic data updates all matter.

We also learned that a useful demo should protect the judges and presenters:
seed data, demo timing, a QR to the live feed, and a first-name-only ticker make
the flow visible without exposing sensitive profile information.

## What's next

- Complete two-phone acceptance testing against the deployed Supabase backend.
- Add USF SSO as an identity option.
- Add campus opt-in notifications; saved food preferences are already available.
- Add an officer safety checklist and local donation guidance.
- Expand the board into an anonymized per-club leaderboard.
- Pilot with one club and one campus pantry to measure whether leftover food
  reaches students before it expires.

## AI coding assistant disclosure

We used GitHub Copilot CLI and other coding assistants as development tools for
scaffolding, implementation review, and documentation. People on the team directed,
reviewed, tested, and adjusted the code. The delivered app has no AI or LLM features.
