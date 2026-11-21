import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  Hourglass,
  MapPin,
  Navigation,
  Plus,
  ShieldCheck,
  Shuffle,
  Utensils,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../shared/api';
import { BUILDINGS, DIET_LABELS } from '../shared/constants';
import type { Claim, DietTag, Post, Profile } from '../shared/types';
import StudentHeader from './StudentHeader';
import StudentFooter from './StudentFooter';
import OnboardingModal from './OnboardingModal';
import { playNewPostChime } from './sound';
import './student.css';

const FILTER_BUILDING_KEY = 'lb.filter.building';
const FILTER_DIET_KEY = 'lb.filter.diet';
const OMW_STORAGE_KEY = 'lb.omw.posts';
const GONE_STORAGE_KEY = 'lb.reported_gone.posts';

const FEATURED_DIET_FILTERS: { id: DietTag; label: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'halal', label: 'Halal-friendly' },
  { id: 'gluten_free', label: 'Gluten-Free' },
  { id: 'dairy_free', label: 'Dairy-Free' },
  { id: 'nut_free', label: 'Nut-Free' },
];

function loadStoredBuilding(): string {
  try {
    return localStorage.getItem(FILTER_BUILDING_KEY) || 'ALL';
  } catch {
    return 'ALL';
  }
}

function storeBuilding(b: string) {
  try {
    localStorage.setItem(FILTER_BUILDING_KEY, b);
  } catch {
    /* ignore storage errors */
  }
}

function loadStoredDiet(): DietTag[] {
  try {
    const raw = localStorage.getItem(FILTER_DIET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = new Set<DietTag>(['vegetarian', 'vegan', 'halal', 'gluten_free', 'dairy_free', 'nut_free', 'contains_nuts', 'kosher']);
      return parsed.filter((t): t is DietTag => valid.has(t));
    }
  } catch {
    /* ignore parse errors */
  }
  return [];
}

function storeDiet(tags: DietTag[]) {
  try {
    localStorage.setItem(FILTER_DIET_KEY, JSON.stringify(tags));
  } catch {
    /* ignore storage errors */
  }
}

