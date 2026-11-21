#!/usr/bin/env bash
# Fires 20 concurrent claims at an open post with 5 portions.
# Passes when exactly 5 win and portions_left ends at 0.
# Needs PGHOST/PGPORT/PGUSER/PGDATABASE pointing at a database with the migration applied.
set -euo pipefail

post_id=$(psql -tAq -c "
  insert into posts (org_name, title, building, room, portions_total, portions_left,
                     poster_device_id, lottery_ends_at, expires_at, status)
  values ('Test', 'Race test', 'Library (LIB)', '1', 5, 5, 'officer',
          now() - interval '1 minute', now() + interval '30 minutes', 'open')
  returning id;")

for i in $(seq 1 20); do
  psql -tAq -c "select status from claim('$post_id', 'race-device-$i');" >/dev/null 2>&1 &
done
wait

won=$(psql -tAq -c "select count(*) from claims where post_id = '$post_id' and status = 'won';")
left=$(psql -tAq -c "select portions_left from posts where id = '$post_id';")
echo "won=$won portions_left=$left"
if [ "$won" = "5" ] && [ "$left" = "0" ]; then echo "PASS"; else echo "FAIL"; exit 1; fi
