import { useEffect, useState } from 'react';
import { Award, Flame, Leaf, Share2, ShieldCheck, Trophy, Utensils } from 'lucide-react';
import { api } from '../shared/api';
import type { LeaderboardData } from '../shared/types';
import StudentHeader from './StudentHeader';
import StudentFooter from './StudentFooter';
import './student.css';

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardData>({
    totalMeals: 200,
    totalLbsSaved: 240,
    clubs: [],
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getLeaderboard()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        console.error('Failed to load leaderboard:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: 'USF Food Sustainability Leaderboard · LastCall',
          text: `USF student organizations have prevented ${data.totalLbsSaved} lbs of food waste! Check out the leaderboard:`,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard?.writeText?.(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="student-shell">
      <StudentHeader />

      <main id="main-content" className="student-content leaderboard-page">
        {/* Intro Banner */}
        <section className="leaderboard-hero" aria-labelledby="leaderboard-title">
          <div className="leaderboard-hero-badge">
            <Leaf size={16} aria-hidden="true" />
            <span>USF Food Sustainability & Zero Waste</span>
          </div>
          <h1 id="leaderboard-title" className="leaderboard-title">
            Student Org Impact Leaderboard
          </h1>
          <p className="leaderboard-subtitle">
            Celebrating USF student organizations turning meeting leftovers into rescued meals.
            Official metrics recognized for Student Government budgeting and Golden Bull Awards.
          </p>
        </section>

        {/* Global Impact Summary Cards */}
        <section className="leaderboard-stats-grid" aria-label="Campus-wide food recovery statistics">
          <div className="stat-card">
            <span className="stat-icon" aria-hidden="true">
              <Utensils size={22} />
            </span>
            <div className="stat-details">
              <span className="stat-num">{loading ? '…' : data.totalMeals}</span>
              <span className="stat-label">Total Meals Rescued</span>
            </div>
          </div>

          <div className="stat-card highlight">
            <span className="stat-icon highlight" aria-hidden="true">
              <Leaf size={22} />
            </span>
            <div className="stat-details">
              <span className="stat-num">{loading ? '…' : `${data.totalLbsSaved} lbs`}</span>
              <span className="stat-label">Food Waste Prevented (~1.2 lbs/meal)</span>
            </div>
          </div>

          <div className="stat-card">
            <span className="stat-icon" aria-hidden="true">
              <Trophy size={22} />
            </span>
            <div className="stat-details">
              <span className="stat-num">{loading ? '…' : data.clubs.length}</span>
              <span className="stat-label">Participating Clubs</span>
            </div>
          </div>
        </section>

        {/* Action / Screenshot Bar */}
        <div className="leaderboard-action-row">
          <div className="leaderboard-action-tip">
            <Award size={18} aria-hidden="true" />
            <span>Official impact verification for SG funding</span>
          </div>
          <button type="button" className="btn-share-board" onClick={handleShare}>
            <Share2 size={16} aria-hidden="true" />
            <span>{copied ? 'Link copied!' : 'Share / Save'}</span>
          </button>
        </div>

        {/* Ranked Club List */}
        <section className="leaderboard-list-section" aria-label="Club rankings">
          <h2 className="leaderboard-section-title">
            <Flame size={20} aria-hidden="true" />
            <span>Top Organizations by Meals Rescued</span>
          </h2>

          <div className="club-ranks-list" role="list">
            {data.clubs.map((club) => {
              const medalClass = club.rank === 1 ? 'rank-gold' : club.rank === 2 ? 'rank-silver' : club.rank === 3 ? 'rank-bronze' : '';

              return (
                <div key={club.name} className={`club-rank-card ${medalClass}`} role="listitem">
                  <div className="club-rank-left">
                    <span className={`club-rank-badge ${medalClass}`}>
                      {club.rank === 1 ? '🥇' : club.rank === 2 ? '🥈' : club.rank === 3 ? '🥉' : `#${club.rank}`}
                    </span>
                    <div className="club-rank-info">
                      <strong className="club-name">{club.name}</strong>
                      <span className="club-lbs">
                        {club.lbsPrevented} lbs food waste diverted
                      </span>
                    </div>
                  </div>

                  <div className="club-rank-score">
                    <strong className="club-meals-count">{club.mealsRescued}</strong>
                    <span className="club-meals-label">meals saved</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Verification Footer Note */}
        <div className="leaderboard-verify-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            Metrics are cryptographically tracked via verified ticket pickups.
            Questions or requesting a certified export for your student organization?
            Contact the USF Office of Sustainability or Student Government.
          </p>
        </div>
      </main>

      <StudentFooter />
    </div>
  );
}
