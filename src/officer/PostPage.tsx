import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
import { api } from '../shared/api';
import { BUILDINGS, DIET_LABELS, DIET_TAGS, DURATIONS_MIN } from '../shared/constants';
import { analyzeFoodImage } from '../shared/geminiVision';
import type { FoodAnalysisResult } from '../shared/geminiVision';
import type { DietTag } from '../shared/types';
import './officer.css';

function rememberedClub() {
  try { return localStorage.getItem('lb.officer.club') ?? ''; } catch { return ''; }
}

const ALLERGEN_OPTIONS = ['Dairy', 'Gluten', 'Nuts', 'Soy', 'Eggs', 'Shellfish'] as const;

const POPULAR_BUILDINGS = [
  'Marshall Student Center (MSC)',
  'Library (LIB)',
  'Engineering Building II (ENB)',
  'Interdisciplinary Sciences (ISA)',
  'Computer Sciences (CIS)',
  'Judy Genshaft Honors College (HON)',
];

export default function PostPage() {
  const navigate = useNavigate();
  const [club, setClub] = useState(rememberedClub);
  const [title, setTitle] = useState('');
  const [building, setBuilding] = useState(BUILDINGS[0]);
  const [room, setRoom] = useState('');
  const [portionText, setPortionText] = useState('10');
  const portions = Number(portionText);
  const [tags, setTags] = useState<DietTag[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [duration, setDuration] = useState<15 | 30 | 60 | 120>(120);
  const [cateredConfirmed, setCateredConfirmed] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<FoodAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choosePhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    setAiResult(null);
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 800 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error();
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      setPhoto(dataUrl);

      // Automated Gemini AI Vision analysis
      setAiBusy(true);
      analyzeFoodImage(dataUrl)
        .then((res) => {
          setAiResult(res);
          // AI handles naming, approximate portions, and approximate labelings
          setTitle(res.title);
          setPortionText(String(res.estimated_servings));
          if (res.dietary_tags.length > 0) {
            setTags(res.dietary_tags);
          }
          if (res.allergens.length > 0) {
            setAllergens(res.allergens);
          }
        })
        .catch(() => {})
        .finally(() => setAiBusy(false));
    } catch {
      setError('That photo could not be opened. Try another image or post without it.');
    } finally {
      URL.revokeObjectURL(url);
      setPhotoBusy(false);
    }
  }

  function handleResetPhoto() {
    setPhoto(null);
    setAiResult(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || photoBusy || aiBusy) return;
    if (!Number.isInteger(portions) || portions < 1 || portions > 200) {
      setError('Enter a whole number of portions from 1 to 200.');
      return;
    }
    if (!cateredConfirmed) {
      setError('Please confirm that this is catered or commercially sealed club food.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const post = await api.createPost({
        org_name: club.trim(),
        title: title.trim(),
        building,
        room: room.trim(),
        portions_total: portions,
        diet_tags: tags,
        duration_min: duration,
        photo_url: photo,
        allergens,
        is_catered: true,
      });
      try { localStorage.setItem('lb.officer.club', club.trim()); } catch { /* Storage optional */ }
      navigate(`/officer/${post.id}${window.location.search}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main id="main-content" className="officer-page">
      <nav className="officer-nav">
        <Link to="/" className="officer-back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Food Feed</span>
        </Link>
        <div className="officer-nav-links">
          <Link to="/about">How it works</Link>
          <Link to="/board">Impact board</Link>
        </div>
      </nav>

      <header className="officer-header-section">
        <div className="officer-header-badge">
          <Sparkles size={14} aria-hidden="true" />
          <span>Club Officer Portal</span>
        </div>
        <h1 className="officer-hero-title">Rescue event leftovers in 15 seconds.</h1>
        <p className="officer-intro">
          Snap a photo and Gemini AI automatically titles the food, estimates remaining portions, and tags diets & allergens. Zero manual counting.
        </p>
      </header>

      <form onSubmit={submit} className="officer-form">
        {/* =================================================================
            15-Second AI Photo Drop (Centerpiece UI)
            ================================================================= */}
        <section className={`officer-ai-drop-card ${photo ? 'has-photo' : ''} ${aiBusy ? 'is-scanning' : ''}`}>
          <div className="officer-ai-drop-header">
            <div className="ai-sparkle-pill">
              <Sparkles size={16} aria-hidden="true" />
              <span>Gemini AI Vision Drop</span>
            </div>
            {aiResult && !aiBusy && (
              <span className="ai-verified-badge">
                <CheckCircle2 size={14} aria-hidden="true" />
                Auto-Filled
              </span>
            )}
          </div>

          {!photo ? (
            <label className="officer-drop-zone">
              <div className="drop-zone-icon-wrap">
                <Camera size={28} strokeWidth={2.2} aria-hidden="true" />
              </div>
              <strong className="drop-zone-title">Snap or upload food photo</strong>
              <span className="drop-zone-sub">
                AI inspects trays, estimates portions, and auto-fills this form
              </span>
              <span className="drop-zone-btn">
                <Camera size={16} aria-hidden="true" />
                <span>Open Camera / Upload</span>
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={photoBusy || aiBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void choosePhoto(file);
                }}
              />
            </label>
          ) : (
            <div className="officer-scanned-container">
              <div className="officer-scanned-media">
                <img src={photo} alt="Event leftovers to rescue" className="officer-scanned-img" />
                {aiBusy && (
                  <div className="laser-scanner-overlay" aria-hidden="true">
                    <div className="laser-scanner-line" />
                  </div>
                )}
              </div>

              {aiBusy && (
                <div className="officer-ai-scanning-state" role="status">
                  <Sparkles size={18} className="spin-icon" aria-hidden="true" />
                  <div>
                    <strong>Analyzing food with Gemini Vision…</strong>
                    <p>Detecting trays, counting portions, and checking allergens</p>
                  </div>
                </div>
              )}

              {aiResult && !aiBusy && (
                <div className="officer-ai-breakdown-card" role="status">
                  <div className="ai-breakdown-top">
                    <span className="ai-breakdown-label">
                      <Sparkles size={14} aria-hidden="true" />
                      AI Analysis Result
                    </span>
                    <button
                      type="button"
                      onClick={handleResetPhoto}
                      className="ai-reset-photo-btn"
                      title="Remove photo and rescan"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  </div>

                  <div className="ai-breakdown-grid">
                    <div className="ai-breakdown-item">
                      <span className="ai-item-k">Detected Title</span>
                      <strong className="ai-item-v">{aiResult.title}</strong>
                    </div>
                    <div className="ai-breakdown-item highlight">
                      <span className="ai-item-k">Estimated Portions</span>
                      <strong className="ai-item-v">~{aiResult.estimated_servings} servings</strong>
                    </div>
                  </div>

                  {aiResult.confidence_notes && (
                    <p className="ai-confidence-note">
                      "{aiResult.confidence_notes}"
                    </p>
                  )}

                  <div className="ai-tags-summary">
                    {aiResult.dietary_tags.map((t) => (
                      <span key={t} className="ai-diet-chip">
                        <Check size={12} aria-hidden="true" />
                        {DIET_LABELS[t] || t}
                      </span>
                    ))}
                    {aiResult.allergens.map((a) => (
                      <span key={a} className="ai-allergen-chip">
                        Allergen: {a}
                      </span>
                    ))}
                  </div>

                  <p className="ai-autofill-hint">
                    ✨ <strong>All fields below auto-filled.</strong> Adjust anything you like, select your room, and tap publish!
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* =================================================================
            Form Details (Auto-filled by AI)
            ================================================================= */}
        <div className="officer-fields-card">
          <label className="officer-field-group">
            <span className="officer-field-title">
              Club or Student Organization <span className="req">*</span>
            </span>
            <input
              autoComplete="organization"
              required
              maxLength={80}
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder="e.g. SHPE, ACM, SG, SWE, ISA"
            />
          </label>

          <label className="officer-field-group">
            <span className="officer-field-title">
              What food is available? <span className="req">*</span>
              {aiResult && <span className="field-ai-pill">✨ Auto-named by AI</span>}
            </span>
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Domino's Pepperoni & Cheese Pizzas"
            />
          </label>

          {/* Quick USF Campus Building Shortcuts */}
          <fieldset className="officer-field-group">
            <legend className="officer-field-title">
              <Building2 size={16} aria-hidden="true" />
              <span>Campus Building <span className="req">*</span></span>
            </legend>
            <div className="popular-buildings-row" role="group" aria-label="Popular USF buildings">
              {POPULAR_BUILDINGS.map((b) => {
                const shortName = b.replace(/\s*\(.*?\)\s*/g, '').trim();
                const isSelected = building === b;
                return (
                  <button
                    key={b}
                    type="button"
                    className={`building-pill-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setBuilding(b)}
                    aria-pressed={isSelected}
                  >
                    {isSelected && <Check size={13} aria-hidden="true" />}
                    <span>{shortName}</span>
                  </button>
                );
              })}
            </div>
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              className="building-select"
              aria-label="All USF campus buildings"
            >
              {BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </fieldset>

          <label className="officer-field-group">
            <span className="officer-field-title">
              <MapPin size={16} aria-hidden="true" />
              <span>Room or Pickup Spot <span className="req">*</span></span>
            </span>
            <input
              required
              maxLength={60}
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. MSC 2708 (2nd floor) or Lobby"
            />
          </label>

          {/* Tactile Portions Stepper */}
          <fieldset className="officer-field-group">
            <legend className="officer-field-title">
              <Utensils size={16} aria-hidden="true" />
              <span>Portions Available <span className="req">*</span></span>
              {aiResult && <span className="field-ai-pill">✨ AI Counted</span>}
            </legend>
            <div className="officer-stepper">
              <button
                type="button"
                aria-label="One fewer portion"
                disabled={portions <= 1}
                onClick={() => setPortionText(String(Math.max(1, (portions || 1) - 1)))}
                className="stepper-btn"
              >
                −
              </button>
              <input
                aria-label="Number of portions"
                type="number"
                min={1}
                max={200}
                required
                value={portionText}
                onChange={(e) => setPortionText(e.target.value)}
                onBlur={() => {
                  if (portionText.trim() !== '') {
                    const n = Math.floor(Number(portionText));
                    if (Number.isFinite(n) && n >= 1 && n <= 200) setPortionText(String(n));
                  }
                }}
              />
              <button
                type="button"
                aria-label="One more portion"
                disabled={portions >= 200}
                onClick={() => setPortionText(String(Math.min(200, Math.max(1, (portions || 0) + 1))))}
                className="stepper-btn"
              >
                +
              </button>
            </div>
          </fieldset>

          {/* Dietary Tags Chips */}
          <fieldset className="officer-field-group">
            <legend className="officer-field-title">
              <span>Dietary Tags <span className="officer-muted">(optional)</span></span>
              {aiResult && <span className="field-ai-pill">✨ AI Tagged</span>}
            </legend>
            <div className="officer-chips">
              {DIET_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    type="button"
                    key={tag}
                    className={`officer-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() =>
                      setTags((current) =>
                        current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
                      )
                    }
                  >
                    {active ? <Check size={14} aria-hidden="true" /> : null}
                    <span>{DIET_LABELS[tag]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Allergens Chips */}
          <fieldset className="officer-field-group">
            <legend className="officer-field-title">
              <span>Contains Allergens <span className="officer-muted">(optional)</span></span>
            </legend>
            <div className="officer-chips">
              {ALLERGEN_OPTIONS.map((a) => {
                const active = allergens.includes(a);
                return (
                  <button
                    type="button"
                    key={a}
                    className={`officer-chip allergen ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() =>
                      setAllergens((curr) =>
                        curr.includes(a) ? curr.filter((x) => x !== a) : [...curr, a],
                      )
                    }
                  >
                    {active ? <Check size={14} aria-hidden="true" /> : null}
                    <span>{a}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Food Safety Window */}
          <fieldset className="officer-field-group">
            <legend className="officer-field-title">
              <span>Food Safety Window</span>
            </legend>
            <div className="officer-chips">
              {DURATIONS_MIN.map((minutes) => {
                const active = duration === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    className={`officer-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setDuration(minutes)}
                  >
                    <span>{minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Mandatory Catered / Sealed Food Safety Confirmation */}
          <div className="officer-safety-card">
            <label className="officer-checkbox-label">
              <input
                type="checkbox"
                required
                checked={cateredConfirmed}
                onChange={(e) => setCateredConfirmed(e.target.checked)}
              />
              <div className="safety-text-wrap">
                <div className="safety-header">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <strong>Required Food Safety Confirmation</strong>
                </div>
                <span>
                  This is catered or commercially prepared club food (not homemade). Safe for Bulls to eat within the 2-hour window.
                </span>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="officer-error-banner" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="officer-primary-cta"
          disabled={busy || photoBusy || aiBusy || !club.trim() || !title.trim() || !room.trim() || !cateredConfirmed}
        >
          {busy ? (
            <span>Publishing Food Rescue…</span>
          ) : (
            <>
              <Sparkles size={20} aria-hidden="true" />
              <span>Share Food Rescue · 1-Tap Publish</span>
              <ArrowRight size={18} aria-hidden="true" className="cta-arrow" />
            </>
          )}
        </button>
      </form>
    </main>
  );
}
