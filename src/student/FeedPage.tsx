import { ArrowRight, Check, Clock, Hourglass, MapPin, Plus, Shuffle, Utensils } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../shared/api';
import { BUILDINGS, DIET_LABELS, DIET_TAGS } from '../shared/constants';
import type { Claim, DietTag, Post, Profile } from '../shared/types';
import StudentHeader from './StudentHeader';
import OnboardingModal from './OnboardingModal';
import { playNewPostChime } from './sound';
import './student.css';

const FILTER_BUILDING_KEY = 'lb.filter.building';
const FILTER_DIET_KEY = 'lb.filter.diet';

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
      return parsed.filter((t): t is DietTag => DIET_TAGS.includes(t));
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

  // Filtered Posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Exclude expired or fully closed posts with no leftovers unless user already won
      const isExpired = Date.parse(post.expires_at) <= nowMs;
      if (isExpired && post.status !== 'open') return false;

      // Filter by building
      if (selectedBuilding !== 'ALL' && post.building !== selectedBuilding) {
        return false;
      }

      // Filter by diet: post must satisfy all selected diet requirements
      if (selectedDietTags.length > 0) {
        const matchesAllDiets = selectedDietTags.every((req) => post.diet_tags.includes(req));
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

      <main className="student-content">
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
              {DIET_TAGS.map((tag) => {
                const active = selectedDietTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() => handleToggleDietTag(tag)}
                    aria-pressed={active}
                  >
                    {active ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                    <span>{DIET_LABELS[tag]}</span>
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
              <span>Leftovers now</span>
              <span className="feed-count-badge">
                {filteredPosts.length} {filteredPosts.length === 1 ? 'post' : 'posts'}
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
              <h2 className="empty-title">No food right now — we'll ping you</h2>
              <p className="empty-desc">
                When USF clubs finish meetings and events with extra food, listings pop up here in real time.
                Keep this tab open with sound on to catch the next chime!
              </p>
              {(selectedBuilding !== 'ALL' || selectedDietTags.length > 0) && (
                <button type="button" className="btn-primary" onClick={handleResetFilters}>
                  Clear filters to see all posts
                </button>
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
              const expiryCount = formatCountdown(post.expires_at, nowMs);

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
                        Fair-share draw · no rush to be first
                      </span>
                      <span>{lotteryCount.text} left</span>
                    </div>
                  ) : post.status === 'closed' || post.portions_left === 0 ? (
                    <div className="post-card-banner open">
                      <span>All claimed</span>
                    </div>
                  ) : (
                    <div className="post-card-banner open">
                      <span>Open now · first come, first served</span>
                    </div>
                  )}

                  <div className="post-card-body">
                    <div className="post-card-meta">
                      <span className="post-org-name">{post.org_name}</span>
                      {isLottery && <span className="post-time-ago">Draw in {lotteryCount.text}</span>}
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

                    <div className="post-portions-row">
                      <div className="portions-left-text">
                        <span className="portions-left-highlight">{post.portions_left}</span> of{' '}
                        {post.portions_total} portions left
                      </div>
                      <div className="expiry-countdown" title="Food expires at this time">
                        <Clock size={15} aria-hidden="true" />
                        <span>{expiryCount.text}</span>
                      </div>
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
                          aria-label={`Claim a portion of ${post.title}`}
                        >
                          {isClaiming ? 'Claiming...' : 'Claim a portion'}
                        </button>
                      </>
                    ) : (
                      // None left
                      <button type="button" className="claim-btn pending" disabled>
                        <span>All claimed</span>
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

      <OnboardingModal isOpen={showOnboarding} onSave={handleOnboardingSave} />
    </div>
  );
}
