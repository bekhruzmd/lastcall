-- Device ids act as each student's secret (they unlock get_claim and get_profile),
-- so they must never be readable from the public claims table.
-- Expose a one-way hash instead; clients filter their own claims by it.

create or replace function public.device_hash(p_device_id text)
returns text language sql immutable strict parallel safe as $$
  select encode(sha256(convert_to(p_device_id, 'UTF8')), 'hex');
$$;

alter table public.claims
  add column device_hash text generated always as (public.device_hash(device_id)) stored;

create index claims_device_hash_idx on public.claims (device_hash);

revoke select on public.claims from anon, authenticated;
grant select (id, post_id, device_hash, display_name, status, created_at, picked_up_at)
  on public.claims to anon, authenticated;

-- Same for the officer's device id on posts.
alter table public.posts
  add column poster_hash text generated always as (public.device_hash(poster_device_id)) stored;

revoke select on public.posts from anon, authenticated;
grant select (id, org_name, title, building, room, portions_total, portions_left, diet_tags, photo_url,
              poster_hash, created_at, lottery_ends_at, expires_at, status)
  on public.posts to anon, authenticated;
