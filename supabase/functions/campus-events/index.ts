// Edge Function: campus-events
// GET -> { events: FoodEvent[], fetchedAt } — upcoming USF events (next 14 days)
// from BullsConnect that will likely have food. The feeds don't allow browser
// requests (no CORS), so this function fetches and filters them server-side.
// Results are cached in memory for 15 minutes.

import { foodEventsFromIcs, locationsFromMobileFeed, type FoodEvent } from '../_shared/campusEvents.ts';

const ICS_URL = 'https://bullsconnect.usf.edu/ical/usf/ical_usf.ics';
const MOBILE_URL = 'https://bullsconnect.usf.edu/mobile_ws/v17/mobile_events_list?range=0&limit=800';
const TTL_MS = 15 * 60_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

let cache: { at: number; events: FoodEvent[] } | null = null;

async function load(): Promise<FoodEvent[]> {
  const [icsRes, mobileRes] = await Promise.all([
    fetch(ICS_URL, { redirect: 'follow' }),
    fetch(MOBILE_URL).catch(() => null),
  ]);
  if (!icsRes.ok) throw new Error(`calendar feed returned ${icsRes.status}`);
  const events = foodEventsFromIcs(await icsRes.text(), new Date());

  if (mobileRes?.ok) {
    try {
      const locations = locationsFromMobileFeed(await mobileRes.json());
      for (const e of events) {
        if (!e.location && e.eventId) e.location = locations.get(e.eventId) ?? null;
      }
    } catch {
      /* locations are a bonus */
    }
  }
  return events;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), events: await load() };
    return new Response(JSON.stringify({ events: cache.events, fetchedAt: new Date(cache.at).toISOString() }), {
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    // Serve stale data if the feed is down.
    if (cache) {
      return new Response(JSON.stringify({ events: cache.events, fetchedAt: new Date(cache.at).toISOString(), stale: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
