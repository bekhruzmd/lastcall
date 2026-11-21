import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../shared/api';
import type { ImpactStats, Post } from '../shared/types';
import './BoardPage.css';

type Pickup = {
  display_name: string;
  org_name: string;
  picked_up_at: string;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Student';
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

function countdown(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function BoardPage() {
  const [stats, setStats] = useState<ImpactStats>({
    mealsRescued: 0,
    activePosts: 0,
    clubsActive: 0,
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [qrUrl, setQrUrl] = useState('');
  const [counterBump, setCounterBump] = useState(false);
  const previousMeals = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const feedUrl = `${window.location.origin}/`;

    const refresh = async () => {
      const [nextStats, nextPosts, nextPickups] = await Promise.all([
        api.getImpactStats(),
        api.listActivePosts(),
        api.listRecentPickups(8),
      ]);
      if (!alive) return;
      setStats(nextStats);
      setPosts(nextPosts);
      setPickups(nextPickups);
      for (const post of nextPosts) {
        if (post.status === 'lottery') void api.resolveLotteryIfDue(post.id);
      }
    };

    void refresh();
    const unsubscribePosts = api.subscribePosts(() => void refresh());
    const clock = window.setInterval(refresh, 10_000);

    void QRCode.toDataURL(feedUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#1B1B1B', light: '#FAF8F2' },
    }).then((url) => {
      if (alive) setQrUrl(url);
    }).catch(() => {
      if (alive) setQrUrl('');
    });

    return () => {
      alive = false;
      unsubscribePosts();
      window.clearInterval(clock);
    };
  }, []);

  // Re-render every second while a draw is running so its countdown ticks smoothly.
  const [, setTick] = useState(0);
  const hasLottery = posts.some((post) => post.status === 'lottery');
  useEffect(() => {
    if (!hasLottery) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [hasLottery]);

  useEffect(() => {
    if (previousMeals.current !== null && stats.mealsRescued > previousMeals.current) {
      setCounterBump(false);
      window.requestAnimationFrame(() => setCounterBump(true));
      const timer = window.setTimeout(() => setCounterBump(false), 700);
      previousMeals.current = stats.mealsRescued;
      return () => window.clearTimeout(timer);
    }
    previousMeals.current = stats.mealsRescued;
  }, [stats.mealsRescued]);

  return (
    <main id="main-content" className="board">
      <header className="board__header">
        <Link to="/" className="board__brand" title="Return to student feed">
          Leftover <span>Bulls</span>
        </Link>
        <div className="board__header-actions">
          <Link to="/about" className="board__header-link">How it works</Link>
          <div className="board__live"><i aria-hidden="true" /> Live campus impact</div>
        </div>
      </header>

      <section className="board__grid">
        <section className="impact-panel" aria-label="Campus impact">
          <p className="impact-panel__label">Meals rescued</p>
          <div className={`impact-panel__counter${counterBump ? ' impact-panel__counter--bump' : ''}`} aria-live="polite">
            {stats.mealsRescued}
          </div>
          <div className="impact-panel__meta">
            <span><strong>{stats.activePosts}</strong> active posts</span>
            <span><strong>{stats.clubsActive}</strong> clubs sharing</span>
          </div>
        </section>

        <section className="active-panel" aria-label="Active leftovers">
          <div className="active-panel__heading">
            <h1>Available now</h1>
            <span>{posts.length} live</span>
          </div>
          <div className="post-list">
            {posts.length === 0 ? (
              <div className="post-list__empty">
                <strong>Quiet on campus</strong>
                <span>New food will appear here instantly.</span>
              </div>
            ) : posts.map((post) => (
              <article className="board-post" key={post.id}>
                <div className="board-post__main">
                  <span className="board-post__club">{post.org_name}</span>
                  <h2>{post.title}</h2>
                  <p>{post.building} · Room {post.room}</p>
                </div>
                <div className="board-post__stats">
                  <div>
                    <strong>{post.portions_left}</strong>
                    <span>portions left</span>
                  </div>
                  {post.status === 'lottery' && (
                    <div className="board-post__lottery">
                      <strong>{countdown(post.lottery_ends_at)}</strong>
                      <span>lottery</span>
                    </div>
                  )}
                  {post.status === 'open' && (
                    <div className="board-post__open">
                      <strong>Open</strong>
                      <span>claim now</span>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="qr-panel" aria-label="Join the student feed">
          <div className="qr-panel__frame">
            {qrUrl ? <img src={qrUrl} alt="QR code for the student food feed" /> : <div>Loading QR</div>}
          </div>
          <strong>Scan to find food</strong>
          <span>Open the student feed</span>
        </aside>
      </section>

      <footer className="ticker" aria-label="Recent pickups">
        <div className="ticker__label">Recent pickups</div>
        <div className="ticker__window">
          {pickups.length === 0 ? (
            <div className="ticker__item ticker__item--waiting">Waiting for the next pickup</div>
          ) : (
            <div className="ticker__track">
              {[...pickups, ...pickups].map((pickup, index) => (
                <span className="ticker__item" key={`${pickup.picked_up_at}-${index}`}>
                  <strong>{firstName(pickup.display_name)}</strong> picked up from {pickup.org_name}
                  <i>·</i>{timeAgo(pickup.picked_up_at)}
                </span>
              ))}
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}
