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

export default function PostPage() {
  const navigate = useNavigate();
  const [club, setClub] = useState(rememberedClub);
  const [title, setTitle] = useState('');
  const [building, setBuilding] = useState(BUILDINGS[0]);
  const [room, setRoom] = useState('');
  const [portions, setPortions] = useState(10);
  const [tags, setTags] = useState<DietTag[]>([]);
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
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
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const post = await api.createPost({ org_name: club.trim(), title: title.trim(), building, room: room.trim(), portions_total: portions, diet_tags: tags, duration_min: duration, photo_url: photo });
      try { localStorage.setItem('lb.officer.club', club.trim()); } catch { /* Posting still works without storage. */ }
      navigate(`/officer/${post.id}${window.location.search}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not post. Please try again.'); setBusy(false); }
  }

  return <main className="officer-page">
    <nav className="officer-nav"><Link to="/">Leftover Bulls</Link><Link to="/board">Impact board</Link></nav>
    <h1>Good food. Going spare.</h1>
    <p className="officer-intro">Tell campus what’s left. We’ll handle the fair share.</p>
    <form onSubmit={submit} className="officer-form">
      <label>Club name<input autoComplete="organization" required maxLength={80} value={club} onChange={e => setClub(e.target.value)} placeholder="Your club" /></label>
      <label>What’s left?<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Cheese pizza, sandwiches…" /></label>
      <div className="officer-location"><label>Building<select value={building} onChange={e => setBuilding(e.target.value)}>{BUILDINGS.map(b => <option key={b}>{b}</option>)}</select></label>
        <label>Room<input required maxLength={60} value={room} onChange={e => setRoom(e.target.value)} placeholder="2708 / lobby" /></label></div>
      <fieldset><legend>Portions</legend><div className="officer-stepper"><button type="button" aria-label="One fewer portion" disabled={portions <= 1} onClick={() => setPortions(p => p - 1)}>−</button><input aria-label="Number of portions" type="number" min={1} max={200} required value={portions} onChange={e => setPortions(Math.min(200, Math.max(1, Number(e.target.value) || 1)))} /><button type="button" aria-label="One more portion" disabled={portions >= 200} onClick={() => setPortions(p => p + 1)}>+</button></div></fieldset>
      <fieldset><legend>Diet tags <span className="officer-muted">(optional)</span></legend><div className="officer-chips">{DIET_TAGS.map(tag => <button type="button" key={tag} aria-pressed={tags.includes(tag)} onClick={() => setTags(current => current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag])}>{DIET_LABELS[tag]}</button>)}</div></fieldset>
      <fieldset><legend>Available for</legend><div className="officer-chips">{DURATIONS_MIN.map(minutes => <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => setDuration(minutes)}>{minutes} min</button>)}</div></fieldset>
      <label className="officer-photo-label">Photo <span className="officer-muted">(optional)</span><input type="file" accept="image/*" disabled={photoBusy} onChange={e => void choosePhoto(e.target.files?.[0])} /></label>
      {photoBusy && <p role="status">Preparing photo…</p>}
      {photo && <div className="officer-photo"><img src={photo} alt="Food to be posted" /><button type="button" onClick={() => setPhoto(null)}>Remove photo</button></div>}
      {error && <p className="officer-error" role="alert">{error}</p>}
      <button className="officer-primary" disabled={busy || photoBusy || !club.trim() || !title.trim() || !room.trim()}>{busy ? 'Posting…' : 'Post leftovers'}</button>
    </form>
  </main>;
}
