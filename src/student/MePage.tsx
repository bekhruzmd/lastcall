import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../shared/api';
import { DIET_LABELS, DIET_TAGS } from '../shared/constants';
import type { DietTag, Profile } from '../shared/types';
import StudentHeader from './StudentHeader';
import './student.css';

export default function MePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [dietPrefs, setDietPrefs] = useState<DietTag[]>([]);
  const [priority, setPriority] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        setLoading(true);
        let p = await api.getOrCreateProfile();
        if (!p) {
          p = await api.getOrCreateProfile('Student');
        }
        if (mounted && p) {
          setProfile(p);
          setDisplayName(p.display_name || '');
          setDietPrefs(p.diet_prefs || []);
          setPriority(Boolean(p.priority));
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Could not load profile');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleDiet = (tag: DietTag) => {
    setDietPrefs((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError('Please provide a display name');
      return;
    }
    if (cleanName.length > 20) {
      setError('Display name must be 20 characters or fewer');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const updated = await api.updateProfile({
        display_name: cleanName,
        diet_prefs: dietPrefs,
        priority,
      });
      setProfile(updated);
      setToastMessage('Preferences saved successfully!');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="student-shell">
      <StudentHeader displayName={displayName || profile?.display_name} />

      <main className="student-content">
        <div className="profile-container">
          <div className="ticket-back-nav">
            <Link to="/" className="ticket-back-btn">
              <span>← Back to food feed</span>
            </Link>
          </div>

          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0 0' }}>
            My Student Profile & Preferences
          </h1>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: '#666' }}>
              Loading preferences...
            </div>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Display Name Card */}
              <div className="profile-section-card">
                <h2 className="profile-section-title">
                  <span aria-hidden="true">👤</span>
                  <span>Display Name</span>
                </h2>
                <div className="form-group">
                  <label htmlFor="display-name" className="form-label">
                    First Name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (error) setError(null);
                    }}
                    maxLength={20}
                    placeholder="e.g. Alex"
                    required
                  />
                  <span className="form-helper">
                    Visible to event hosts on the pickup roster when you claim food (≤ 20 characters).
                  </span>
                </div>
              </div>

              {/* Diet Preferences Card */}
              <div className="profile-section-card">
                <h2 className="profile-section-title">
                  <span aria-hidden="true">🥗</span>
                  <span>Dietary Preferences</span>
                </h2>
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#555' }}>
                  Select the foods you prefer. We'll use these to customize your feed view.
                </p>
                <div className="filter-chips" role="group" aria-label="Dietary preferences">
                  {DIET_TAGS.map((tag) => {
                    const active = dietPrefs.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`filter-chip ${active ? 'active' : ''}`}
                        onClick={() => handleToggleDiet(tag)}
                        aria-pressed={active}
                      >
                        <span>{active ? '✓' : '+'}</span>
                        <span>{DIET_LABELS[tag]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Private Priority Grocery Card */}
              <div className="profile-section-card">
                <h2 className="profile-section-title">
                  <span aria-hidden="true">🔒</span>
                  <span>Fair Access</span>
                  <span className="privacy-badge">100% Private</span>
                </h2>

                <div className="privacy-toggle-card">
                  <div className="privacy-toggle-header">
                    <label htmlFor="priority-switch" className="privacy-toggle-title">
                      I'm prioritizing groceries this month
                    </label>
                    <label className="switch">
                      <input
                        id="priority-switch"
                        type="checkbox"
                        checked={priority}
                        onChange={(e) => setPriority(e.target.checked)}
                      />
                      <span className="slider" />
                    </label>
                  </div>

                  <p className="privacy-toggle-copy">
                    This setting is <strong>strictly private</strong> to your device and is{' '}
                    <strong>never shown</strong> to club officers, event hosts, on tickets, or to any other student.
                  </p>
                  <p className="privacy-toggle-copy" style={{ margin: 0 }}>
                    When leftover food has high demand during the fair draw window, this privately gives your entry
                    double weight in the lottery selection. You can toggle this on or off at any time.
                  </p>
                </div>
              </div>

              {error && (
                <div style={{ color: 'var(--red)', fontSize: '0.88rem', fontWeight: 600 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !displayName.trim()}
                style={{ minHeight: 48 }}
              >
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </form>
          )}

          {toastMessage && (
            <div className="toast-notice" role="status" aria-live="polite">
              <span aria-hidden="true">✓</span>
              <span>{toastMessage}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
