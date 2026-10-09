import { getSupabaseEnv, supabaseRest } from "../_supabase.js";

// GET /api/trips/join?code=XXX — find a trip by invite code.
// Production: queries Supabase `trips` table. Dev fallback: memory (always
// empty after cold start — use local Vite dev server for join-by-code tests).

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { code } = req.query;

  if (req.method === "GET") {
    if (!code) {
      return res.status(400).json({ error: "Missing code" });
    }
    const cleanCode = String(code).trim().toUpperCase();
    const supa = getSupabaseEnv();

    if (supa) {
      try {
        // invite_code exact match (case-insensitive via ilike).
        const rows = await supabaseRest(supa, "trips", {
          select: "*",
          filters: `invite_code=ilike.${encodeURIComponent(cleanCode)}&limit=1`,
        });
        if (rows?.[0]) return res.status(200).json({ success: true, trip: rows[0] });
        // Fallback: fetch recent and match id/title client-side logic.
        const recent = await supabaseRest(supa, "trips", {
          select: "*",
          filters: "order=created_at.desc&limit=200",
        });
        const trip = (recent || []).find(
          (t) =>
            (t.invite_code && String(t.invite_code).toUpperCase() === cleanCode) ||
            (t.id && String(t.id).toUpperCase() === cleanCode) ||
            (t.title && String(t.title).toUpperCase().replace(/\s+/g, "") === cleanCode.replace(/\s+/g, ""))
        );
        if (trip) return res.status(200).json({ success: true, trip });
        return res.status(404).json({ success: false, message: "Trip not found" });
      } catch (e) {
        console.warn("[api/trips/join] supabase failed:", e?.message);
        return res.status(500).json({ success: false, message: "Backend unavailable" });
      }
    }
    // No Supabase configured — memory store cannot survive serverless cold starts.
    return res.status(404).json({
      success: false,
      message: "Trip not found (no shared backend configured). Set SUPABASE_URL + SUPABASE_ANON_KEY in Vercel.",
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
