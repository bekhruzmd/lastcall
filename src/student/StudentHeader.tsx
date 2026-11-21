import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, Bell, BellOff, Calendar, Plus, Sparkles, Ticket, Trophy, User, Utensils } from 'lucide-react';
import { isMuted, setMuted, unlockAudio } from './sound';
import type { Claim } from '../shared/types';

interface StudentHeaderProps {
  displayName?: string | null;
  activeClaim?: Claim | null;
  activePostTitle?: string | null;
}

export default function StudentHeader({
  displayName,
  activeClaim,
  activePostTitle,
}: StudentHeaderProps) {
  const [muted, setMutedState] = useState(() => isMuted());

  const handleToggleMute = () => {
    unlockAudio();
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <header className="student-header">
      <div className="student-header-inner">
        <div className="student-header-top">
          <Link to="/" className="student-brand" aria-label="LastCall Home">
            <span className="student-brand-icon" aria-hidden="true">
              <Utensils size={18} strokeWidth={2.4} />
            </span>
            <div className="student-brand-text">
              <span className="student-brand-title">LastCall</span>
              <span className="student-brand-subtitle">USF Campus Food Rescue</span>
            </div>
          </Link>

          <div className="student-header-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={handleToggleMute}
              aria-label={muted ? 'Unmute new post alerts' : 'Mute new post alerts'}
              title={muted ? 'Sound is off (click to unmute)' : 'Sound is on (click to mute)'}
            >
              {muted ? <BellOff size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}
            </button>

            <Link
              to="/post"
              className="desktop-header-post-btn"
              aria-label="Host a food drop (club officers)"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              <span>Host food drop</span>
            </Link>

            <Link
              to="/me"
              className="user-pill-link"
              aria-label="Profile and dietary settings"
            >
              <User size={16} aria-hidden="true" />
              <span>{displayName?.trim() ? displayName.slice(0, 12) : 'Profile'}</span>
            </Link>
          </div>
        </div>

        <nav className="student-tabs" aria-label="Student sections">
          <NavLink to="/" end className={({ isActive }) => `student-tab${isActive ? ' active' : ''}`}>
            <Sparkles size={15} aria-hidden="true" />
            <span className="tab-label-desktop">Active rescues</span>
            <span className="tab-label-mobile">Rescues</span>
          </NavLink>
          <NavLink to="/events" className={({ isActive }) => `student-tab${isActive ? ' active' : ''}`}>
            <Calendar size={15} aria-hidden="true" />
            <span className="tab-label-desktop">Food at events</span>
            <span className="tab-label-mobile">Events</span>
          </NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => `student-tab${isActive ? ' active' : ''}`}>
            <Trophy size={15} aria-hidden="true" />
            <span className="tab-label-desktop">Leaderboard</span>
            <span className="tab-label-mobile">Ranks</span>
          </NavLink>
        </nav>

        {activeClaim && (
          <Link
            to={`/ticket/${activeClaim.id}`}
            className="active-ticket-banner"
            aria-label="You have an active food ticket. Click to view."
          >
            <div className="active-ticket-info">
              <span className="active-ticket-tag">
                <Ticket size={13} aria-hidden="true" />
                <span>YOUR TICKET</span>
              </span>
              <span className="active-ticket-text">{activePostTitle ?? 'View your food ticket'}</span>
            </div>
            <div className="active-ticket-cta" aria-hidden="true">
              <ArrowRight size={15} />
            </div>
          </Link>
        )}
      </div>
    </header>
  );
}
