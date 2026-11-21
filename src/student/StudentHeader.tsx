import { useState } from 'react';
import { Link } from 'react-router-dom';
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
            🥗
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
            {muted ? '🔕' : '🔔'}
          </button>

          <Link
            to="/me"
            className="user-pill-link"
            aria-label="Profile and dietary settings"
          >
            <span aria-hidden="true">👤</span>
            <span>{displayName?.trim() ? displayName.slice(0, 12) : 'Profile'}</span>
          </Link>
        </div>
      </div>

      {activeClaim && (
        <Link
          to={`/ticket/${activeClaim.id}`}
          className="active-ticket-banner"
          aria-label="You have an active food ticket. Click to view."
        >
          <div>
            <span className="active-ticket-banner-badge">Active Ticket</span>
            <span>{activePostTitle ?? 'View your food ticket'}</span>
          </div>
          <span>View →</span>
        </Link>
      )}
    </header>
  );
}
