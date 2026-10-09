import { getSupabaseEnv, supabaseRest, supabaseUpsert } from "../_supabase.js";

// Dev-only in-memory fallback (Vercel serverless has no shared memory —
// each cold start gets a fresh store). Production reads/writes Supabase
// `trips` table when SUPABASE_URL + ANON_KEY are configured in Vercel env.
let memoryStore = null;

function normalizeTrips(input) {
  let trips = input;
  if (typeof trips === "string") {
    try {
      trips = JSON.parse(trips);
    } catch {
      return null;
    }
  }
  if (trips && !Array.isArray(trips) && Array.isArray(trips.trips)) {
    trips = trips.trips;
  }
  return Array.isArray(trips) ? trips : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const supa = getSupabaseEnv();

  if (req.method === "POST") {
    try {
      const trips = normalizeTrips(req.body);
      if (!trips) return res.status(400).json({ error: "Invalid trips format" });

      if (supa) {
        try {
          await supabaseUpsert(supa, "trips", trips);
          return res.status(200).json({ success: true, count: trips.length, backend: "supabase" });
        } catch (e) {
          console.warn("[api/trips] supabase upsert failed, using memory:", e?.message);
        }
      }
      memoryStore = trips;
      return res.status(200).json({ success: true, count: trips.length, backend: "memory" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "GET") {
    if (supa) {
      try {
        const rows = await supabaseRest(supa, "trips", { select: "*", filters: "order=created_at.desc&limit=200" });
        return res.status(200).json(rows);
      } catch (e) {
        console.warn("[api/trips] supabase read failed, using memory:", e?.message);
      }
    }
    return res.status(200).json(memoryStore || []);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
