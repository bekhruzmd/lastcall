import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, MapPin, Utensils } from 'lucide-react';
import { api } from '../shared/api';
import { cachedFoodEvents, fetchFoodEvents } from '../shared/events';
import type { FoodEvent } from '../shared/types';
import StudentHeader from './StudentHeader';
import StudentFooter from './StudentFooter';
import './events.css';

const CAMPUSES = ['Tampa', 'St Petersburg', 'Sarasota-Manatee', 'All'] as const;
type Campus = (typeof CAMPUSES)[number];
const CAMPUS_KEY = 'lb.events.campus';
const TZ = 'America/New_York';

function readCampus(): Campus {
  try {
    const v = localStorage.getItem(CAMPUS_KEY);
    if (v && (CAMPUSES as readonly string[]).includes(v)) return v as Campus;
  } catch {
    /* default */
  }
  return 'Tampa';
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}

function dayLabel(iso: string, now: Date): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return 'Today';
  if (key === dayKey(new Date(now.getTime() + 86_400_000).toISOString())) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' });
}

function timeRange(e: FoodEvent): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  return `${fmt(e.start)} – ${fmt(e.end)}`;
}

function shortLocation(loc: string): string {
  // "MSC 2702, 4202 E Fowler Ave, Tampa, FL…" -> "MSC 2702"
  return loc.split(',')[0].trim();
}

function happeningNow(e: FoodEvent, now: Date): boolean {
  return Date.parse(e.start) <= now.getTime() && now.getTime() < Date.parse(e.end);
}

export default function EventsPage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [campus, setCampus] = useState<Campus>(readCampus);
  const [data, setData] = useState(() => cachedFoodEvents());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    void api
      .getOrCreateProfile()
      .then((p) => alive && setDisplayName(p?.display_name ?? null))
      .catch(() => {});
    fetchFoodEvents()
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Events are unavailable right now.'))
      .finally(() => alive && setLoading(false));
    const tick = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      alive = false;
      window.clearInterval(tick);
    };
  }, []);

  function chooseCampus(next: Campus) {
    setCampus(next);
    try {
      localStorage.setItem(CAMPUS_KEY, next);
    } catch {
      /* optional */
    }
  }

  const groups = useMemo(() => {
    const list = (data?.events ?? []).filter(
      (e) => Date.parse(e.end) > now.getTime() && (campus === 'All' || e.campus === campus || e.campus === null),
    );
    const byDay = new Map<string, { label: string; events: FoodEvent[] }>();
    for (const e of list) {
      const key = dayKey(e.start < now.toISOString() ? now.toISOString() : e.start);
      if (!byDay.has(key)) byDay.set(key, { label: dayLabel(e.start < now.toISOString() ? now.toISOString() : e.start, now), events: [] });
      byDay.get(key)!.events.push(e);
    }
    return [...byDay.values()];
  }, [data, campus, now]);

  const total = groups.reduce((n, g) => n + g.events.length, 0);

  return (
    <div className="student-shell">
      <StudentHeader displayName={displayName} />
      <main id="main-content" className="student-content events-page">
        <section className="events-intro">
          <h1>Food at upcoming events</h1>
          <p>
            Student org events on BullsConnect in the next two weeks where the organizer tagged or mentioned food.
            Check the event page for details and RSVP rules.
          </p>
        </section>

        <div className="events-campus" role="group" aria-label="Campus">
          {CAMPUSES.map((c) => (
            <button
              key={c}
              type="button"
              className={`filter-chip${campus === c ? ' active' : ''}`}
              aria-pressed={campus === c}
              onClick={() => chooseCampus(c)}
            >
              {c === 'St Petersburg' ? 'St. Pete' : c}
            </button>
          ))}
        </div>

        {error && (
          <p className="events-notice" role="status">
            {error}
            {data?.events.length ? ' Showing the last list we loaded.' : ''}
          </p>
        )}

        {loading && !data && (
          <div className="events-loading" role="status" aria-live="polite">
            <span className="events-spinner" aria-hidden="true" />
            Checking BullsConnect for food…
          </div>
        )}

        {!loading && total === 0 && !error && (
          <div className="events-empty">
            <strong>No food events found{campus !== 'All' ? ` for ${campus}` : ''}.</strong>
            <span>Try another campus, or check back later — clubs add events all the time.</span>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.label} className="events-day" aria-label={group.label}>
            <h2>{group.label}</h2>
            <ul className="events-list">
              {group.events.map((e) => (
                <li key={e.id} className="event-card">
                  <div className="event-card-time">
                    {happeningNow(e, now) ? <span className="event-live">Happening now</span> : null}
                    <span className="num">{timeRange(e)}</span>
                  </div>
                  <h3>{e.title}</h3>
                  {e.club && <p className="event-club">{e.club}</p>}
                  <p className="event-where">
                    <MapPin size={16} aria-hidden="true" />
                    <span>{e.location ? shortLocation(e.location) : 'Location on BullsConnect'}</span>
                    {campus === 'All' && e.campus ? <span className="event-campus"> · {e.campus}</span> : null}
                  </p>
                  {e.summary && <p className="event-summary">{e.summary}</p>}
                  <div className="event-card-foot">
                    <span className="event-reason">
                      <Utensils size={14} aria-hidden="true" />
                      {e.reason === 'Tagged Food' ? 'Food tagged by organizer' : e.reason}
                    </span>
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="event-link">
                      View event<span className="sr-only"> {e.title} on BullsConnect (opens in new tab)</span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {data?.fetchedAt && total > 0 && (
          <p className="events-source">
            From BullsConnect · updated{' '}
            {new Date(data.fetchedAt).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </main>
      <StudentFooter />
    </div>
  );
}
