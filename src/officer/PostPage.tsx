import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../shared/api';
import { BUILDINGS, DIET_LABELS, DIET_TAGS, DURATIONS_MIN } from '../shared/constants';
import type { DietTag } from '../shared/types';
import './officer.css';

function rememberedClub() {
  try { return localStorage.getItem('lb.officer.club') ?? ''; } catch { return ''; }
}

const ALLERGEN_OPTIONS = ['Dairy', 'Gluten', 'Nuts', 'Soy', 'Eggs', 'Shellfish'] as const;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choosePhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
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
      setPhoto(canvas.toDataURL('image/jpeg', 0.75));
    } catch { setError('That photo could not be opened. Try another image or post without it.'); }
    finally { URL.revokeObjectURL(url); setPhotoBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || photoBusy) return;
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
      try { localStorage.setItem('lb.officer.club', club.trim()); } catch { /* Posting still works without storage. */ }
      navigate(`/officer/${post.id}${window.location.search}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not post. Please try again.'); setBusy(false); }
  }

  return <main id="main-content" className="officer-page">
    <nav className="officer-nav">
      <Link to="/">← Food feed</Link>
      <div className="officer-nav-links">
        <Link to="/about">How it works</Link>
        <Link to="/board">Impact board</Link>
      </div>
    </nav>
    <h1>Rescue event leftovers. Zero waste.</h1>
    <p className="officer-intro">Turn surplus meeting food into meals saved for fellow Bulls.</p>
    <form onSubmit={submit} className="officer-form">
      <label>Club or student organization<input autoComplete="organization" required maxLength={80} value={club} onChange={e => setClub(e.target.value)} placeholder="e.g. SHPE, ACM, SG" /></label>
      <label>What food is available?<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Cheese pizza, sandwiches, boxed meals…" /></label>
      <div className="officer-location"><label>Building<select value={building} onChange={e => setBuilding(e.target.value)}>{BUILDINGS.map(b => <option key={b}>{b}</option>)}</select></label>
        <label>Room<input required maxLength={60} value={room} onChange={e => setRoom(e.target.value)} placeholder="2708 / lobby" /></label></div>
      <fieldset><legend>Portions available</legend><div className="officer-stepper"><button type="button" aria-label="One fewer portion" disabled={portions <= 1} onClick={() => setPortionText(String(Math.max(1, (portions || 1) - 1)))}>−</button><input aria-label="Number of portions" type="number" min={1} max={200} required value={portionText} onChange={e => setPortionText(e.target.value)} onBlur={() => { if (portionText.trim() !== '') { const n = Math.floor(Number(portionText)); if (Number.isFinite(n) && n >= 1 && n <= 200) setPortionText(String(n)); } }} /><button type="button" aria-label="One more portion" disabled={portions >= 200} onClick={() => setPortionText(String(Math.min(200, Math.max(1, (portions || 0) + 1))))}>+</button></div></fieldset>
      <fieldset><legend>Dietary tags <span className="officer-muted">(optional)</span></legend><div className="officer-chips">{DIET_TAGS.map(tag => <button type="button" key={tag} aria-pressed={tags.includes(tag)} onClick={() => setTags(current => current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag])}>{DIET_LABELS[tag]}</button>)}</div></fieldset>
      <fieldset><legend>Contains allergens <span className="officer-muted">(optional)</span></legend><div className="officer-chips">{ALLERGEN_OPTIONS.map(a => <button type="button" key={a} aria-pressed={allergens.includes(a)} onClick={() => setAllergens(curr => curr.includes(a) ? curr.filter(x => x !== a) : [...curr, a])}>{a}</button>)}</div></fieldset>
      <fieldset><legend>Food safety window</legend><div className="officer-chips">{DURATIONS_MIN.map(minutes => <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => setDuration(minutes)}>{minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`}</button>)}</div></fieldset>
      <label className="officer-photo-label">Photo <span className="officer-muted">(optional)</span><input type="file" accept="image/*" disabled={photoBusy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void choosePhoto(file); }} /></label>
      {photoBusy && <p role="status">Preparing photo…</p>}
      {photo && <div className="officer-photo"><img src={photo} alt="Food to be posted" /><button type="button" onClick={() => setPhoto(null)}>Remove photo</button></div>}

      <div className="officer-safety-card">
        <label className="officer-checkbox-label">
          <input
            type="checkbox"
            required
            checked={cateredConfirmed}
            onChange={e => setCateredConfirmed(e.target.checked)}
          />
          <span>
            <strong>Required Food Safety Confirmation:</strong> This is catered or commercially sealed club food (not homemade).
          </span>
        </label>
      </div>

      {error && <p className="officer-error" role="alert">{error}</p>}
      <button className="officer-primary" disabled={busy || photoBusy || !club.trim() || !title.trim() || !room.trim() || !cateredConfirmed}>{busy ? 'Sharing…' : 'Share food rescue'}</button>
    </form>
  </main>;
}
