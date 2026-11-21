import { Link } from 'react-router-dom';
import { ExternalLink, ShieldCheck, Utensils } from 'lucide-react';

export default function StudentFooter() {
  return (
    <footer className="student-footer" aria-label="Campus resources and navigation">
      {/* Officer Post Callout */}
      <div className="student-footer-host-card">
        <div className="student-footer-host-title">
          <Utensils size={18} aria-hidden="true" />
          <span>Hosting an event or club meeting?</span>
        </div>
        <p className="student-footer-host-desc">
          Got catering or pizza left over? Post it in 15 seconds. We’ll handle the fair draw and give students a verified QR ticket for pickup.
        </p>
        <Link to="/post" className="student-footer-host-btn">
          Post leftover food →
        </Link>
      </div>

      {/* Feed-A-Bull Campus Pantry Info */}
      <div className="student-footer-pantry-card">
        <strong>Need regular groceries? Feed-A-Bull Pantry is open.</strong>
        <p>
          USF’s on-campus pantry provides free food and personal supplies to enrolled students.
          Located in the <strong>Marshall Student Center (MSC 0002)</strong>, open <strong>Mon–Fri, 10 AM – 4 PM</strong>.
        </p>
        <a
          href="https://www.usf.edu/student-affairs/student-health-services/services-specialties/feed-a-bull.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="student-footer-pantry-link"
        >
          <span>Feed-A-Bull hours & details</span>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>

      {/* Secondary Links */}
      <nav className="student-footer-nav" aria-label="Footer links">
        <Link to="/about">How it works</Link>
        <Link to="/board">Live impact board</Link>
        <Link to="/events">Food at events</Link>
        <Link to="/me">Your profile</Link>
        <Link to="/post">Officer post</Link>
      </nav>

      {/* Privacy & Dignity note */}
      <div className="student-footer-privacy">
        <ShieldCheck size={16} aria-hidden="true" />
        <p className="student-footer-note">
          lastcall never asks for passwords, student IDs, or USF emails. Priority draw settings are stored privately and never displayed on public screens.
        </p>
      </div>

      <div className="student-footer-copy">
        lastcall · Built for the USF campus community
      </div>
    </footer>
  );
}
