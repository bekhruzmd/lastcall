import { describe, expect, it } from 'vitest';
import { foodEventsFromIcs, foodReason, locationsFromMobileFeed, parseIcsDate } from './campusEvents';

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'ORGANIZER;CN="Latin Dance Club":mailto:noreply@example.edu',
  'CATEGORIES;X-CG-CATEGORY=event_tags:Food,Campus - Tampa ,Seniors',
  'DTSTART:20261121T230000Z',
  'DTEND:20261122T010000Z',
  'UID:a1@campusgroups.com',
  'SUMMARY;ENCODING=QUOTED-PRINTABLE:Social Night =E2=80=93 Salsa',
  'LOCATION:MSC 2708',
  'URL:https://bullsconnect.usf.edu/rsvp?id=111',
  'DESCRIPTION:Come dance!\\nWe will have a long description that is fol',
  ' ded across two lines.\\n---\\nEvent Details: https://bullsconnect.usf.edu/rsvp?id=111',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'ORGANIZER;CN="Investment Club":mailto:noreply@example.edu',
  'CATEGORIES;X-CG-CATEGORY=event_tags:Academic,Campus - St Petersburg',
  'DTSTART;TZID=America/New_York:20261123T190000',
  'DTEND;TZID=America/New_York:20261123T210000',
  'UID:a2@campusgroups.com',
  'SUMMARY:Cookies & Equities',
  'LOCATION: Sign in to download the location',
  'URL:https://bullsconnect.usf.edu/rsvp?id=222',
  'DESCRIPTION:Talk about markets.',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'CATEGORIES;X-CG-CATEGORY=event_tags:Service',
  'DTSTART:20261122T150000Z',
  'DTEND:20261122T170000Z',
  'UID:a3@campusgroups.com',
  'SUMMARY:Canned Food Drive',
  'DESCRIPTION:Bring canned goods. Pizza for volunteers!',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261001T150000Z',
  'DTEND:20261001T170000Z',
  'UID:old@campusgroups.com',
  'SUMMARY:Old pizza party',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20270301T150000Z',
  'DTEND:20270301T170000Z',
  'UID:far@campusgroups.com',
  'SUMMARY:Far-future pizza party',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const now = new Date('2026-11-21T15:00:00Z');

describe('foodEventsFromIcs', () => {
  const events = foodEventsFromIcs(ics, now);

  it('keeps upcoming food events in the window, sorted, and drops drives, past and far-future events', () => {
    expect(events.map((e) => e.id)).toEqual(['a1@campusgroups.com', 'a2@campusgroups.com']);
  });

  it('decodes quoted-printable titles, unfolds lines and reads the organizer, campus and id', () => {
    const [social] = events;
    expect(social.title).toBe('Social Night – Salsa');
    expect(social.summary).toContain('folded across two lines');
    expect(social.summary).not.toContain('Event Details');
    expect(social.club).toBe('Latin Dance Club');
    expect(social.campus).toBe('Tampa');
    expect(social.eventId).toBe('111');
    expect(social.reason).toBe('Tagged Food');
    expect(social.location).toBe('MSC 2708');
  });

  it('matches food words, hides "sign in" locations and converts Eastern local time', () => {
    const cookies = events[1];
    expect(cookies.reason).toBe('Mentions cookies');
    expect(cookies.location).toBeNull();
    expect(cookies.campus).toBe('St Petersburg');
    expect(cookies.start).toBe('2026-11-24T00:00:00.000Z'); // 7 PM EST
  });
});

describe('helpers', () => {
  it('parses EDT dates with the summer offset', () => {
    expect(parseIcsDate('20260715T120000', 'TZID=America/New_York')?.toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('does not treat volunteering as free food', () => {
    expect(foodReason('Volunteer at the food bank', 'Lunch provided for volunteers', ['Food'])).toBeNull();
  });

  it('reads locations from the mobile feed and skips private ones', () => {
    const map = locationsFromMobileFeed([
      { fields: 'eventId,eventLocation', p0: '222', p1: 'CIS 1048' },
      { fields: 'eventId,eventLocation', p0: '333', p1: 'Private Location (sign in to display)' },
    ]);
    expect(map.get('222')).toBe('CIS 1048');
    expect(map.has('333')).toBe(false);
  });
});
