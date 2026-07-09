-- Store the coordinates of an event's location so events can be plotted on
-- the trip map. Locations are picked from geocoder suggestions in the UI, so
-- both columns are set together with the location text (or all three are null).
alter table public.trip_events
  add column location_lat double precision,
  add column location_lng double precision;
