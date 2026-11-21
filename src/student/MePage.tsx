import { ArrowLeft, Check, Lock, Plus, User, Utensils } from 'lucide-react';
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
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Food feed</span>
            </Link>
          </div>

          <h1 className="page-title">Your profile</h1>

          {loading ? (
            <div className="feed-loading" role="status">
              Loading preferences…
            </div>
          ) : (
            <form onSubmit={handleSave} className="profile-form">
              {/* Display Name Card */}
              <div className="profile-section-card">
                <h2 className="profile-section-title">
                  <User size={20} aria-hidden="true" />
                  <span>Display name</span>
                </h2>
                <div className="form-group">
                  <label htmlFor="display-name" className="form-label">
                    First name
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
                    Shown to the host on their pickup list when you claim food. Up to 20 characters.
                  </span>
                </div>
              </div>

              {/* Diet Preferences Card */}
              <div className="profile-section-card">
                <h2 className="profile-section-title">
                  <Utensils size={20} aria-hidden="true" />
                  <span>Dietary preferences</span>
                </h2>
                <p className="profile-note">
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
                        {active ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        <span>{DIET_LABELS[tag]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Private Priority Grocery Card */}
              <div className="profile-section-card">
                <h2 className="profile-section-title">
                  <Lock size={20} aria-hidden="true" />
                  <span>Fair access</span>
                  <span className="privacy-badge">Private</span>
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
                    This setting is <strong>stored privately</strong> and is <strong>never shown</strong> to club
                    officers, event hosts, on tickets, or to any other student.
                  </p>
                  <p className="privacy-toggle-copy">
                    When leftover food has high demand during the fair draw window, this privately gives your entry
                    double weight in the lottery selection. You can toggle this on or off at any time.
                  </p>
                </div>
              </div>

              {error && (
                <div className="claim-error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={saving || !displayName.trim()}
              >
                {saving ? 'Saving…' : 'Save preferences'}
              </button>
            </form>
          )}

          {toastMessage && (
            <div className="toast-notice" role="status" aria-live="polite">
              <Check size={18} aria-hidden="true" />
              <span>{toastMessage}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
