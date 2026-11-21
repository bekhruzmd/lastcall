// Types mirror the Postgres schema in CONTRACT.md §4.

export type DietTag =
  | 'vegetarian'
  | 'vegan'
  | 'halal'
  | 'kosher'
  | 'gluten_free'
  | 'contains_nuts'
  | 'dairy_free'
  | 'nut_free';

export type PostStatus = 'lottery' | 'open' | 'closed' | 'expired' | 'archived';

export type ClaimStatus = 'pending' | 'won' | 'lost' | 'picked_up' | 'expired';

export interface Profile {
  device_id: string;
  display_name: string;
  diet_prefs: DietTag[];
  /** Private. Only ever present on the user's own profile. */
  priority?: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  org_name: string;
  title: string;
  building: string;
  room: string;
  portions_total: number;
  portions_left: number;
  estimated_servings?: number;
  diet_tags: DietTag[];
  dietary_tags?: DietTag[];
  allergens?: string[];
  photo_url: string | null;
  /** SHA-256 of the posting device's id (the raw id is never public). */
  poster_hash: string;
  created_at: string;
  lottery_ends_at: string;
  expires_at: string;
  status: PostStatus;
  on_the_way_count?: number;
  gone_reports?: number;
  is_catered?: boolean;
}

export interface Claim {
  id: string;
  post_id: string;
  device_id: string;
  display_name: string;
  status: ClaimStatus;
  ticket_code: string | null;
  ticket_sig: string | null;
  created_at: string;
  picked_up_at: string | null;
  /** `LB1.<payload>.<sig>` — present on getClaim() when won and signed. */
  qr?: string;
}

export interface NewPostInput {
  org_name: string;
  title: string;
  building: string;
  room: string;
  portions_total: number;
  diet_tags: DietTag[];
  duration_min: 15 | 30 | 60 | 120;
  photo_url?: string | null;
  allergens?: string[];
  is_catered?: boolean;
}

export type ClaimResult =
  | { ok: true; claim: Claim }
  | { ok: false; reason: 'none_left' | 'already_claimed' | 'post_closed' | 'error'; message: string };

export interface ImpactStats {
  mealsRescued: number;
  activePosts: number;
  clubsActive: number;
}

export interface ClubLeaderboardEntry {
  rank: number;
  name: string;
  mealsRescued: number;
  lbsPrevented: number;
}

export interface LeaderboardData {
  totalMeals: number;
  totalLbsSaved: number;
  clubs: ClubLeaderboardEntry[];
}

export interface VerifyResult {
  valid: boolean;
  claimId?: string;
  postId?: string;
  code?: string;
  /** Unix seconds. */
  expiresAt?: number;
  reason?: 'malformed' | 'bad_signature' | 'expired';
}

/** An upcoming BullsConnect event that will likely have food (from the campus-events function). */
export interface FoodEvent {
  id: string;
  title: string;
  club: string;
  start: string;
  end: string;
  location: string | null;
  campus: string | null;
  url: string;
  eventId: string | null;
  reason: string;
  summary: string;
}
