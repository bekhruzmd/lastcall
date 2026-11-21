// Parses the BullsConnect (CampusGroups) iCal feed and picks out upcoming
// events that will have food. Plain TypeScript: runs in the Edge Function
// and in unit tests.

export interface FoodEvent {
  id: string;
  title: string;
  club: string;
  start: string; // ISO
  end: string; // ISO
  location: string | null;
  /** "Tampa", "St Petersburg", "Sarasota-Manatee", "Off campus" or null if untagged. */
  campus: string | null;
  url: string;
  /** BullsConnect event id (from the rsvp URL), used to merge locations. */
  eventId: string | null;
  /** Why we think there is food, e.g. "Tagged Food" or "Mentions pizza". */
  reason: string;
  /** Short plain-text excerpt of the description. */
  summary: string;
}

interface RawEvent {
  [key: string]: { params: string; value: string }[];
}

/** Undo RFC 5545 line folding and split into VEVENT property maps. */
export function parseIcs(text: string): RawEvent[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi = head.indexOf(';');
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? '' : head.slice(semi + 1);
    (cur[name] ??= []).push({ params, value });
  }
  return events;
}

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  const soft = s.replace(/=\n/g, '');
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === '=' && /^[0-9A-F]{2}$/i.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(soft[i]));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function text(ev: RawEvent, name: string): string {
  const p = ev[name]?.[0];
  if (!p) return '';
  let v = p.value;
  if (/ENCODING=QUOTED-PRINTABLE/i.test(p.params)) v = decodeQuotedPrintable(v);
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

/** Parse DTSTART/DTEND. Supports UTC (Z), floating/TZID local (treated as America/New_York), and DATE. */
export function parseIcsDate(value: string, params = ''): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  // Local Tampa time. Work out the Eastern offset for that date.
  const guess = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  const tz = /TZID=([^;:]+)/.exec(params)?.[1] ?? 'America/New_York';
  let offsetMin = -300;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(guess)
      .find((p) => p.type === 'timeZoneName')?.value;
    const om = parts?.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (om) offsetMin = +om[1] * 60 + Math.sign(+om[1]) * +(om[2] ?? 0);
  } catch {
    /* keep EST */
  }
  return new Date(guess.getTime() - offsetMin * 60_000);
}

const FOOD_WORDS =
  /\b(free food|food (?:will be )?provided|food and drinks?|refreshments|snacks|pizza|lunch|dinner|breakfast|brunch|tacos?|bbq|barbecue|cater(?:ed|ing)|donuts?|bagels?|ice cream|cookies|boba|wings|sandwich(?:es)?|potluck|cookout|empanadas|pancakes?)\b/i;
const NOT_FOR_EATING =
  /\b(food drive|donation drive|canned (?:food|goods)|volunteer(?:ing)?|food bank shift|bake sale|fundraiser)\b/i;

export function foodReason(title: string, description: string, tags: string[]): string | null {
  const blob = `${title}\n${description}`;
  if (NOT_FOR_EATING.test(blob)) return null;
  if (tags.some((t) => t.trim().toLowerCase() === 'food')) return 'Tagged Food';
  const m = blob.match(FOOD_WORDS);
  return m ? `Mentions ${m[1].toLowerCase()}` : null;
}

function excerpt(description: string): string {
  // BullsConnect appends "--- Event Details: <url>" and similar boilerplate.
  const body = description.split(/\n?-{3,}/)[0];
  const flat = body.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > 180 ? flat.slice(0, 177).trimEnd() + '…' : flat;
}

export function foodEventsFromIcs(ics: string, now: Date, days = 14): FoodEvent[] {
  const horizon = now.getTime() + days * 86_400_000;
  const out: FoodEvent[] = [];
  for (const ev of parseIcs(ics)) {
    const startP = ev.DTSTART?.[0];
    if (!startP) continue;
    const start = parseIcsDate(startP.value, startP.params);
    const endP = ev.DTEND?.[0];
    const end = endP ? parseIcsDate(endP.value, endP.params) : start;
    if (!start || !end) continue;
    if (end.getTime() < now.getTime() || start.getTime() > horizon) continue;

    const title = text(ev, 'SUMMARY');
    const description = text(ev, 'DESCRIPTION');
    const tags = (ev.CATEGORIES ?? [])
      .filter((c) => /event_tags/i.test(c.params) || /^event_tags:/i.test(c.value))
      .flatMap((c) => c.value.replace(/^event_tags:/i, '').split(','));
    const reason = foodReason(title, description, tags);
    if (!reason) continue;

    const organizer = ev.ORGANIZER?.[0]?.params.match(/CN="?([^";:]+)"?/)?.[1] ?? '';
    const loc = text(ev, 'LOCATION');
    const url = text(ev, 'URL');
    const campusTag = tags.map((t) => t.trim()).find((t) => /^campus - |^off campus$/i.test(t));
    const campus = campusTag ? (/^off campus$/i.test(campusTag) ? 'Off campus' : campusTag.replace(/^campus - /i, '')) : null;
    out.push({
      id: text(ev, 'UID') || `${title}-${start.toISOString()}`,
      title,
      club: organizer,
      start: start.toISOString(),
      end: end.toISOString(),
      location: loc && !/sign in/i.test(loc) ? loc : null,
      campus,
      url,
      eventId: url.match(/[?&]id=(\d+)/)?.[1] ?? null,
      reason,
      summary: excerpt(description),
    });
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

/**
 * The mobile JSON feed shows some locations the iCal feed hides.
 * Each row is {fields: "a,b,c", p0, p1, p2...}; returns eventId -> location.
 */
export function locationsFromMobileFeed(rows: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows as Record<string, unknown>[]) {
    const fields = String(row.fields ?? '').split(',');
    const get = (name: string) => {
      const i = fields.indexOf(name);
      return i < 0 ? null : (row[`p${i}`] as string | null);
    };
    const id = get('eventId');
    const loc = get('eventLocation')?.trim();
    if (id && loc && !/sign in|private location/i.test(loc)) out.set(id, loc);
  }
  return out;
}
