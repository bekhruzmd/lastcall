import type { DietTag } from './types';

export const DIET_TAGS: DietTag[] = [
  'vegetarian',
  'vegan',
  'halal',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'contains_nuts',
  'kosher',
];

export const DIET_LABELS: Record<DietTag, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  halal: 'Halal-friendly',
  gluten_free: 'Gluten-Free',
  dairy_free: 'Dairy-Free',
  nut_free: 'Nut-Free',
  contains_nuts: 'Contains nuts',
  kosher: 'Kosher',
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
  'Judy Genshaft Honors College (HON)',
  'Recreation Center (REC)',
  'Patel Center (CGS)',
];

export const DURATIONS_MIN = [15, 30, 60, 120] as const;

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

/** Estimated value of one rescued meal in US dollars, used for "money saved" figures. */
export const MEAL_VALUE_USD = 8;

/** Whole-dollar amount for a number of rescued meals, e.g. 1600 for 200 meals. */
export function mealsToUsd(meals: number): number {
  return Math.round(meals * MEAL_VALUE_USD);
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
