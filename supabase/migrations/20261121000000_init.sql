-- Leftover Bulls schema (CONTRACT.md §4, §6)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  device_id    text primary key,
  display_name text not null check (char_length(display_name) between 1 and 20),
  diet_prefs   text[] not null default '{}',
  priority     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  org_name         text not null check (char_length(org_name) between 1 and 60),
  title            text not null check (char_length(title) between 1 and 80),
  building         text not null,
  room             text not null default '',
  portions_total   int  not null check (portions_total between 1 and 200),
  portions_left    int  not null check (portions_left >= 0),
  diet_tags        text[] not null default '{}',
  photo_url        text,
  poster_device_id text not null,
  created_at       timestamptz not null default now(),
  lottery_ends_at  timestamptz not null,
  expires_at       timestamptz not null,
  status           text not null default 'lottery'
                   check (status in ('lottery', 'open', 'closed', 'expired')),
  check (portions_left <= portions_total)
);

create index posts_active_idx on public.posts (status, expires_at)
  where status in ('lottery', 'open');

create table public.claims (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  device_id    text not null,
  display_name text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'won', 'lost', 'picked_up', 'expired')),
  created_at   timestamptz not null default now(),
  picked_up_at timestamptz,
  unique (post_id, device_id)
);

-- Ticket code + signature live apart from claims so Realtime (which streams
-- whole claims rows to every subscriber) can never leak someone's ticket.
-- Written only by the sign-ticket Edge Function (service role).
create table public.ticket_secrets (
  claim_id    uuid primary key references public.claims (id) on delete cascade,
  ticket_code text not null check (ticket_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  ticket_sig  text not null,
  created_at  timestamptz not null default now()
);

create index claims_post_idx on public.claims (post_id);
create index claims_device_idx on public.claims (device_id, created_at);

-- ---------------------------------------------------------------- RLS
-- Reads: posts are public. Claims are readable through a view that hides
-- ticket_sig. Profiles are never read directly (priority is private).
-- All writes go through the security definer functions below.

alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.claims   enable row level security;
alter table public.ticket_secrets enable row level security;

create policy posts_read on public.posts for select using (true);
create policy claims_read on public.claims for select using (true);

revoke all on public.profiles from anon, authenticated;
revoke all on public.posts    from anon, authenticated;
revoke all on public.claims   from anon, authenticated;
grant select on public.posts to anon, authenticated;
revoke all on public.ticket_secrets from anon, authenticated;
grant select on public.claims to anon, authenticated;

-- ---------------------------------------------------------------- helpers

create or replace function public.wins_last_7_days(p_device_id text)
returns int language sql stable as $$
  select count(*)::int from public.claims
  where device_id = p_device_id
    and status in ('won', 'picked_up')
    and created_at >= now() - interval '7 days';
$$;

-- ---------------------------------------------------------------- profiles

create or replace function public.upsert_profile(
  p_device_id text, p_display_name text, p_diet_prefs text[] default null, p_priority boolean default null
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  insert into profiles (device_id, display_name, diet_prefs, priority)
  values (p_device_id, left(p_display_name, 20), coalesce(p_diet_prefs, '{}'), coalesce(p_priority, false))
  on conflict (device_id) do update set
    display_name = coalesce(left(excluded.display_name, 20), profiles.display_name),
    diet_prefs   = coalesce(p_diet_prefs, profiles.diet_prefs),
    priority     = coalesce(p_priority, profiles.priority)
  returning * into r;
  return r;
end $$;

-- Returns the caller's own profile (including priority) or nothing.
create or replace function public.get_profile(p_device_id text)
returns setof public.profiles
language sql security definer set search_path = public as $$
  select * from profiles where device_id = p_device_id;
$$;

-- ---------------------------------------------------------------- posts

create or replace function public.create_post(
  p_org_name text, p_title text, p_building text, p_room text,
  p_portions int, p_diet_tags text[], p_duration_min int,
  p_poster_device_id text, p_lottery_seconds int, p_photo_url text default null
) returns public.posts
language plpgsql security definer set search_path = public as $$
declare r public.posts;
begin
  if p_duration_min not in (15, 30, 60) then raise exception 'bad duration'; end if;
  if p_lottery_seconds not in (20, 45) then raise exception 'bad lottery window'; end if;
  insert into posts (org_name, title, building, room, portions_total, portions_left, diet_tags,
                     photo_url, poster_device_id, lottery_ends_at, expires_at)
  values (p_org_name, p_title, p_building, coalesce(p_room, ''), p_portions, p_portions,
          coalesce(p_diet_tags, '{}'), p_photo_url, p_poster_device_id,
          now() + make_interval(secs => p_lottery_seconds),
          now() + make_interval(mins => p_duration_min))
  returning * into r;
  return r;
end $$;

create or replace function public.close_post(p_post_id uuid)
returns void language sql security definer set search_path = public as $$
  update posts set status = 'closed' where id = p_post_id and status in ('lottery', 'open');
$$;

create or replace function public.expire_due_posts()
returns void language plpgsql security definer set search_path = public as $$
begin
  with due as (
    update posts set status = 'expired'
    where status in ('lottery', 'open', 'closed') and expires_at <= now() and status <> 'expired'
    returning id
  )
  update claims set status = 'expired'
  where post_id in (select id from due) and status = 'won';
end $$;

-- ---------------------------------------------------------------- lottery

-- Idempotent. Weighted random draw without replacement (CONTRACT §6.2):
-- weight = 1 / (1 + wins_last_7_days), x2 if priority.
-- Uses Efraimidis–Spirakis keys: key = random()^(1/weight), take the top N.
create or replace function public.resolve_lottery(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p posts;
declare n_won int;
begin
  select * into p from posts where id = p_post_id for update;
  if not found or p.status <> 'lottery' or now() < p.lottery_ends_at then
    return;
  end if;

  with entrants as (
    select c.id,
           (1.0 / (1 + wins_last_7_days(c.device_id)))
             * (case when coalesce(pr.priority, false) then 2 else 1 end) as w
    from claims c left join profiles pr on pr.device_id = c.device_id
    where c.post_id = p_post_id and c.status = 'pending'
  ), ranked as (
    select id, power(random(), 1.0 / w) as k from entrants
    order by k desc
    limit p.portions_left
  )
  update claims set status = 'won' where id in (select id from ranked);
  get diagnostics n_won = row_count;

  update claims set status = 'lost' where post_id = p_post_id and status = 'pending';

  update posts set
    portions_left = portions_left - n_won,
    status = case when portions_left - n_won > 0 then 'open' else 'closed' end
  where id = p_post_id;
end $$;

-- ---------------------------------------------------------------- claim

-- Returns the claim row, or raises: NONE_LEFT, ALREADY_CLAIMED, POST_CLOSED.
create or replace function public.claim(p_post_id uuid, p_device_id text)
returns setof public.claims
language plpgsql security definer set search_path = public as $$
declare p posts;
declare r claims;
declare v_name text;
begin
  perform resolve_lottery(p_post_id);
  perform expire_due_posts();

  select coalesce((select display_name from profiles where device_id = p_device_id), 'Guest') into v_name;

  if exists (select 1 from claims where post_id = p_post_id and device_id = p_device_id) then
    raise exception 'ALREADY_CLAIMED';
  end if;

  select * into p from posts where id = p_post_id;
  if not found or p.status in ('closed', 'expired') then
    raise exception 'POST_CLOSED';
  end if;

  if p.status = 'lottery' then
    insert into claims (post_id, device_id, display_name, status)
    values (p_post_id, p_device_id, v_name, 'pending')
    returning * into r;
    return next r;
    return;
  end if;

  -- Open phase: atomic decrement. The conditional UPDATE takes a row lock,
  -- so concurrent callers serialize here and never over-give.
  update posts set
    portions_left = portions_left - 1,
    status = case when portions_left - 1 = 0 then 'closed' else status end
  where id = p_post_id and status = 'open' and portions_left > 0;
  if not found then
    raise exception 'NONE_LEFT';
  end if;

  insert into claims (post_id, device_id, display_name, status)
  values (p_post_id, p_device_id, v_name, 'won')
  returning * into r;
  return next r;
exception
  when unique_violation then raise exception 'ALREADY_CLAIMED';
end $$;

-- Own claim with its ticket (for the ticket screen). Joins the post's expiry.
create or replace function public.get_claim(p_claim_id uuid, p_device_id text)
returns table (
  id uuid, post_id uuid, device_id text, display_name text, status text,
  created_at timestamptz, picked_up_at timestamptz,
  ticket_code text, ticket_sig text, expires_at timestamptz
)
language sql security definer set search_path = public as $$
  select c.id, c.post_id, c.device_id, c.display_name, c.status, c.created_at, c.picked_up_at,
         t.ticket_code, t.ticket_sig, p.expires_at
  from claims c
  join posts p on p.id = c.post_id
  left join ticket_secrets t on t.claim_id = c.id
  where c.id = p_claim_id and c.device_id = p_device_id;
$$;

create or replace function public.mark_picked_up(p_claim_id uuid, p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c claims;
begin
  select * into c from claims where id = p_claim_id for update;
  if not found or c.post_id <> p_post_id then raise exception 'WRONG_POST'; end if;
  if c.status = 'picked_up' then raise exception 'ALREADY_PICKED_UP'; end if;
  if c.status <> 'won' then raise exception 'NOT_VALID'; end if;
  update claims set status = 'picked_up', picked_up_at = now() where id = p_claim_id;
end $$;

-- Look up a won claim by its 6-char code (manual fallback in the officer view).
create or replace function public.find_claim_by_code(p_post_id uuid, p_code text)
returns setof public.claims
language sql security definer set search_path = public as $$
  select c.* from claims c join ticket_secrets t on t.claim_id = c.id
  where c.post_id = p_post_id and t.ticket_code = upper(p_code);
$$;

create or replace function public.impact_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'mealsRescued', (select count(*) from claims where status = 'picked_up'),
    'activePosts',  (select count(*) from posts where status in ('lottery', 'open') and expires_at > now()),
    'clubsActive',  (select count(distinct org_name) from posts where status in ('lottery', 'open') and expires_at > now())
  );
$$;

create or replace function public.recent_pickups(p_limit int default 10)
returns table (display_name text, org_name text, picked_up_at timestamptz)
language sql security definer set search_path = public as $$
  select c.display_name, p.org_name, c.picked_up_at
  from claims c join posts p on p.id = c.post_id
  where c.status = 'picked_up'
  order by c.picked_up_at desc
  limit p_limit;
$$;

-- Function access for the anon role.
revoke execute on all functions in schema public from public;
grant execute on function
  public.upsert_profile(text, text, text[], boolean),
  public.get_profile(text),
  public.create_post(text, text, text, text, int, text[], int, text, int, text),
  public.close_post(uuid),
  public.expire_due_posts(),
  public.resolve_lottery(uuid),
  public.claim(uuid, text),
  public.get_claim(uuid, text),
  public.mark_picked_up(uuid, uuid),
  public.find_claim_by_code(uuid, text),
  public.impact_stats(),
  public.recent_pickups(int)
to anon, authenticated;

-- ---------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.posts, public.claims;
