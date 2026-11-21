-- 200 lottery runs, 1 portion each, between a device with 3 recent wins
-- and a device with none. Weights are 0.25 vs 1, so "fresh" should win ~80%.
do $$
declare
  i int; pid uuid; fresh_wins int := 0;
begin
  insert into profiles (device_id, display_name) values ('w-fresh', 'Fresh'), ('w-regular', 'Regular')
    on conflict do nothing;
  -- 3 recent wins for the regular (one per post: device+post is unique).
  for i in 1..3 loop
    insert into posts (org_name, title, building, portions_total, portions_left, poster_device_id,
                       lottery_ends_at, expires_at, status)
    values ('History', 'h' || i, 'Library (LIB)', 1, 0, 'x', now(), now() + interval '1 day', 'closed')
    returning id into pid;
    insert into claims (post_id, device_id, display_name, status) values (pid, 'w-regular', 'Regular', 'picked_up');
  end loop;

  for i in 1..200 loop
    insert into posts (org_name, title, building, portions_total, portions_left, poster_device_id,
                       lottery_ends_at, expires_at, status)
    values ('Lottery', 'run ' || i, 'Library (LIB)', 1, 1, 'x',
            now() + interval '1 hour', now() + interval '2 hours', 'lottery')
    returning id into pid;
    insert into claims (post_id, device_id, display_name, status) values
      (pid, 'w-fresh', 'Fresh', 'pending'), (pid, 'w-regular', 'Regular', 'pending');
    update posts set lottery_ends_at = now() - interval '1 second' where id = pid;
    perform resolve_lottery(pid);
    if exists (select 1 from claims where post_id = pid and device_id = 'w-fresh' and status = 'won') then
      fresh_wins := fresh_wins + 1;
    end if;
    -- Keep history fixed: drop this run's results from the 7-day counts.
    delete from posts where id = pid;
  end loop;

  raise notice 'fresh won % of 200 (expected about 160)', fresh_wins;
  if fresh_wins < 130 then raise exception 'FAIL: weighting not visible'; end if;
  raise notice 'PASS';
end $$;
