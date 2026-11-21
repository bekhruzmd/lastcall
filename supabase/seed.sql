-- Demo data: 3 clubs, 2 active posts, 6 profiles with varied win history.

insert into profiles (device_id, display_name, priority) values
  ('demo-ana', 'Ana', false),
  ('demo-marcus', 'Marcus', false),
  ('demo-priya', 'Priya', true),
  ('demo-diego', 'Diego', false),
  ('demo-lena', 'Lena', false),
  ('demo-kofi', 'Kofi', false)
on conflict (device_id) do nothing;

-- Past pickups (last 7 days): Ana 3, Marcus 2, Priya 1, others 0.
do $$
declare pid uuid; d record; i int;
begin
  for d in select * from (values ('demo-ana', 'Ana', 3), ('demo-marcus', 'Marcus', 2), ('demo-priya', 'Priya', 1))
           as t(device_id, name, wins) loop
    for i in 1..d.wins loop
      insert into posts (org_name, title, building, room, portions_total, portions_left, poster_device_id,
                         created_at, lottery_ends_at, expires_at, status)
      values ('Society of Women Engineers', 'Bagels', 'Engineering Building II (ENB)', '109', 10, 0, 'demo-officer',
              now() - make_interval(days => i), now() - make_interval(days => i),
              now() - make_interval(days => i) + interval '30 minutes', 'expired')
      returning id into pid;
      insert into claims (post_id, device_id, display_name, status, created_at, picked_up_at)
      values (pid, d.device_id, d.name, 'picked_up', now() - make_interval(days => i), now() - make_interval(days => i));
    end loop;
  end loop;
end $$;

-- Two active posts.
insert into posts (org_name, title, building, room, portions_total, portions_left, diet_tags, poster_device_id,
                   lottery_ends_at, expires_at, status)
values
  ('SHPE', '12 slices cheese pizza', 'Engineering Building II (ENB)', '109', 12, 12, '{vegetarian}', 'demo-officer',
   now() - interval '1 minute', now() + interval '30 minutes', 'open'),
  ('Muslim Student Association', 'Chicken shawarma wraps', 'Marshall Student Center (MSC)', '2708', 8, 8, '{halal}',
   'demo-officer', now() - interval '1 minute', now() + interval '60 minutes', 'open');
