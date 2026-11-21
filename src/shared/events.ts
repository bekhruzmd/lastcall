// Upcoming campus events with food, from BullsConnect via the campus-events
// Edge Function (the feeds themselves can't be read from a browser).

import type { FoodEvent } from './types';

const CACHE_KEY = 'lb.foodEvents.v1';

export async function fetchFoodEvents(): Promise<{ events: FoodEvent[]; fetchedAt: string | null }> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return { events: [], fetchedAt: null };
  const res = await fetch(`${base}/functions/v1/campus-events`);
  if (!res.ok) throw new Error(`Events are unavailable right now (${res.status}).`);
  const data = (await res.json()) as { events?: FoodEvent[]; fetchedAt?: string };
  const result = { events: data.events ?? [], fetchedAt: data.fetchedAt ?? null };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    /* optional */
  }
  return result;
}

/** Last successful result, for showing something instantly or offline. */
export function cachedFoodEvents(): { events: FoodEvent[]; fetchedAt: string | null } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
