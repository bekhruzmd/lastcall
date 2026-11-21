import type { DietTag } from './types';

export const DIET_TAGS: DietTag[] = [
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
  'gluten_free',
  'contains_nuts',
];

export const DIET_LABELS: Record<DietTag, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  halal: 'Halal',
  kosher: 'Kosher',
  gluten_free: 'Gluten-free',
  contains_nuts: 'Contains nuts',
};

// Draft list of USF Tampa buildings — to be confirmed (CONTRACT §5).
export const BUILDINGS = [
  'Marshall Student Center (MSC)',
  'Library (LIB)',
  'Engineering Building II (ENB)',
  'Engineering Building III (ENC)',
  'Interdisciplinary Sciences (ISA)',
  'Business (BSN)',
  'Computer Sciences (CIS)',
  'Muma College of Business (MUS)',
  'Behavioral Sciences (BEH)',
  'Chemistry (CHE)',
  'Cooper Hall (CPR)',
  'Education (EDU)',
  'Juniper-Poplar Hall (JPH)',
  'Recreation Center (REC)',
  'Patel Center (CGS)',
];

export const DURATIONS_MIN = [15, 30, 60] as const;

export const LOTTERY_SECONDS = 45;
export const DEMO_LOTTERY_SECONDS = 20;

export function isDemoMode(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    return false;
  }
}

export function lotterySeconds(): number {
  return isDemoMode() ? DEMO_LOTTERY_SECONDS : LOTTERY_SECONDS;
}

/** Ed25519 public key (base64url) for verifying tickets offline. Set after keygen. */
export const TICKET_PUBLIC_KEY: string = import.meta.env.VITE_TICKET_PUBLIC_KEY ?? '';

/** Set VITE_USE_MOCK=1 to run the UI against in-memory mock data (no Supabase). */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK === '1';
