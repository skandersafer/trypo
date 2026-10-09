-- Dynamic data migration for Trypo
-- 1) invite_code column so app-created trips can be joined remotely
-- 2) RLS: allow authenticated users to read route/plan of PUBLIC trips
-- 3) seed published destinations + activities so Explore / community feel real

create extension if not exists citext;

alter table public.trips add column if not exists invite_code text;
create index if not exists trips_invite_code_idx on public.trips(invite_code);

-- Public trip destinations are visible to everyone signed in (opt-in via visibility = 'public')
drop policy if exists trip_destinations_read_public on public.trip_destinations;
create policy trip_destinations_read_public on public.trip_destinations for select to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = trip_id
      and (t.visibility = 'public' or t.owner_id = auth.uid() or (select private.is_trip_member(t.id)))
  ));

-- A public trip's plan (itinerary) is visible to everyone signed in
drop policy if exists itinerary_read_public on public.itinerary_items;
create policy itinerary_read_public on public.itinerary_items for select to authenticated
  using (exists (
    select 1 from public.trips t
    where t.id = trip_id
      and (t.visibility = 'public' or t.owner_id = auth.uid() or (select private.is_trip_member(t.id)))
  ));

-- ── Seed destinations ────────────────────────────────────────────────────────
insert into public.destinations (city, country, country_code, latitude, longitude, cover_image_url, description, tags, average_daily_budget, is_published) values
  ('Tunis',       'Tunisia',   'TN', 36.8065,  10.1815, 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=1200&h=700&fit=crop&auto=format', 'Medina, Carthage coast, and vibrant old city energy.',                            array['city','culture','beach'],     90,  true),
  ('Sousse',      'Tunisia',   'TN', 35.8256,  10.6084, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=700&fit=crop&auto=format', 'Seaside promenade, medina charm, and relaxed coastal days.',                       array['beach','city','relax'],        70,  true),
  ('Sfax',        'Tunisia',   'TN', 34.7406,  10.7603, 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=1200&h=700&fit=crop&auto=format', 'Historic harbor, market streets, and southern charm.',                              array['city','culture','harbor'],    60,  true),
  ('Cairo',       'Egypt',     'EG', 30.0444,  31.2357, 'https://images.unsplash.com/photo-1589739900243-4b52a6f3c3b8?w=1200&h=700&fit=crop&auto=format', 'Pyramids, desert landscapes, and unforgettable history.',                           array['history','culture','adventure'], 45, true),
  ('Marrakech',   'Morocco',   'MA', 31.6295,  -7.9811, 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=1200&h=700&fit=crop&auto=format', 'Souks, palaces, and the magic of the Red City.',                                     array['culture','food','adventure'],  55,  true),
  ('Casablanca',  'Morocco',   'MA', 33.5731,  -7.5898, 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=1200&h=700&fit=crop&auto=format', 'Modern coast, art deco, and the grand Hassan II mosque.',                            array['city','culture','beach'],      65,  true),
  ('Chefchaouen', 'Morocco',   'MA', 35.1712,  -5.2670, 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=1200&h=700&fit=crop&auto=format', 'The blue pearl of the Rif mountains.',                                               array['culture','relax'],             50,  true),
  ('Barcelona',   'Spain',     'ES', 41.3874,   2.1686, 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1200&h=700&fit=crop&auto=format', 'Gaudí architecture, tapas nights, and golden beaches.',                              array['city','culture','food'],       110, true),
  ('Paris',       'France',    'FR', 48.8566,   2.3522, 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200&h=700&fit=crop&auto=format', 'Monuments, cafés, and world-class art.',                                             array['city','culture','food'],       130, true),
  ('Tokyo',       'Japan',     'JP', 35.6762, 139.6503, 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1200&h=700&fit=crop&auto=format', 'Neon nights, temples, and the best food scene on earth.',                            array['city','food','culture'],       120, true),
  ('Bangkok',     'Thailand',  'TH', 13.7563, 100.5018, 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1200&h=700&fit=crop&auto=format', 'Street food, temples, and chaotic river life.',                                      array['food','culture','city'],        45, true),
  ('Denpasar',    'Indonesia', 'ID', -8.6705, 115.2126, 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&h=700&fit=crop&auto=format', 'Bali beaches, rice terraces, and island vibes.',                                     array['beach','relax','culture'],      55, true),
  ('Hanoi',       'Vietnam',   'VN', 21.0278, 105.8342, 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200&h=700&fit=crop&auto=format', 'Pasteur-era alleys, pho, and lake-side mornings.',                                   array['food','culture','city'],        35, true),
  ('Lisbon',      'Portugal',  'PT', 38.7223,  -9.1393, 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=1200&h=700&fit=crop&auto=format', 'Tram 28, sunset miradouros, and pastéis de nata.',                                   array['city','culture','food'],        90, true)
on conflict (city, country) do update set
  country_code = excluded.country_code,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  cover_image_url = excluded.cover_image_url,
  description = excluded.description,
  tags = excluded.tags,
  average_daily_budget = excluded.average_daily_budget,
  is_published = true;

-- ── Seed activities ───────────────────────────────────────────────────────────
create temp table if not exists seed_activities (
  city text,
  country text,
  title text,
  category text,
  description text,
  location_name text,
  cover_image_url text,
  estimated_cost numeric,
  currency text,
  duration_minutes integer
) on commit drop;

insert into seed_activities (city, country, title, category, description, location_name, cover_image_url, estimated_cost, currency, duration_minutes) values
  ('Tunis', 'Tunisia', 'Medina & Souk walk', 'activity', 'Wander the labyrinthine medina with a local guide, from Zitouna Mosque to the souks.', 'Tunis Medina', 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&h=600&fit=crop&auto=format', 25, 'USD', 180),
  ('Tunis', 'Tunisia', 'Carthage ruins tour', 'activity', 'Phoenician and Roman ruins on the seaside hill of Byrsa.', 'Carthage', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format', 15, 'USD', 150),
  ('Tunis', 'Tunisia', 'Seafood at the port', 'food', 'Fresh grilled sea bass with harissa at a portside restaurant.', 'La Goulette', 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&h=600&fit=crop&auto=format', 20, 'USD', 90),
  ('Sousse', 'Tunisia', 'Ribat & Sousse medina', 'activity', 'Climb the 8th-century Ribat for panoramic views of the medina and sea.', 'Sousse Medina', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format', 8, 'USD', 90),
  ('Sousse', 'Tunisia', 'Beach day at Boujaffar', 'activity', 'Golden sand, calm water, and beachfront cafés all afternoon.', 'Boujaffar Beach', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format', 0, 'USD', 240),
  ('Sfax', 'Tunisia', 'Sfax kasbah & market', 'activity', 'Spice-scented souks and the restored kasbah above the old city.', 'Sfax Kasbah', 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=800&h=600&fit=crop&auto=format', 5, 'USD', 120),
  ('Sfax', 'Tunisia', 'Kerkennah island boat trip', 'activity', 'Half-day ferry to the sleepy palm-shaded Kerkennah islands.', 'Sfax Port', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format', 18, 'USD', 300),
  ('Cairo', 'Egypt', 'Giza pyramids & plateau', 'activity', 'Sphinx, the Great Pyramid, and a camel ride at sunset.', 'Giza Plateau', 'https://images.unsplash.com/photo-1589739900243-4b52a6f3c3b8?w=800&h=600&fit=crop&auto=format', 30, 'USD', 240),
  ('Cairo', 'Egypt', 'Egyptian Museum', 'activity', 'Tutankhamen treasures and mummies in historic Tahrir Square.', 'Tahrir Square', 'https://images.unsplash.com/photo-1589739900243-4b52a6f3c3b8?w=800&h=600&fit=crop&auto=format', 12, 'USD', 180),
  ('Cairo', 'Egypt', 'Felucca on the Nile', 'activity', 'Late-afternoon sail on a wooden felucca with mint tea.', 'Nile Corniche', 'https://images.unsplash.com/photo-1589739900243-4b52a6f3c3b8?w=800&h=600&fit=crop&auto=format', 10, 'USD', 90),
  ('Marrakech', 'Morocco', 'Jemaa el-Fnaa night food', 'food', 'Grilled mezze, tagine, and orange juice under festival lights.', 'Jemaa el-Fnaa', 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&h=600&fit=crop&auto=format', 12, 'USD', 120),
  ('Marrakech', 'Morocco', 'Majorelle Garden', 'activity', 'Yves Saint Laurent''s cobalt-blue garden and Berber museum.', 'Marrakech', 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&h=600&fit=crop&auto=format', 15, 'USD', 90),
  ('Marrakech', 'Morocco', 'Agafay desert day trip', 'activity', 'Stone desert, Berber lunch, and evening campfire with music.', 'Agafay', 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&h=600&fit=crop&auto=format', 60, 'USD', 420),
  ('Casablanca', 'Morocco', 'Hassan II mosque', 'activity', 'Grand oceanfront mosque with Guided minaret visit.', 'Casablanca Corniche', 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=800&h=600&fit=crop&auto=format', 14, 'USD', 120),
  ('Casablanca', 'Morocco', 'Rick''s Café cocktail', 'food', 'Casablanca-themed dinner and live piano in a converted riad.', 'Anfa', 'https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=800&h=600&fit=crop&auto=format', 40, 'USD', 150),
  ('Chefchaouen', 'Morocco', 'Blue city photo walk', 'activity', 'Sunrise stroll through the blue-painted alleys and squares.', 'Old Medina', 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&h=600&fit=crop&auto=format', 0, 'USD', 120),
  ('Barcelona', 'Spain', 'Sagrada Família', 'activity', 'Gaudí''s unfinished basilica with lift access to the towers.', 'Eixample', 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=600&fit=crop&auto=format', 30, 'USD', 150),
  ('Barcelona', 'Spain', 'Tapas crawl in El Born', 'food', 'Five stops of pintxos and cava with a local food guide.', 'El Born', 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=600&fit=crop&auto=format', 35, 'USD', 180),
  ('Barcelona', 'Spain', 'Park Güell sunset', 'activity', 'Mosaic terraces overlooking the whole city at golden hour.', 'Gràcia', 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=600&fit=crop&auto=format', 12, 'USD', 120),
  ('Paris', 'France', 'Seine picnic at Champ de Mars', 'activity', 'Cheese, baguette, and wine on the lawn under the Eiffel Tower.', 'Champ de Mars', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=600&fit=crop&auto=format', 18, 'USD', 120),
  ('Paris', 'France', 'Louvre morning pass', 'activity', 'Mona Lisa and the antiquities wing before the crowds return.', 'Louvre', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=600&fit=crop&auto=format', 25, 'USD', 240),
  ('Paris', 'France', 'Café du Coin croissant run', 'food', 'Corner boulangerie, espresso at the zinc counter, people-watching.', 'Le Marais', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=600&fit=crop&auto=format', 8, 'USD', 45),
  ('Tokyo', 'Japan', 'Shibuya crossing & backstreets', 'activity', 'Neon crossing, tiny izakaya lanes, and Hachiko statue.', 'Shibuya', 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop&auto=format', 0, 'USD', 120),
  ('Tokyo', 'Japan', 'Tsukiji sushi breakfast', 'food', 'Omakase at dawn at the outer market.', 'Tsukiji', 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop&auto=format', 30, 'USD', 90),
  ('Tokyo', 'Japan', 'Senso-ji temple at golden hour', 'activity', 'Lantern-lit temple grounds and Nakamise street snacks.', 'Asakusa', 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop&auto=format', 0, 'USD', 90),
  ('Bangkok', 'Thailand', 'Grand Palace & Wat Pho', 'activity', 'Emerald Buddha, gold stupas, and the reclining Buddha.', 'Rattanakosin', 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&h=600&fit=crop&auto=format', 18, 'USD', 180),
  ('Bangkok', 'Thailand', 'Street food at Chinatown', 'food', 'Pad thai, mango sticky rice, and grilled river prawns.', 'Yaowarat', 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&h=600&fit=crop&auto=format', 10, 'USD', 120),
  ('Bangkok', 'Thailand', 'Boat through the khlongs', 'activity', 'Long-tail boat past stilt houses and floating markets.', 'Thonburi klongs', 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&h=600&fit=crop&auto=format', 12, 'USD', 90),
  ('Denpasar', 'Indonesia', 'Uluwatu sunset temple', 'activity', 'Clifftop temple, kecak fire dance, ocean views.', 'Uluwatu', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop&auto=format', 8, 'USD', 150),
  ('Denpasar', 'Indonesia', 'Tegalalang rice terraces', 'activity', 'Morning walk through emerald terraces and jungle swings.', 'Ubud', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop&auto=format', 6, 'USD', 120),
  ('Denpasar', 'Indonesia', 'Beach club chill', 'food', 'Daybed, smoothie bowl, and sea breeze until sunset.', 'Canggu', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop&auto=format', 15, 'USD', 180),
  ('Hanoi', 'Vietnam', 'Old Quarter pho tour', 'food', 'Early-morning pho crawl across three legendary broth shops.', 'Old Quarter', 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&h=600&fit=crop&auto=format', 8, 'USD', 120),
  ('Hanoi', 'Vietnam', 'Hoan Kiem sunrise', 'activity', 'Lake loop, Ngoc Son temple, and coffee on the water''s edge.', 'Hoan Kiem', 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&h=600&fit=crop&auto=format', 0, 'USD', 60),
  ('Hanoi', 'Vietnam', 'Ha Long Bay day cruise', 'activity', 'Karst islands, cave swim, and seafood lunch on a junk boat.', 'Ha Long Bay', 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&h=600&fit=crop&auto=format', 55, 'USD', 480),
  ('Lisbon', 'Portugal', 'Tram 28 to Alfama', 'activity', 'Rattle through the fado quarter and São Jorge castle.', 'Alfama', 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&h=600&fit=crop&auto=format', 3, 'USD', 120),
  ('Lisbon', 'Portugal', 'Pastéis de Nata at Belém', 'food', 'Custard tarts fresh from the monastery bakery, dusted with cinnamon.', 'Belém', 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&h=600&fit=crop&auto=format', 5, 'USD', 45),
  ('Lisbon', 'Portugal', 'Miradouro sunset', 'activity', 'Sunset over the red rooftops and the Tagus from São Pedro.', 'Graça', 'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&h=600&fit=crop&auto=format', 0, 'USD', 60);

insert into public.activities (destination_id, title, category, description, location_name, cover_image_url, estimated_cost, currency, duration_minutes, is_published)
select d.id, s.title, s.category, s.description, s.location_name, s.cover_image_url, s.estimated_cost, s.currency, s.duration_minutes, true
from seed_activities s
join public.destinations d on d.city = s.city and d.country = s.country
where not exists (
  select 1 from public.activities a where a.destination_id = d.id and a.title = s.title
);