function loadStoredOnMyWay(): Set<string> {
  try {
    const raw = localStorage.getItem(OMW_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function storeOnMyWay(set: Set<string>) {
  try {
    localStorage.setItem(OMW_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore storage errors */
  }
}

function loadStoredReportedGone(): Set<string> {
  try {
    const raw = localStorage.getItem(GONE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function storeReportedGone(set: Set<string>) {
  try {
    localStorage.setItem(GONE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore storage errors */
  }
}

function formatCountdown(targetIso: string, nowMs: number): { text: string; remainingSec: number } {
  const diffMs = Date.parse(targetIso) - nowMs;
  if (diffMs <= 0) return { text: '0:00', remainingSec: 0 };
  const totalSec = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const padSec = secs < 10 ? `0${secs}` : `${secs}`;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return { text: `${hours}h ${remMins}m`, remainingSec: totalSec };
  }
  return { text: `${mins}:${padSec}`, remainingSec: totalSec };
}

function getFreshnessData(createdAtIso: string, expiresAtIso: string, nowMs: number) {
  const createdMs = Date.parse(createdAtIso);
  const expiresMs = Date.parse(expiresAtIso);
  const totalWindowMs = Math.max(1, expiresMs - (Number.isNaN(createdMs) ? expiresMs - 2 * 60 * 60 * 1000 : createdMs));
  const remainingMs = Math.max(0, expiresMs - nowMs);
  const ratio = Math.min(1, Math.max(0, remainingMs / totalWindowMs));
  const percent = Math.round(ratio * 100);

  let timeText = '0m left';
  if (remainingMs <= 0) {
    timeText = 'Expired';
  } else {
    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) {
      timeText = `${hours}h ${mins}m left`;
    } else {
      timeText = `${mins}m left`;
    }
  }

  // Color-shifting: green (>50%) -> yellow (20-50%) -> red (<=20%)
  let statusColorClass = 'freshness-green';
  if (percent <= 20) {
    statusColorClass = 'freshness-red';
  } else if (percent <= 50) {
    statusColorClass = 'freshness-yellow';
  }

  return {
    percent,
    timeText,
    statusColorClass,
    isExpired: remainingMs <= 0,
  };
}

export default function FeedPage() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState<Post[]>([]);
  const [myClaims, setMyClaims] = useState<Record<string, Claim>>({});
  const [claimingPostId, setClaimingPostId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<{ postId: string; message: string } | null>(null);

  // Filters
  const [selectedBuilding, setSelectedBuilding] = useState<string>(loadStoredBuilding);
  const [selectedDietTags, setSelectedDietTags] = useState<DietTag[]>(loadStoredDiet);

  // Community foot-traffic & gone reports
  const [onMyWaySet, setOnMyWaySet] = useState<Set<string>>(loadStoredOnMyWay);
  const [reportedGoneSet, setReportedGoneSet] = useState<Set<string>>(loadStoredReportedGone);

  // New post highlights
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const knownPostIdsRef = useRef<Set<string>>(new Set());
  const resolvingLotteryIdsRef = useRef<Set<string>>(new Set());

  // Clock tick every second for real-time countdowns
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Initial Load: Profile & Posts
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const userProfile = await api.getOrCreateProfile();
        if (mounted) {
          if (!userProfile || !userProfile.display_name?.trim()) {
            setShowOnboarding(true);
          } else {
            setProfile(userProfile);
          }
        }

        const activePosts = await api.listActivePosts();
        if (mounted) {
          const ids = new Set(activePosts.map((p) => p.id));
          knownPostIdsRef.current = ids;
          setPosts(activePosts);

          // Load user's claims for active posts
          const claimPairs = await Promise.all(
            activePosts.map(async (p) => {
              const c = await api.getMyClaimForPost(p.id);
              return { postId: p.id, claim: c };
            }),
          );

          const claimsMap: Record<string, Claim> = {};
          claimPairs.forEach(({ postId, claim }) => {
            if (claim) claimsMap[postId] = claim;
          });
          setMyClaims(claimsMap);
        }
      } catch (err) {
        console.error('Failed to initialize student feed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Realtime Subscriptions: Posts & My Claims
  useEffect(() => {
    const unsubscribePosts = api.subscribePosts((updatedPost) => {
      const isNew = !knownPostIdsRef.current.has(updatedPost.id);
      knownPostIdsRef.current.add(updatedPost.id);

      if (isNew) {
        playNewPostChime();
        setNewPostIds((prev) => new Set([...prev, updatedPost.id]));
        // Remove highlight after 4 seconds
        setTimeout(() => {
          setNewPostIds((prev) => {
            const next = new Set(prev);
            next.delete(updatedPost.id);
            return next;
          });
        }, 4000);
      }

      setPosts((prev) => {
        const idx = prev.findIndex((p) => p.id === updatedPost.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedPost;
          return next;
        }
        // New post arrives at the top
        return [updatedPost, ...prev];
      });

      // Also fetch user's claim on this post if it was not known
      api.getMyClaimForPost(updatedPost.id).then((claim) => {
        if (claim) {
          setMyClaims((prev) => ({ ...prev, [updatedPost.id]: claim }));
        }
      });
    });

    const unsubscribeClaims = api.subscribeMyClaims((updatedClaim) => {
      setMyClaims((prev) => ({
        ...prev,
        [updatedClaim.post_id]: updatedClaim,
      }));
    });

    return () => {
      unsubscribePosts();
      unsubscribeClaims();
    };
  }, []);

  // 3. Resolve Lottery as soon as window ends
  useEffect(() => {
    posts.forEach((p) => {
      if (p.status === 'lottery') {
        const endsAtMs = Date.parse(p.lottery_ends_at);
        if (nowMs >= endsAtMs && !resolvingLotteryIdsRef.current.has(p.id)) {
          resolvingLotteryIdsRef.current.add(p.id);
          api
            .resolveLotteryIfDue(p.id)
            .then(async () => {
              // Refresh user claim and post status
              const [updatedPost, updatedClaim] = await Promise.all([
                api.getPost(p.id),
                api.getMyClaimForPost(p.id),
              ]);
              if (updatedPost) {
                setPosts((prev) => prev.map((item) => (item.id === updatedPost.id ? updatedPost : item)));
              }
              if (updatedClaim) {
                setMyClaims((prev) => ({ ...prev, [p.id]: updatedClaim }));
              }
            })
            .catch((err) => {
              console.error(`Error resolving lottery for ${p.id}:`, err);
            });
        }
      }
    });
  }, [posts, nowMs]);

  // Handle Onboarding Completion
  const handleOnboardingSave = async (displayName: string) => {
    const updated = await api.getOrCreateProfile(displayName);
    if (updated) {
      setProfile(updated);
      setShowOnboarding(false);
    }
  };

  // Filter handlers
  const handleSelectBuilding = (b: string) => {
    setSelectedBuilding(b);
    storeBuilding(b);
  };

  const handleToggleDietTag = (tag: DietTag) => {
    setSelectedDietTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      storeDiet(next);
      return next;
    });
  };

  const handleResetFilters = () => {
    setSelectedBuilding('ALL');
    storeBuilding('ALL');
    setSelectedDietTags([]);
    storeDiet([]);
  };

  // Community action handlers
  const handleToggleOnMyWay = useCallback(
    async (postId: string) => {
      const isCurrentlyOnTheWay = onMyWaySet.has(postId);
      const nextIsOnTheWay = !isCurrentlyOnTheWay;

      setOnMyWaySet((prev) => {
        const next = new Set(prev);
        if (nextIsOnTheWay) {
          next.add(postId);
        } else {
          next.delete(postId);
        }
        storeOnMyWay(next);
        return next;
      });

      // Optimistic count update
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const currentCount = p.on_the_way_count ?? 0;
          return {
            ...p,
            on_the_way_count: Math.max(0, currentCount + (nextIsOnTheWay ? 1 : -1)),
          };
        }),
      );

      try {
        const res = await api.toggleOnMyWay(postId, nextIsOnTheWay);
        if (typeof res?.on_the_way_count === 'number') {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, on_the_way_count: res.on_the_way_count } : p)),
          );
        }
      } catch (err) {
        console.error('Failed to toggle on-my-way status:', err);
      }
    },
    [onMyWaySet],
  );

  const handleReportGone = useCallback(
    async (postId: string) => {
      if (reportedGoneSet.has(postId)) return;

      setReportedGoneSet((prev) => {
        const next = new Set(prev);
        next.add(postId);
        storeReportedGone(next);
        return next;
      });

      // Optimistically increment gone_reports; if >= 2, immediately archive and remove from view
      setPosts((prev) => {
        const target = prev.find((p) => p.id === postId);
        const newReports = (target?.gone_reports ?? 0) + 1;
        if (newReports >= 2) {
          return prev.filter((p) => p.id !== postId);
        }
        return prev.map((p) => (p.id === postId ? { ...p, gone_reports: newReports } : p));
      });

      try {
        const res = await api.reportGone(postId);
        if (res?.archived) {
          setPosts((prev) => prev.filter((p) => p.id !== postId));
        }
      } catch (err) {
        console.error('Failed to report food gone:', err);
      }
    },
    [reportedGoneSet],
  );

  // Filtered Posts: auto-expire (now > expires_at), archived, or gone_reports >= 2
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 1. Food safety timer: auto-expire when nowMs exceeds expires_at
      const isExpired = Date.parse(post.expires_at) <= nowMs;
      if (isExpired) return false;
      if (post.status === 'expired' || post.status === 'archived') return false;

      // 2. No ghost food: auto-filter drops reported gone by 2+ Bulls
      if ((post.gone_reports ?? 0) >= 2) return false;

      // Filter by building
      if (selectedBuilding !== 'ALL' && post.building !== selectedBuilding) {
        return false;
      }

      // Filter by diet: post must satisfy all selected diet requirements
      if (selectedDietTags.length > 0) {
        const tags = post.dietary_tags ?? post.diet_tags ?? [];
        const matchesAllDiets = selectedDietTags.every((req) => tags.includes(req));
        if (!matchesAllDiets) return false;
      }

      return true;
    });
  }, [posts, selectedBuilding, selectedDietTags, nowMs]);

  // Active Winning Claim for banner
  const activeWinningClaim = useMemo(() => {
    const winningClaims = Object.values(myClaims).filter((c) => c.status === 'won');
    if (winningClaims.length === 0) return null;
    return winningClaims[0];
  }, [myClaims]);

  const activePostForWinningClaim = useMemo(() => {
    if (!activeWinningClaim) return null;
    const post = posts.find((p) => p.id === activeWinningClaim.post_id);
    return post ? `${post.org_name}: ${post.title}` : 'Pick up your food';
  }, [activeWinningClaim, posts]);

  // Handle Claim Action
  const handleClaim = useCallback(
    async (postId: string) => {
      if (!profile || !profile.display_name?.trim()) {
        setShowOnboarding(true);
        return;
      }

      setClaimingPostId(postId);
      setClaimError(null);

      try {
        const result = await api.claim(postId);
        if (result.ok) {
          setMyClaims((prev) => ({ ...prev, [postId]: result.claim }));
          // If won instantly (open phase), direct user to their ticket right away!
          if (result.claim.status === 'won') {
            navigate(`/ticket/${result.claim.id}`);
          }
        } else {
          setClaimError({ postId, message: result.message });
        }
      } catch (err) {
        setClaimError({
          postId,
          message: err instanceof Error ? err.message : 'Claim failed. Please try again.',
        });
      } finally {
        setClaimingPostId(null);
      }
    },
    [profile, navigate],
  );

  return (
    <div className="student-shell">
      <StudentHeader
        displayName={profile?.display_name}
        activeClaim={activeWinningClaim}
        activePostTitle={activePostForWinningClaim}
      />

      <main id="main-content" className="student-content">
        {/* Filters Section */}
        <section className="filter-section" aria-label="Filter food listings">
          <div className="filter-row">
            <div className="filter-label">
              <span>Building</span>
              {(selectedBuilding !== 'ALL' || selectedDietTags.length > 0) && (
                <button type="button" className="filter-reset-btn" onClick={handleResetFilters}>
                  Reset filters
                </button>
              )}
            </div>
            <select
              className="filter-select"
              value={selectedBuilding}
              onChange={(e) => handleSelectBuilding(e.target.value)}
              aria-label="Filter by campus building"
            >
              <option value="ALL">All buildings</option>
              {BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-row">
            <div className="filter-label">
              <span>Dietary needs</span>
              {selectedDietTags.length > 0 && (
                <span className="num">{selectedDietTags.length} selected</span>
              )}
            </div>
            <div className="filter-chips" role="group" aria-label="Dietary filter options">
              <button
                type="button"
                className={`filter-chip ${selectedDietTags.length === 0 ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDietTags([]);
                  storeDiet([]);
                }}
                aria-pressed={selectedDietTags.length === 0}
              >
                {selectedDietTags.length === 0 && <Check size={16} aria-hidden="true" />}
                <span>All</span>
              </button>
              {FEATURED_DIET_FILTERS.map(({ id, label }) => {
                const active = selectedDietTags.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() => handleToggleDietTag(id)}
                    aria-pressed={active}
                  >
                    {active ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Live Feed List */}
        <section className="feed-list" aria-label="Available campus food posts">
          <div className="feed-header-row">
            <h1 className="feed-title">
              <span>Active rescues</span>
              <span className="feed-count-badge">
                {filteredPosts.length} {filteredPosts.length === 1 ? 'drop' : 'drops'}
              </span>
            </h1>
          </div>

          {loading ? (
            <div className="feed-loading" role="status">
              Checking for leftover food nearby…
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="empty-feed">
              <span className="empty-icon" aria-hidden="true">
                <Utensils size={24} />
              </span>
              <h2 className="empty-title">No leftover food to rescue right now</h2>
              <p className="empty-desc">
                When USF clubs finish meetings and events with extra food, listings pop up here in real time.
                Keep this tab open with sound on to catch the next chime!
              </p>
              {(selectedBuilding !== 'ALL' || selectedDietTags.length > 0) ? (
                <button type="button" className="btn-primary" onClick={handleResetFilters}>
                  Clear filters to see all rescues
                </button>
              ) : (
                <Link to="/events" className="btn-primary">
                  View food at upcoming events
                </Link>
              )}
            </div>
          ) : (
            filteredPosts.map((post) => {
              const isNew = newPostIds.has(post.id);
              const userClaim = myClaims[post.id];
              const isClaiming = claimingPostId === post.id;
              const hasError = claimError?.postId === post.id;

              const isLottery = post.status === 'lottery';
              const lotteryCount = formatCountdown(post.lottery_ends_at, nowMs);
              const freshness = getFreshnessData(post.created_at, post.expires_at, nowMs);
              const isOnMyWay = onMyWaySet.has(post.id);
              const hasReportedGone = reportedGoneSet.has(post.id);
              const servingsLeft = post.estimated_servings ?? post.portions_left ?? post.portions_total;
              const bullsHeading = post.on_the_way_count ?? 0;

              return (
                <article
                  key={post.id}
                  className={`post-card ${isNew ? 'new-arrival' : ''}`}
                  aria-labelledby={`post-title-${post.id}`}
                >
                  {/* Status Banner */}
                  {isLottery ? (
                    <div className="post-card-banner lottery">
                      <span className="lottery-live-indicator">
                        <span className="live-dot" aria-hidden="true" />
                        Fair-share draw · zero food waste
                      </span>
                      <span>{lotteryCount.text} left</span>
                    </div>
                  ) : post.status === 'closed' || post.portions_left === 0 ? (
                    <div className="post-card-banner open">
                      <span>All rescued</span>
                    </div>
                  ) : (
                    <div className="post-card-banner open">
                      <span>Open now · first come, first served</span>
                    </div>
                  )}

                  <div className="post-card-body">
                    <div className="post-card-meta">
                      <span className="post-org-name">{post.org_name}</span>
                      <span className="food-trust-badge" title="Catered / commercially sealed food within the 2-hour safety window">
                        <ShieldCheck size={13} aria-hidden="true" />
                        <span>Catered / Sealed · 2-Hr Safety Window</span>
                      </span>
                    </div>

                    <h2 id={`post-title-${post.id}`} className="post-title">
                      {post.title}
                    </h2>

                    <div className="post-location">
                      <span className="location-icon" aria-hidden="true">
                        <MapPin size={16} />
                      </span>
                      <span>
                        {post.building} · Room {post.room}
                      </span>
                    </div>

                    {/* Live Portion & Foot-Traffic Counter: "~10 servings left · 3 Bulls heading there" */}
                    <div className="post-portions-row">
                      <div className="portions-left-text">
                        <span className="portions-live-counter">
                          ~{servingsLeft} servings left · {bullsHeading} {bullsHeading === 1 ? 'Bull' : 'Bulls'} heading there
                        </span>
                      </div>
                    </div>

                    {/* Live Freshness Countdown Bar */}
                    <div
                      className="freshness-bar-container"
                      aria-label={`Food safety freshness: ${freshness.timeText}`}
                    >
                      <div className="freshness-bar-meta">
                        <span className="freshness-bar-label">
                          <Clock size={13} aria-hidden="true" /> Freshness window
                        </span>
                        <span className={`freshness-bar-time ${freshness.statusColorClass}`}>
                          {freshness.timeText}
                        </span>
                      </div>
                      <div
                        className="freshness-progress-track"
                        role="progressbar"
                        aria-valuenow={freshness.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Freshness countdown"
                      >
                        <div
                          className={`freshness-progress-fill ${freshness.statusColorClass}`}
                          style={{ width: `${freshness.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* 1-Tap Community Action Row: "On My Way" and "It's Gone" */}
                    <div className="community-action-row" role="group" aria-label="Portion foot traffic and drop status">
                      <button
                        type="button"
                        className={`btn-community btn-on-my-way ${isOnMyWay ? 'active' : ''}`}
                        onClick={() => handleToggleOnMyWay(post.id)}
                        aria-pressed={isOnMyWay}
                        title={isOnMyWay ? "Cancel 'On My Way'" : "Let other Bulls know you're heading there"}
                      >
                        <Navigation size={15} aria-hidden="true" />
                        <span>{isOnMyWay ? 'Heading there' : 'On My Way'}</span>
                      </button>

                      <button
                        type="button"
                        className={`btn-community btn-its-gone ${hasReportedGone ? 'reported' : ''}`}
                        onClick={() => handleReportGone(post.id)}
                        disabled={hasReportedGone}
                        title={hasReportedGone ? 'You reported this food is gone' : 'Report that all food is gone'}
                      >
                        <AlertCircle size={15} aria-hidden="true" />
                        <span>{hasReportedGone ? 'Reported gone' : "It's Gone"}</span>
                      </button>
                    </div>

                    {post.diet_tags && post.diet_tags.length > 0 && (
                      <div className="diet-tags-row" aria-label="Dietary certifications">
                        {post.diet_tags.map((tag) => (
                          <span key={tag} className={`diet-tag-pill ${tag}`}>
                            {DIET_LABELS[tag] || tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Claim Button / Claim Status */}
                  <div className="post-action-area">
                    {userClaim ? (
                      // User already has a claim
                      userClaim.status === 'won' ? (
                        <>
                          <Link
                            to={`/ticket/${userClaim.id}`}
                            className="claim-btn won"
                            aria-label={`You won a portion of ${post.title}. Tap to view ticket.`}
                          >
                            <span>
                              You got it — view ticket <ArrowRight size={18} aria-hidden="true" />
                            </span>
                          </Link>
                          <span className="claim-status-info won">
                            Ready to collect at {post.building} Room {post.room}
                          </span>
                        </>
                      ) : userClaim.status === 'pending' ? (
                        <>
                          <button type="button" className="claim-btn pending" disabled>
                            <span>
                              <Hourglass size={17} aria-hidden="true" /> Entered · {lotteryCount.text} left
                            </span>
                          </button>
                          <span className="claim-status-info">
                            You're in the fair draw pool! Results show instantly when the countdown ends.
                          </span>
                        </>
                      ) : userClaim.status === 'lost' ? (
                        <>
                          <button type="button" className="claim-btn pending" disabled>
                            <span>Not this time</span>
                          </button>
                          <span className="claim-status-info lost">
                            All portions were drawn. Better luck on the next post!
                          </span>
                        </>
                      ) : userClaim.status === 'picked_up' ? (
                        <button type="button" className="claim-btn pending" disabled>
                          <span>
                            <Check size={17} aria-hidden="true" /> Picked up
                          </span>
                        </button>
                      ) : (
                        <button type="button" className="claim-btn pending" disabled>
                          <span>Expired</span>
                        </button>
                      )
                    ) : isLottery ? (
                      // In Lottery phase, user hasn't claimed yet
                      <>
                        <button
                          type="button"
                          className="claim-btn lottery"
                          onClick={() => handleClaim(post.id)}
                          disabled={isClaiming || lotteryCount.remainingSec === 0}
                          aria-label={`Enter draw for ${post.title}, ${lotteryCount.text} left`}
                        >
                          {isClaiming ? (
                            'Entering...'
                          ) : (
                            <span>
                              <Shuffle size={17} aria-hidden="true" /> Enter draw · {lotteryCount.text} left
                            </span>
                          )}
                        </button>
                        <span className="claim-status-info">
                          Fair draw: no rush to be first. Everyone who enters before the timer ends has a chance, and people who got food less recently get a better one.
                        </span>
                      </>
                    ) : post.portions_left > 0 ? (
                      // In Open phase, portions available
                      <>
                        <button
                          type="button"
                          className="claim-btn open"
                          onClick={() => handleClaim(post.id)}
                          disabled={isClaiming}
                          aria-label={`Rescue a portion of ${post.title}`}
                        >
                          {isClaiming ? 'Rescuing…' : 'Rescue a portion'}
                        </button>
                      </>
                    ) : (
                      // None left
                      <button type="button" className="claim-btn pending" disabled>
                        <span>All rescued</span>
                      </button>
                    )}

                    {hasError && (
                      <span className="claim-error" role="alert">
                        {claimError.message}
                      </span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>

      <StudentFooter />
      <OnboardingModal
        isOpen={showOnboarding}
        onSave={handleOnboardingSave}
        onDismiss={() => setShowOnboarding(false)}
      />
    </div>
  );
}
