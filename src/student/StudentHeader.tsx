import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, Bell, BellOff, Ticket, User, Utensils } from 'lucide-react';
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
      <div className="student-header-top">
        <Link to="/" className="student-brand" aria-label="Leftover Bulls Home">
          <span className="student-brand-icon" aria-hidden="true">
            <Utensils size={18} strokeWidth={2.25} />
          </span>
          <div className="student-brand-text">
            <span className="student-brand-title">Leftover Bulls</span>
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
            {muted ? <BellOff size={20} aria-hidden="true" /> : <Bell size={20} aria-hidden="true" />}
          </button>

          <Link
            to="/me"
            className="user-pill-link"
            aria-label="Profile and dietary settings"
          >
            <User size={18} aria-hidden="true" />
            <span>{displayName?.trim() ? displayName.slice(0, 12) : 'Profile'}</span>
          </Link>
        </div>
      </div>

      <nav className="student-tabs" aria-label="Student sections">
        <NavLink to="/" end className={({ isActive }) => `student-tab${isActive ? ' active' : ''}`}>
          Active rescues
        </NavLink>
        <NavLink to="/events" className={({ isActive }) => `student-tab${isActive ? ' active' : ''}`}>
          Food at events
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => `student-tab${isActive ? ' active' : ''}`}>
          Leaderboard
        </NavLink>
      </nav>

      {activeClaim && (
        <Link
          to={`/ticket/${activeClaim.id}`}
          className="active-ticket-banner"
          aria-label="You have an active food ticket. Click to view."
        >
          <div>
            <Ticket size={18} aria-hidden="true" />
            <span className="active-ticket-banner-badge">Your ticket</span>
            <span>{activePostTitle ?? 'View your food ticket'}</span>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}
