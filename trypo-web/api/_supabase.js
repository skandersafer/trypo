// Shared Supabase helper for Vercel serverless /api functions.
// Reads server-only env first, falls back to VITE_ names for migration.
// Returns null when not configured — callers must fall back to memory/dev store.

export function getSupabaseEnv() {
  const url =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

// Minimal PostgREST client (no dependency — keeps serverless bundle small).
export async function supabaseRest(env, table, { select = "*", filters = "" } = {}) {
  const res = await fetch(
    `${env.url}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? `&${filters}` : ""}`,
    {
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) throw new Error(`Supabase ${table} GET ${res.status}`);
  return res.json();
}

export async function supabaseUpsert(env, table, rows) {
  const res = await fetch(`${env.url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase ${table} POST ${res.status}`);
  return res;
}
