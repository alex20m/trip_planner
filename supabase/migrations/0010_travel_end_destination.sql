-- A travel event is a leg between two places, so it needs an end destination
-- next to the existing location (the start). Like location/location_lat/
-- location_lng, the end destination is picked from geocoder suggestions in
-- the UI, so the coordinate columns are set together with the text (or all
-- three are null). Non-travel events leave all three null.
alter table public.trip_events
  add column end_location text,
  add column end_location_lat double precision,
  add column end_location_lng double precision;
