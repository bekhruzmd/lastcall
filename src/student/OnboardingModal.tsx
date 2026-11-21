import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onSave: (displayName: string) => Promise<void> | void;
  onDismiss?: () => void;
}

export default function OnboardingModal({ isOpen, onSave, onDismiss }: OnboardingModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !onDismiss) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your first name');
      return;
    }
    if (trimmed.length > 20) {
      setError('Name must be 20 characters or fewer');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create profile. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-icon" aria-hidden="true">
            <Utensils size={22} strokeWidth={2.25} />
          </div>
          <h2 id="welcome-title" className="modal-title">
            Welcome to lastcall!
          </h2>
          <p className="modal-subtitle">
            USF student events often have great leftover food when meetings wrap up.
            Tell us your first name so organizers know who is picking up.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="first-name-input" className="form-label">
              What should we call you?
            </label>
            <input
              id="first-name-input"
              type="text"
              className="form-input"
              placeholder="First name only (e.g., Alex)"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={20}
              autoFocus
              required
            />
            <span className="form-helper">First name only. No password or email needed.</span>
            {error && <span className="claim-error" role="alert">{error}</span>}
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Setting up…' : 'Start rescuing food'}
            </button>
            {onDismiss && (
              <button type="button" className="modal-dismiss-btn" onClick={onDismiss}>
                Browse feed first
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
