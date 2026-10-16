-- Universal GPS for destinations: every ville/city worldwide pins exactly.
-- trip_destinations previously stored only city/country names, forcing every
-- map to re-guess coordinates by name (Pai -> Indonesia homonym bug).
alter table public.trip_destinations
  add column if not exists lat double precision,
  add column if not exists lng double precision;
