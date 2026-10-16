import { supabase, isSupabaseConfigured } from "./supabase"

// ── Types ──────────────────────────────────────────────────────────────────────────
export type NewTrip = {
  ownerId?: string
  title: string
  destinations: string[]
  /** Real GPS per destination (from geocoding at creation). Matched by city name. */
  destinationDetails?: Array<{
    city: string
    country?: string
    lat?: number
    lng?: number
  }>
  travelStyle: string
  companionType: "solo" | "couple" | "friends" | "family"
  startDate?: string
  endDate?: string
  totalBudget?: number
  currency?: string
  coverImageUrl?: string
}

export type TripMemberRole = "owner" | "editor" | "viewer"

export type DbTripMember = {
  id: string
  trip_id: string
  user_id?: string
  name: string
  email?: string
  role: TripMemberRole
  avatar?: string
  status: "joined" | "pending"
  joined_at?: string
  color?: string
}

export type DbTrip = {
  id: string
  owner_id?: string
  title: string
  summary?: string
  cover_image_url?: string
  start_date?: string | null
  end_date?: string | null
  total_budget?: number
  currency?: string
  travel_style?: string
  companion_type?: string
  status?: "planning" | "upcoming" | "active" | "past" | "archived"
  planning_progress?: number
  created_at?: string
  invite_code?: string
  members?: Array<DbTripMember>
  trip_destinations?: Array<{
    id: string
    trip_id?: string
    city: string
    country: string
    position: number
    arrival_date?: string | null
    departure_date?: string | null
    nights?: number
    lat?: number
    lng?: number
  }>
  itinerary_items?: Array<DbItineraryItem>
  bookings?: Array<DbBooking>
  expenses?: Array<DbExpense>
  packing_items?: Array<DbPackingItem>
}

export type DbItineraryItem = {
  id: string
  trip_id: string
  item_type: "flight" | "stay" | "transport" | "activity" | "food" | "place" | "note"
  title: string
  details?: string | null
  location_name?: string | null
  starts_at?: string | null
  ends_at?: string | null
  position?: number
  estimated_cost?: number | null
  currency?: string
  created_at?: string
}

export type DbBooking = {
  id: string
  trip_id: string
  booking_type: "flight" | "stay" | "transport" | "activity"
  provider?: string | null
  name?: string
  confirmation_code?: string | null
  status?: "pending" | "confirmed" | "booked" | "cancelled"
  starts_at?: string | null
  ends_at?: string | null
  amount?: number | null
  currency?: string
  notes?: string | null
  details?: any
  itinerary_item_id?: string | null
  created_at?: string
}

export type DbExpense = {
  id: string
  trip_id: string
  category: "accommodation" | "transportation" | "food" | "activities" | "shopping" | "other"
  description: string
  amount: number
  currency: string
  expense_date: string
  paid_by?: string
  split_with?: string[]
  created_at?: string
}

/**
 * The `expenses` table has no "split with" column, so the list of people an
 * expense is shared with is encoded as a compact tag at the end of the
 * description. That way every account derives the same split purely from the
 * shared row and balances stay identical on all devices.
 */
export function encodeExpenseSplit(description: string, splitWith: string[] | undefined | null): string {
  const clean = (description || "").replace(/\n\[split:[^\]]*\]$/s, "")
  if (!splitWith || splitWith.length === 0) return clean
  return `${clean}\n[split:${splitWith.join(",")}]`
}

export function parseExpenseSplit(description: string): string[] | null {
  const m = (description || "").match(/\n\[split:([^\]]+)\]$/s)
  if (!m) return null
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function cleanExpenseDescription(description: string): string {
  return (description || "").replace(/\n\[split:[^\]]*\]$/s, "")
}

export type DbPackingItem = {
  id: string
  trip_id: string
  category: string
  item_name: string
  is_packed: boolean
  quantity: number
  created_at?: string
}

export type DbSavedPlace = {
  id: string
  name: string
  address: string
  city: string
  country: string
  lat: number
  lng: number
  category: string
  rating: number
  image_url?: string
  notes?: string
  created_at?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────
export function generateUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function generateTripInviteCode(tripTitle: string, tripId?: string): string {
  const clean = (tripTitle || "TRIP")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)
  const suffix = (tripId ? tripId.replace(/[^A-Z0-9]/gi, "") : Math.random().toString(36).substring(2, 6))
    .slice(-4)
    .toUpperCase()
  return `${clean || "TRIP"}-${suffix}`
}

/** Current authenticated (or locally stored) user id, or null for guests. */
export function getCurrentUserId(): string | null {
  const authUser = getCurrentAuthUser()
  return authUser?.id && authUser.id !== "guest" ? authUser.id : null
}

/**
 * Id to stamp server writes with (`created_by` / `paid_by`). RLS compares
 * against `auth.uid()`, so the REAL Supabase session id wins over the local
 * profile id — a stale local identity (e.g. after switching accounts in the
 * same browser) would otherwise fail every insert even with full rights.
 */
export async function getWriteUserId(): Promise<string | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      if (data?.session?.user?.id) return data.session.user.id
    } catch {
      // fall through to the local identity
    }
  }
  return getCurrentUserId()
}

const ensuredProfiles = new Set<string>()

/**
 * Sanitize a display username for the `profiles.username` column, which must
 * match ^[a-z0-9_]{3,30}$ — auth stores "@email" style names, which would
 * fail the check and abort the whole upsert (including the avatar_url).
 */
export function sanitizeUsernameForDb(raw?: string | null): string {
  let username = (raw || "")
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase()
    .slice(0, 30)
  if (username.length < 3) username = "user" + username
  return username
}

/**
 * Make sure the current account has a row in `profiles`. Every server table
 * that carries a `created_by` FK (`itinerary_items`, `bookings`, `expenses`,
 * `packing_items`) requires one, and accounts created before the sign-up
 * code upserted a profile have none — so their transport/stay/expense inserts
 * failed with a foreign key error while plain trip_destinations writes (no
 * FK) still succeeded. Idempotent and cheap.
 */
export async function ensureProfile(userId?: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return
  const uid = userId || getCurrentUserId()
  if (!uid || ensuredProfiles.has(uid)) return
  const authUser = getCurrentAuthUser()
  try {
    const emailPrefix = (authUser?.email || "").split("@")[0] || ""
    const username = sanitizeUsernameForDb(authUser?.username || emailPrefix)
    const authAvatar = authUser?.avatarUrl || null
    // Never clobber an existing custom photo with the auth-provider photo:
    // read the row first, then insert or fill a missing avatar only.
    // A blind upsert of {id, full_name, username} is safe for the avatar
    // column, but it can't backfill a NULL avatar for older accounts —
    // those users showed a stranger's fallback face in the community feed.
    const { data: existing, error: readError } = await supabase
      .from("profiles")
      .select("id,avatar_url")
      .eq("id", uid)
      .maybeSingle()
    if (readError) {
      console.warn("ensureProfile error:", readError.message)
      return
    }
    if (!existing) {
      const { error } = await supabase.from("profiles").insert({
        id: uid,
        full_name: authUser?.fullName || authUser?.email?.split("@")[0] || "Traveler",
        username,
        ...(authAvatar && !isPlaceholderAvatar(authAvatar) ? { avatar_url: authAvatar } : {}),
      })
      if (error) {
        console.warn("ensureProfile error:", error.message)
      } else {
        ensuredProfiles.add(uid)
      }
      return
    }
    // Row exists: only fill a missing avatar, never overwrite a custom one.
    if (!existing.avatar_url && authAvatar && !isPlaceholderAvatar(authAvatar)) {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: authAvatar })
        .eq("id", uid)
      if (error) console.warn("ensureProfile avatar backfill error:", error.message)
    }
    ensuredProfiles.add(uid)
  } catch (e) {
    console.warn("ensureProfile error:", e)
  }
}

/** Log a server write failure and surface it in the UI so a missing sync is visible. */
export function reportSyncError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`Supabase ${scope} error:`, error)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:sync_error", { detail: { scope, message } }))
  }
}

/**
 * Reduce a local trip_destination row to the columns the Supabase
 * `trip_destinations` table actually has. Local data carries extra fields
 * (nights, lat, lng, days) that would make the remote insert fail.
 */
function sanitizeDestinationForDb(d: Record<string, any>): Record<string, any> {
  // The remote table enforces departure >= arrival per row; a stop with
  // inverted dates would abort the whole insert and lose every destination.
  let arrival = d.arrival_date || null
  let departure = d.departure_date || null
  if (arrival && departure && departure < arrival) {
    departure = null
  }
  const row: Record<string, any> = {
    id: d.id,
    trip_id: d.trip_id,
    city: d.city,
    country: d.country || "Unknown",
    position: Math.max(0, Math.floor(Number(d.position ?? 0))),
    arrival_date: arrival,
    departure_date: departure,
    notes: d.notes ?? null,
  }
  // Universal GPS (migration 20261016): real coords from the worldwide search
  // so every map pins the exact city/ville without re-geocoding. Omitted when
  // missing so older servers without the columns still accept the row — the
  // caller retries without lat/lng on schema-cache errors.
  const lat = Number(d.lat)
  const lng = Number(d.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    row.lat = lat
    row.lng = lng
  }
  return row
}

/**
 * Number of days ("nights") for a trip_destination row.
 *
 * The `trip_destinations` table has NO nights/days column — only
 * `arrival_date` / `departure_date`. The per-stop "+/- days" stepper only
 * survives a cross-account sync when it is derived from those dates:
 * `normalizeStopDates` writes `departure = arrival + stayDays`, so
 * `stayDays = departure - arrival` recovers the value on every device.
 * Local rows may still carry `nights`/`days` (never sent to the server);
 * prefer an explicit finite value, otherwise fall back to the date diff.
 */
export function getDestinationStayDays(d: any): number {
  const explicit = Number(d?.nights ?? d?.days)
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.round(explicit))
  const arrival = d?.arrival_date || d?.startDate || null
  const departure = d?.departure_date || d?.endDate || null
  if (arrival && departure) {
    const a = new Date(`${String(arrival).slice(0, 10)}T00:00:00`)
    const b = new Date(`${String(departure).slice(0, 10)}T00:00:00`)
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) {
      const diff = Math.round((b.getTime() - a.getTime()) / 86400000)
      if (Number.isFinite(diff) && diff >= 1) return diff
    }
  }
  return 1
}

/** Map a Supabase trip_members row (with embedded profile) to the local DbTripMember shape. */
function mapServerMember(row: any): DbTripMember {
  const profile = row?.profiles || null
  return {
    id: row.user_id,
    trip_id: row.trip_id,
    user_id: row.user_id,
    name: profile?.full_name || "Traveler",
    email: undefined,
    role: row.role,
    avatar:
      profile?.avatar_url ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
    status: row.status === "invited" ? "pending" : "joined",
    joined_at: row.created_at,
    color: row.role === "owner" ? "#3B41C8" : row.role === "editor" ? "#06C4D4" : "#FF6347",
  }
}

/** Union two arrays by id, keeping the primary (server) version of a row when ids collide.
 *  Server-first order matters: when the other account edits an existing row
 *  (e.g. stop dates), the fresh server copy must win, otherwise each device
 *  keeps showing its own stale local copy forever. Local-only rows (never
 *  synced) are still preserved via the fallback tail. */
function unionById<T extends { id?: string }>(primary: T[] | undefined, fallback: T[] | undefined, tombstoneIds?: Set<string>): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  const skip = tombstoneIds || new Set<string>()
  for (const item of [...(primary || []), ...(fallback || [])]) {
    if (!item?.id || seen.has(item.id)) continue
    // Rows deleted on the server (tombstoned) are dropped from the LOCAL copy
    // so the union does not resurrect them. If the server later returns the
    // same id again it is included normally.
    if (skip.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/**
 * Reconcile a fresh server pull with the local copy so cross-account deletes
 * propagate: ids the server previously acknowledged but no longer returns are
 * tombstones (dropped from the union), acknowledged ids are recorded, and
 * obsolete tombstones are pruned. Returns the tombstone sets per relation.
 */
function reconcileRelations(
  store: LocalStoreData,
  tripId: string,
  serverData: any,
  localTrip: any | undefined,
): Record<string, Set<string>> {
  const deleted = store.deleted_ids || {}
  const seen = store.server_seen || {}
  const nextDeleted: Record<string, string[]> = { ...deleted }
  const nextSeen: Record<string, string[]> = { ...seen }
  const tombstones: Record<string, Set<string>> = {}

  for (const rel of RELATION_NAMES) {
    const key = relKey(tripId, rel)
    const serverIds = ((serverData as any)?.[rel] || []).map((r: any) => r.id).filter(Boolean)
    const oldSeenIds = seen[key] || []
    const oldDeletedIds = deleted[key] || []
    const localIds = ((localTrip as any)?.[rel] || []).map((r: any) => r.id).filter(Boolean)

    const serverSet = new Set(serverIds)
    const localSet = new Set(localIds)
    const oldSeenSet = new Set(oldSeenIds)
    const oldDeletedSet = new Set(oldDeletedIds)

    // Remotely-deleted rows: previously acknowledged, now absent from server,
    // but still present in the local copy -> tombstone them.
    const immediateTombstones: string[] = []
    for (const id of oldSeenSet) {
      if (!serverSet.has(id) && localSet.has(id)) immediateTombstones.push(id)
    }

    // Keep tombstones only for ids this device still has locally; prune the rest.
    const nextDeletedIds = oldDeletedIds.filter((id) => localSet.has(id))
    for (const id of immediateTombstones) {
      if (!nextDeletedIds.includes(id)) nextDeletedIds.push(id)
    }
    nextDeleted[key] = nextDeletedIds
    nextSeen[key] = serverIds

    tombstones[rel] = new Set(nextDeletedIds)
    if (JSON.stringify(nextDeletedIds) !== JSON.stringify(oldDeletedIds)) {
      store.deleted_ids = nextDeleted
    }
    if (JSON.stringify(serverIds) !== JSON.stringify(oldSeenIds)) {
      store.server_seen = nextSeen
    }
  }

  const changedDeleted = JSON.stringify(store.deleted_ids) !== JSON.stringify(deleted)
  const changedSeen = JSON.stringify(store.server_seen) !== JSON.stringify(seen)
  if (changedDeleted || changedSeen) saveStore(store)

  return tombstones
}

/**
 * Push local-only rows that never reached the server (e.g. written while the
 * account lacked the write permission and RLS rejected the insert — the row
 * then lived only on that device while other accounts never saw it).
 * Upsert-only (never deletes), throttled per trip, and silent on failure
 * (console only) so a still-missing permission can't spam the sync badge.
 */
const lastHealAttempt = new Map<string, number>()
const HEAL_THROTTLE_MS = 120_000

async function healUnsyncedTripRows(
  tripId: string,
  serverData: any,
  localTrip: any | undefined,
  tombstones: Record<string, Set<string>>,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !tripId || !localTrip) return
  const now = Date.now()
  if (now - (lastHealAttempt.get(tripId) || 0) < HEAL_THROTTLE_MS) return
  lastHealAttempt.set(tripId, now)
  const uid = await getWriteUserId()
  if (!uid) return

  const missing = <T extends { id?: string }>(local: T[] | undefined, serverRows: any[] | undefined, rel: string): T[] => {
    const serverIds = new Set((serverRows || []).map((r: any) => r?.id).filter(Boolean))
    const dead = tombstones[rel] || new Set<string>()
    return (local || []).filter((r) => r?.id && !serverIds.has(r.id) && !dead.has(r.id))
  }

  try {
    await ensureProfile()

    const destMissing = missing(localTrip.trip_destinations, serverData?.trip_destinations, "trip_destinations")
    if (destMissing.length > 0) {
      await supabase
        .from("trip_destinations")
        .upsert(destMissing.map((d) => sanitizeDestinationForDb(d as Record<string, any>)), { onConflict: "id" })
    }

    const itinMissing = missing(localTrip.itinerary_items, serverData?.itinerary_items, "itinerary_items") as DbItineraryItem[]
    if (itinMissing.length > 0) {
      await supabase.from("itinerary_items").upsert(
        itinMissing.map((i) => ({
          id: i.id,
          trip_id: tripId,
          created_by: uid,
          item_type: i.item_type,
          title: i.title,
          details: i.details ?? null,
          location_name: i.location_name ?? null,
          starts_at: i.starts_at ?? null,
          ends_at: i.ends_at ?? null,
          position: Number(i.position ?? 0),
          estimated_cost: i.estimated_cost ?? null,
          currency: i.currency || "USD",
        })),
        { onConflict: "id" },
      )
    }

    const bookMissing = missing(localTrip.bookings, serverData?.bookings, "bookings") as DbBooking[]
    if (bookMissing.length > 0) {
      await supabase.from("bookings").upsert(
        bookMissing.map((b) => ({
          id: b.id,
          trip_id: tripId,
          itinerary_item_id: (b as any).itinerary_item_id ?? null,
          created_by: uid,
          booking_type: b.booking_type,
          provider: b.provider ?? null,
          confirmation_code: b.confirmation_code ?? null,
          status: b.status ?? "pending",
          starts_at: b.starts_at ?? null,
          ends_at: b.ends_at ?? null,
          amount: b.amount ?? null,
          currency: b.currency || "USD",
          notes: b.notes
            ? `${b.name ? b.name + " — " : ""}${b.notes}`
            : ((b as any).name ?? null),
        })),
        { onConflict: "id" },
      )
    }

    const expMissing = missing(localTrip.expenses, serverData?.expenses, "expenses") as DbExpense[]
    if (expMissing.length > 0) {
      await supabase.from("expenses").upsert(
        expMissing.map((e) => ({
          id: e.id,
          trip_id: tripId,
          category: e.category,
          description: encodeExpenseSplit(e.description, (e as any).split_with ?? null),
          amount: Number(e.amount ?? 0),
          currency: e.currency || "USD",
          expense_date: e.expense_date,
          paid_by: (e as any).paid_by || uid,
        })),
        { onConflict: "id" },
      )
    }

    const packMissing = missing(localTrip.packing_items, serverData?.packing_items, "packing_items") as DbPackingItem[]
    if (packMissing.length > 0) {
      await supabase.from("packing_items").upsert(
        packMissing.map((p) => ({
          id: p.id,
          trip_id: tripId,
          created_by: uid,
          category: p.category,
          label: p.item_name,
          is_packed: p.is_packed,
          quantity: Number(p.quantity ?? 1),
        })),
        { onConflict: "id" },
      )
    }
  } catch (e) {
    console.warn("healUnsyncedTripRows:", e)
  }
}

/** Members are server-authoritative: a successful server roster replaces the local one
 *  (so expelled members and stale local invites disappear after a refresh). The local
 *  roster is only a fallback when the server list is unavailable. */
function mergeMembers(server: DbTripMember[] | undefined, local: DbTripMember[] | undefined): DbTripMember[] {
  const serverAny = (server || []) as DbTripMember[]
  if (serverAny.length > 0) return serverAny
  return (local || []) as DbTripMember[]
}

/** Fetch the real trip_members list for a trip from Supabase (RLS-gated). Null when unavailable. */
export async function fetchServerMembers(tripId?: string): Promise<DbTripMember[] | null> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId() || !tripId) return null
  try {
    const { data, error } = await supabase
      .from("trip_members")
      .select("trip_id, user_id, role, status, created_at, profiles!trip_members_user_id_fkey(id, full_name, avatar_url)")
      .eq("trip_id", tripId)
    if (error || !Array.isArray(data)) return null
    return data.map(mapServerMember)
  } catch (e) {
    console.warn("fetchServerMembers error:", e)
    return null
  }
}

const REALTIME_TRIP_TABLES = [
  "trip_members",
  "trip_destinations",
  "itinerary_items",
  "bookings",
  "expenses",
  "packing_items",
] as const

/** Pull the latest server copy of a trip into the local store (no events fired). */
export async function refreshTripFromServer(tripId?: string): Promise<DbTrip | null> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId() || !tripId) return null
  const trip = await getTripDetails(tripId)
  return trip
}

/** Subscribe to realtime changes for a trip. Returns an unsubscribe function. */
export function subscribeToTripChanges(tripId?: string, onEvent?: () => void): () => void {
  if (!isSupabaseConfigured || !supabase || !tripId) return () => {}
  const channel = supabase.channel(`trip-realtime-${tripId}-${generateUuid()}`)
  const handle = () => {
    void refreshTripFromServer(tripId).then(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId } }))
      }
      onEvent?.()
    })
  }
  channel.on("postgres_changes", { event: "*", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, handle)
  for (const table of REALTIME_TRIP_TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `trip_id=eq.${tripId}` }, handle)
  }
  channel.subscribe()
  return () => {
    try {
      supabase.removeChannel(channel)
    } catch {}
  }
}

export function getCurrentAuthUser(): { id: string; email?: string; fullName?: string; username?: string; avatarUrl?: string } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("trypo_local_auth_user")
    if (!raw) return null
    const u = JSON.parse(raw)
    return {
      id: u.id || "guest",
      email: u.email,
      fullName: u.fullName || u.user_metadata?.full_name || (u.email ? u.email.split("@")[0] : "Traveler"),
      username: u.username || u.user_metadata?.username || (u.email ? u.email.split("@")[0] : "traveler"),
      avatarUrl: u.avatarUrl || u.user_metadata?.avatar_url,
    }
  } catch {
    return null
  }
}

export function isUserInTrip(trip: DbTrip, userEmailOrId?: string): boolean {
  if (!trip) return false
  if (!userEmailOrId) return true
  if (trip.owner_id && trip.owner_id === userEmailOrId) return true
  if (!trip.members || trip.members.length === 0) return true
  const lower = userEmailOrId.toLowerCase()
  return trip.members.some(
    (m) => m.user_id === userEmailOrId || (m.email && m.email.toLowerCase() === lower),
  )
}

function getStorageKey(): string {
  const user = getCurrentAuthUser()
  return `trypo_local_db_${user?.id || "guest"}`
}

type LocalStoreData = {
  trips: DbTrip[]
  saved_places: DbSavedPlace[]
  profile: {
    fullName: string
    username: string
    avatarUrl: string
    bio: string
    homeCountry: string
    travelStyle: string
    visitedCountriesCount: number
    totalCitiesCount: number
    totalMemoriesCount: number
  }
  notifications: Array<{
    id: string
    title: string
    message: string
    type: "info" | "alert" | "success"
    created_at: string
    read: boolean
  }>
  // Tombstones for rows deleted on the server (key `${tripId}:${relation}`):
  // they stop the union-merge from resurrecting deleted rows on other accounts.
  deleted_ids?: Record<string, string[]>
  // Ids seen on the server on the last successful pull for each trip/relation.
  // A previously-acknowledged id that disappears from the server response was
  // deleted remotely and becomes a tombstone so the other account drops it too.
  server_seen?: Record<string, string[]>
  // Trips THIS account intentionally left/deleted. They are filtered out of
  // every client-side list view (including the device-union fallback) so a
  // left community trip can never reappear on the device. A trip that comes
  // back from the server again (e.g. the owner re-accepts the user) removes
  // its tombstone automatically.
  left_trips?: string[]
}

const RELATION_NAMES = ["trip_destinations", "itinerary_items", "bookings", "expenses", "packing_items"] as const

function relKey(tripId: string, relation: string): string {
  return `${tripId}:${relation}`
}

function loadStore(): LocalStoreData {
  const user = getCurrentAuthUser()
  const defaultProfile = {
    fullName: user?.fullName || (user?.email ? user.email.split("@")[0] : "Traveler"),
    username: user?.username || (user?.email ? user.email.split("@")[0] : "traveler"),
    avatarUrl: user?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop",
    bio: "Passionate traveler discovering new places and cultures.",
    homeCountry: "Tunisia",
    travelStyle: "Explorer & Culture",
    visitedCountriesCount: 0,
    totalCitiesCount: 0,
    totalMemoriesCount: 0,
  }

  const defaultStore: LocalStoreData = {
    trips: [],
    saved_places: [],
    profile: defaultProfile,
    deleted_ids: {},
    server_seen: {},
    left_trips: [],
    notifications: [
      {
        id: "notif-welcome",
        title: "Welcome to Trypo! ✈️",
        message: "Start planning your next adventure. Invite your friends to collaborate in real-time!",
        type: "success",
        created_at: new Date().toISOString(),
        read: false,
      },
    ],
  }

  if (typeof window === "undefined") return defaultStore

  try {
    const key = getStorageKey()
    const raw = localStorage.getItem(key)
    if (!raw) {
      return defaultStore
    }
    const parsed = JSON.parse(raw)
    return {
      trips: Array.isArray(parsed.trips) ? parsed.trips : [],
      saved_places: Array.isArray(parsed.saved_places) ? parsed.saved_places : [],
      profile: { ...defaultProfile, ...(parsed.profile || {}) },
      deleted_ids: parsed.deleted_ids || {},
      server_seen: parsed.server_seen || {},
      left_trips: Array.isArray(parsed.left_trips) ? parsed.left_trips : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : defaultStore.notifications,
    }
  } catch {
    return defaultStore
  }
}

/**
 * Union of every trip stored on this device across all local accounts
 * (trypo_local_db_*). Used as a fallback so a just-joined account still sees
 * the trip even if it landed under a sibling account's storage key.
 */
function loadDeviceTrips(): DbTrip[] {
  if (typeof window === "undefined") return []
  const byId = new Map<string, DbTrip>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith("trypo_local_db_")) continue
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.trips)) {
        for (const t of parsed.trips) {
          if (t && t.id && !byId.has(t.id)) byId.set(t.id, t)
        }
      }
    }
  } catch {}
  return Array.from(byId.values())
}

/** Push trips to the shared Vite backend so other accounts can find them by invite code */
function syncTripsToBackend(trips: DbTrip[]) {
  if (typeof fetch === "undefined" || trips.length === 0) return
  fetch("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trips),
  }).catch(() => {})
}

function saveStore(store: LocalStoreData): void {
  if (typeof window === "undefined") return
  try {
    const key = getStorageKey()
    localStorage.setItem(key, JSON.stringify(store))
    // Auto-sync trips to shared backend for cross-account collaboration
    if (store.trips.length > 0) {
      syncTripsToBackend(store.trips)
    }
  } catch (e) {
    console.warn("Error saving to local storage:", e)
  }
}

// ── Active Trip State ──────────────────────────────────────────────────────────────────────────
const ACTIVE_TRIP_KEY = "trypo_active_trip_id"

export function getActiveTripId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(ACTIVE_TRIP_KEY)
}

export function setActiveTripId(tripId: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ACTIVE_TRIP_KEY, tripId)
  window.dispatchEvent(new CustomEvent("trypo:active_trip_changed", { detail: { tripId } }))
}

// ── Trips API ──────────────────────────────────────────────────────────────────────────

export async function getMyTrips(): Promise<DbTrip[]> {
  const authUser = getCurrentAuthUser()
  const store = loadStore()

  // Resolve the REAL Supabase session id up-front. A signed-in account's list
  // is ALWAYS the server's answer; if the local identity is not initialized
  // yet we must NOT fall into the guest/device-union path, otherwise a left
  // community trip immediately resurrects (and nothing re-triggers a reload).
  let serverUid: string | null = null
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      serverUid = data?.session?.user?.id ?? null
    } catch {
      serverUid = null
    }
  }
  const signedInWithServer = Boolean(isSupabaseConfigured && supabase && serverUid)
  const queryUid =
    authUser?.id && authUser.id !== "guest" ? authUser.id : serverUid || null

  if (isSupabaseConfigured && supabase && queryUid) {
    try {
      // NOTE: the joined query MUST use `trip_members!inner` — a plain
      // `trip_members(*)` embed with a filter only filters the embedded rows,
      // so PostgREST returns EVERY readable trip (all public/community trips).
      // Those merely-readable trips then looked "re-joined": they cleared the
      // left_trips tombstone below and reappeared in My Trips after leaving.
      const ownedSelect = "*, trip_members(*), trip_destinations(*), itinerary_items(*), bookings(*), expenses(*), packing_items(*)"
      const joinedSelect = "*, trip_members!inner(*), trip_destinations(*), itinerary_items(*), bookings(*), expenses(*), packing_items(*)"
      const [ownedRes, joinedRes] = await Promise.all([
        supabase.from("trips").select(ownedSelect).eq("owner_id", queryUid),
        supabase.from("trips").select(joinedSelect).filter("trip_members.user_id", "eq", queryUid),
      ])

      const owned = ownedRes.error ? [] : (ownedRes.data || [])
      const joined = joinedRes.error ? [] : (joinedRes.data || [])
      const mergedByServer = [...owned, ...joined]
      const byId = new Map<string, any>()
      for (const t of mergedByServer) byId.set(t.id, t)
      const remoteTrips = Array.from(byId.values())

      if (remoteTrips.length > 0 || !ownedRes.error || !joinedRes.error) {
        const remoteIds = new Set(remoteTrips.map((t: any) => t.id))
        const leftIds = new Set(store.left_trips || [])
        // Only drop local copies this account no longer owns when it was
        // previously a REAL server entity (server_member) and the server
        // authoritatively confirmed the trip is gone (both queries succeeded).
        // Trips joined locally via an invite code (never synced server_member)
        // must survive, or they vanish from "My Trips" after a refresh.
        // left_trips tombstones always win: a trip this account left must not
        // resurface from any fallback even after a transient server error.
        const serverAuthoritative = !ownedRes.error && !joinedRes.error
        const localOnlyTrips = store.trips.filter(
          (t) =>
            !remoteIds.has(t.id) &&
            !leftIds.has(t.id) &&
            (!signedInWithServer ||
              t.owner_id === queryUid ||
              !(t as any).server_member ||
              !serverAuthoritative),
        )
        // Deep-merge server trips with the local copies instead of replacing
        // them: local destinations/itinerary that have not been written to the
        // server yet must survive a refresh, or the user loses their edits.
        const rels = RELATION_NAMES
        const mergedRemote = remoteTrips.map((remote: any) => {
          const local = store.trips.find((lt) => lt.id === remote.id)
          if (!local) return { ...remote, server_member: true }
          const mergedTrip: any = { ...remote, server_member: true }
          const tombstoneSets = reconcileRelations(store, remote.id, remote, local)
          // Repair rows this device wrote while the server rejected them
          // (e.g. a joiner adding content before having edit rights).
          void healUnsyncedTripRows(remote.id, remote, local, tombstoneSets)
          for (const rel of rels) {
            mergedTrip[rel] = unionById(remote[rel], (local as any)[rel], tombstoneSets[rel])
          }
          if (Array.isArray((remote as any).members) && Array.isArray(local.members)) {
            mergedTrip.members = mergeMembers((remote as any).members, local.members)
          }
          return mergedTrip
        })
        const merged = [...mergedRemote, ...localOnlyTrips]
        // A trip that the server proves is genuinely joined again (owned by
        // this account, or carrying a real trip_members row for it — e.g. the
        // owner re-accepted this account) drops its left tombstone so it stays
        // visible in My Trips. Mere readability (public/community trip) must
        // NEVER clear the tombstone, or a left trip instantly reappears.
        if (mergedRemote.length > 0 && (store.left_trips || []).length > 0) {
          const rejoinedIds = new Set<string>()
          for (const remote of remoteTrips as any[]) {
            if (remote?.owner_id && remote.owner_id === queryUid) {
              rejoinedIds.add(remote.id)
              continue
            }
            const members = Array.isArray(remote?.trip_members) ? remote.trip_members : []
            if (members.some((m: any) => m?.user_id === queryUid)) {
              rejoinedIds.add(remote.id)
            }
          }
          const before = store.left_trips!.length
          store.left_trips = store.left_trips!.filter((id) => !rejoinedIds.has(id))
          if (store.left_trips!.length === before) {
            saveStore(store)
          } else {
            store.trips = merged
            saveStore(store)
          }
        } else {
          store.trips = merged
          saveStore(store)
        }
        // Sync to shared backend for cross-account invite code lookups
        syncTripsToBackend(merged)
        return merged
      }
    } catch (e) {
      console.warn("Supabase getMyTrips fallback to local:", e)
    }
  }

  // Sync local trips to shared backend for cross-account invite code lookups
  if (store.trips.length > 0) {
    syncTripsToBackend(store.trips)
  }

  // For a REAL signed-in Supabase account the server is the only source of
  // truth: even when both queries error (transient offline/RLS) we must NOT
  // resurrect other accounts' trips stored on this device, otherwise a left
  // community trip reappears forever. Guests are the only ones who get the
  // device-union fallback (its purpose is showing a just-joined guest the trip
  // that landed under a sibling account's storage key).
  if (signedInWithServer) {
    const leftIds = new Set(store.left_trips || [])
    return store.trips.filter((t) => !leftIds.has(t.id))
  }

  // Guest path: surface the union of trips stored on this device so a joined
  // trip in a sibling account's store is still listed here. left_trips
  // tombstones are honored so a left trip never resurrects via another
  // account's copy.
  const leftIds = new Set(store.left_trips || [])
  const deviceTrips = loadDeviceTrips().filter((t) => !leftIds.has(t.id))
  if (deviceTrips.length > 0 && deviceTrips.length !== store.trips.length) {
    const byId = new Map<string, DbTrip>()
    for (const t of store.trips) if (!byId.has(t.id)) byId.set(t.id, t)
    for (const t of deviceTrips) if (!byId.has(t.id)) byId.set(t.id, t)
    store.trips = Array.from(byId.values())
  }

  return store.trips
}

export async function getTripDetails(tripId?: string | null): Promise<DbTrip | null> {
  const store = loadStore()
  const targetId = tripId || getActiveTripId()

  let trip = targetId ? store.trips.find((t) => t.id === targetId) : store.trips[0]
  let accessRevoked = false
  let sessionUid: string | undefined

  if (isSupabaseConfigured && supabase && targetId) {
    try {
      const { data: authData } = await supabase.auth.getSession()
      sessionUid = authData?.session?.user?.id

      const { data: serverData, error } = await supabase
        .from("trips")
        .select("*, trip_destinations(*), itinerary_items(*), bookings(*), expenses(*), packing_items(*)")
        .eq("id", targetId)
        .single()

      if (!error && serverData) {
        // Never resurrect a trip THIS account left: public/community trips
        // stay server-readable after leaving (trips_read allows visibility =
        // 'public'), so without this guard every live-sync poll re-added the
        // left trip to My Trips. Re-read the tombstones fresh (a concurrent
        // leaveTrip may have saved after this call loaded its store copy).
        let freshLeft: string[] = store.left_trips || []
        try {
          const raw = typeof window !== "undefined" ? localStorage.getItem(getStorageKey()) : null
          if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed?.left_trips)) freshLeft = parsed.left_trips
            store.left_trips = parsed?.left_trips || store.left_trips
          }
        } catch {}
        if (freshLeft.includes(serverData.id)) {
          store.trips = store.trips.filter((t) => t.id !== serverData.id)
          saveStore(store)
          if (targetId === serverData.id) trip = null
          return trip || null
        }
        const localTrip = trip && trip.id === serverData.id ? trip : undefined

        // Union-merge: the server is the source of truth, but keep local rows
        // that have not made it to the server yet (e.g. pre-membership edits).
        // Rows the server deleted are tombstones and dropped, so a transport
        // removed on one account disappears from the others too.
        // server_member marks that this account actually had server read access,
        // which the revocation check below requires before dropping a trip.
        const merged: any = { ...serverData, server_member: true }
        const tombstoneSets = reconcileRelations(store, serverData.id, serverData, localTrip)
        // Repair rows this device wrote while the server rejected them.
        void healUnsyncedTripRows(serverData.id, serverData, localTrip, tombstoneSets)
        for (const rel of RELATION_NAMES) {
          merged[rel] = unionById(serverData[rel], (localTrip as any)?.[rel], tombstoneSets[rel])
        }

        // Member roster is server-authoritative (prevents kicked members or
        // stale local invites from reappearing after a refresh).
        const serverMembers = await fetchServerMembers(serverData.id)
        if (serverMembers) {
          merged.members = mergeMembers(serverMembers, (localTrip as any)?.members)
        }

        trip = merged
        const idx = store.trips.findIndex((t) => t.id === merged.id)
        if (idx >= 0) store.trips[idx] = merged
        else store.trips.unshift(merged)
        saveStore(store)
      } else if (error && isNoAccessError(error)) {
        // This trip is no longer readable from the server. Only treat it as a
        // real access revocation (and drop it) when the account (a) has a real
        // Supabase session matching its local identity, (b) previously had
        // server read access (server_member) and (c) does not own the trip.
        // Local-only / offline joins keep their copy instead of vanishing.
        const isThisAccount = Boolean(sessionUid && sessionUid === getCurrentUserId())
        const localTrip = trip
        if (
          isThisAccount &&
          localTrip &&
          (localTrip as any).server_member &&
          (!localTrip.owner_id || localTrip.owner_id !== sessionUid)
        ) {
          accessRevoked = true
        }
      }
    } catch (e) {
      console.warn("Supabase getTripDetails fallback to local:", e)
    }
  }

  if (accessRevoked) {
    store.trips = store.trips.filter((t) => t.id !== targetId)
    if (getActiveTripId() === targetId) {
      localStorage.removeItem(ACTIVE_TRIP_KEY)
    }
    saveStore(store)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("trypo:db_changed"))
    }
    trip = null
  }

  if (!trip && !sessionUid) {
    // Guest/local-only fallback: the trip may live under a sibling account's
    // local store on this device (e.g. a just-joined guest whose storage key
    // differs). A REAL signed-in account never resurrects a left/absent trip
    // from a sibling copy — the server decides what that account sees. A trip
    // THIS account left is also never resurrected from a sibling copy.
    const leftIds = new Set(store.left_trips || [])
    const deviceCandidates = loadDeviceTrips().filter((t) => !leftIds.has(t.id))
    const deviceTrip = (targetId ? deviceCandidates.find((t) => t.id === targetId) : undefined) || deviceCandidates[0]
    if (deviceTrip) {
      trip = deviceTrip
      const mine = loadStore()
      if (!mine.trips.some((t) => t.id === deviceTrip.id)) {
        mine.trips.unshift(deviceTrip)
        saveStore(mine)
      }
    }
  }

  return trip || store.trips[0] || null
}

/** True when a PostgREST error means "this row is not visible to the current user". */
function isNoAccessError(e: any): boolean {
  const code = String(e?.code || "")
  const msg = String(e?.message || "")
  return (
    code === "42501" ||
    code === "PGRST116" ||
    /permission denied|could not find|42000|42501|rls/i.test(msg)
  )
}

export async function createTrip(tripData: NewTrip): Promise<DbTrip> {
  const authUser = getCurrentAuthUser()
  const store = loadStore()
  const tripId = generateUuid()
  const inviteCode = generateTripInviteCode(tripData.title, tripId)
  const ownerId = tripData.ownerId || authUser?.id || "guest"
  const ownerName = authUser?.fullName || (authUser?.email ? authUser.email.split("@")[0] : "Organizer")

  const detailByCity = new Map(
    (tripData.destinationDetails || []).map((d) => [d.city.trim().toLowerCase(), d]),
  )
  const destinations = (tripData.destinations || []).map((city, idx) => {
    const detail = detailByCity.get(city.trim().toLowerCase())
    const lat = Number(detail?.lat)
    const lng = Number(detail?.lng)
    return {
      id: generateUuid(),
      trip_id: tripId,
      city,
      country: detail?.country || "Destination",
      position: idx,
      arrival_date: tripData.startDate || null,
      departure_date: tripData.endDate || null,
      nights: 1,
      // Real GPS when geocoded at creation — the map pins the exact city.
      // Unknown stays undefined so the map live-geocodes instead of Tunis.
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    }
  })

  const ownerMember: DbTripMember = {
    id: generateUuid(),
    trip_id: tripId,
    user_id: ownerId,
    name: ownerName,
    email: authUser?.email,
    role: "owner",
    status: "joined",
    joined_at: new Date().toISOString(),
    avatar: authUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
    color: "#3B41C8",
  }

  const newTrip: DbTrip = {
    id: tripId,
    owner_id: ownerId,
    title: tripData.title,
    summary: `${tripData.travelStyle || "Vacances"} trip with ${tripData.companionType || "friends"}`,
    cover_image_url:
      tripData.coverImageUrl ||
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=700&fit=crop&auto=format",
    start_date: tripData.startDate || null,
    end_date: tripData.endDate || null,
    total_budget: tripData.totalBudget || 1500,
    currency: tripData.currency || "EUR",
    travel_style: tripData.travelStyle || "Cultural",
    companion_type: tripData.companionType || "friends",
    status: "planning",
    planning_progress: 10,
    created_at: new Date().toISOString(),
    invite_code: inviteCode,
    members: [ownerMember],
    trip_destinations: destinations,
    itinerary_items: [],
    bookings: [],
    expenses: [],
    packing_items: [
      { id: generateUuid(), trip_id: tripId, category: "Documents", item_name: "Passport / ID", is_packed: false, quantity: 1 },
      { id: generateUuid(), trip_id: tripId, category: "Tech", item_name: "Phone charger & Power bank", is_packed: false, quantity: 1 },
      { id: generateUuid(), trip_id: tripId, category: "Essentials", item_name: "Sunglasses & Sunscreen", is_packed: false, quantity: 1 },
    ],
  }

  if (isSupabaseConfigured && supabase && authUser?.id && authUser.id !== "guest") {
    try {
      const tripRow = {
        id: tripId,
        owner_id: ownerId,
        title: newTrip.title,
        summary: newTrip.summary,
        cover_image_url: newTrip.cover_image_url,
        start_date: tripData.startDate || null,
        end_date:
          tripData.endDate && tripData.startDate && tripData.endDate < tripData.startDate
            ? null
            : (tripData.endDate || null),
        total_budget: newTrip.total_budget,
        currency: newTrip.currency,
        travel_style: newTrip.travel_style,
        companion_type: newTrip.companion_type,
        status: newTrip.status,
        planning_progress: newTrip.planning_progress,
        invite_code: newTrip.invite_code,
      }
      try {
        await supabase.from("trips").insert(tripRow)
      } catch {
        // Fall back to the core columns when the invite_code column is not
        // present in the remote schema yet.
        const { invite_code, ...minimalTripRow } = tripRow
        await supabase.from("trips").insert(minimalTripRow)
      }

      if (destinations.length > 0) {
        try {
          const { error } = await supabase
            .from("trip_destinations")
            .insert(destinations.map((d) => sanitizeDestinationForDb(d)))
          if (error) throw error
        } catch {
          // Older servers without the lat/lng migration reject the columns —
          // retry with names/dates only so the destinations still sync.
          const legacy = destinations.map((d) => {
            const row = sanitizeDestinationForDb(d)
            delete row.lat
            delete row.lng
            return row
          })
          const { error } = await supabase.from("trip_destinations").insert(legacy)
          if (error) throw error
        }
      }
    } catch (e) {
      console.warn("Supabase createTrip insert error:", e)
    }
  }

  store.trips.unshift(newTrip)
  saveStore(store)
  setActiveTripId(tripId)

  if (typeof fetch !== "undefined") {
    fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTrip),
    }).catch(() => {})
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId } }))
  }

  return newTrip
}

export async function deleteTrip(tripId: string): Promise<void> {
  const store = loadStore()
  store.trips = store.trips.filter((t) => t.id !== tripId)
  if (!store.left_trips) store.left_trips = []
  if (!store.left_trips.includes(tripId)) store.left_trips.push(tripId)
  saveStore(store)

  if (getActiveTripId() === tripId) {
    if (store.trips.length > 0) {
      setActiveTripId(store.trips[0].id)
    } else {
      localStorage.removeItem(ACTIVE_TRIP_KEY)
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("trips").delete().eq("id", tripId)
    } catch (e) {
      console.warn("Supabase deleteTrip error:", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}

export async function syncTripDestinations(tripId: string, destinations: any[]): Promise<void> {
  const store = loadStore()
  const trip = store.trips.find((t) => t.id === tripId)
  if (!trip) return
  // The server stores destination ids as uuid. Local-only stops may carry a
  // legacy "stop-…" string id (invalid for a uuid column, which made the
  // upsert fail silently and the change never reach the other account). Fix
  // such ids to real uuids before anything is written, and persist the fixed
  // ids back to the local copy so later edits reuse the same row.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const sanitized = destinations.map((d) => {
    // Rows coming from the Overview route editor have no trip_id, but
    // `trip_destinations.trip_id` is NOT NULL — without it the whole upsert
    // fails silently and the change never reaches the other account. Inject it
    // here so both the local store and the server row carry it.
    d.trip_id = d.trip_id || tripId
    if (!uuidRe.test(String(d?.id ?? ""))) d.id = generateUuid()
    return d
  })
  trip.trip_destinations = sanitized
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const rows = sanitized.map((d) => sanitizeDestinationForDb(d))
      if (rows.length > 0) {
        // Idempotent sync: delete server rows missing locally FIRST, then
        // upsert. trip_destinations has UNIQUE(trip_id, position), so an
        // upsert-first order collides when a joiner adds a stop at a
        // position the server already uses for another row — the whole
        // upsert fails and the organizer never sees the new destination.
        const idLiteral = rows.map((r) => `"${r.id}"`).join(",")
        const { error: pruneError } = await supabase
          .from("trip_destinations")
          .delete()
          .eq("trip_id", tripId)
          .not("id", "in", `(${idLiteral})`)
        if (pruneError) throw pruneError
        const { error: upsertError } = await supabase
          .from("trip_destinations")
          .upsert(rows, { onConflict: "id" })
        if (upsertError) {
          // Older servers without lat/lng columns: strip GPS and retry once.
          if (/lat|lng|column|schema cache/i.test(String(upsertError.message || ""))) {
            const legacy = rows.map((r) => {
              const { lat, lng, ...rest } = r
              return rest
            })
            const { error: retryError } = await supabase
              .from("trip_destinations")
              .upsert(legacy, { onConflict: "id" })
            if (retryError) throw retryError
          } else {
            throw upsertError
          }
        }
      } else {
        const { error: clearError } = await supabase
          .from("trip_destinations")
          .delete()
          .eq("trip_id", tripId)
        if (clearError) throw clearError
      }
    } catch (e) {
      reportSyncError("syncTripDestinations", e)
    }
  }
}

// ── Itinerary API ──────────────────────────────────────────────────────────────────────────

export async function getItineraryItems(tripId?: string): Promise<DbItineraryItem[]> {
  const trip = await getTripDetails(tripId)
  return trip?.itinerary_items || []
}

export async function addItineraryItem(item: any): Promise<DbItineraryItem> {
  // Callers pass camelCase fields (tripId, itemType, startsAt, …). Normalize
  // them to the snake_case shape the store and the server expect. Without
  // this, trip_id used to land undefined — the local row was attached to the
  // wrong trip and the server insert failed on trip_id NOT NULL, so the item
  // never reached the other connected account.
  const tripId = item.trip_id ?? item.tripId ?? getActiveTripId()
  const store = loadStore()
  const trip =
    store.trips.find((t) => t.id === tripId) ||
    store.trips.find((t) => t.id === getActiveTripId())
  if (!trip) throw new Error("Trip not found")

  const newItem: DbItineraryItem = {
    id: generateUuid(),
    trip_id: tripId,
    item_type: item.item_type ?? item.itemType ?? "note",
    title: item.title,
    details: item.details ?? null,
    location_name: item.location_name ?? item.locationName ?? null,
    starts_at: item.starts_at ?? item.startsAt ?? null,
    ends_at: item.ends_at ?? item.endsAt ?? null,
    position: Number(item.position ?? 0),
    estimated_cost: item.estimated_cost ?? item.estimatedCost ?? null,
    currency: item.currency || "USD",
    created_at: new Date().toISOString(),
  }

  if (!trip.itinerary_items) trip.itinerary_items = []
  trip.itinerary_items.push(newItem)
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const createdBy = await getWriteUserId()
      await ensureProfile(createdBy || undefined)
      // supabase-js resolves (never throws) on RLS/validation failures, so
      // the error must be inspected — otherwise a joiner's rejected write
      // stays local-only and never reaches the organizer.
      const { error: itineraryError } = await supabase.from("itinerary_items").insert({
        id: newItem.id,
        trip_id: newItem.trip_id,
        created_by: createdBy,
        item_type: newItem.item_type,
        title: newItem.title,
        details: newItem.details ?? null,
        location_name: newItem.location_name ?? null,
        starts_at: newItem.starts_at ?? null,
        ends_at: newItem.ends_at ?? null,
        position: Number(newItem.position ?? 0),
        estimated_cost: newItem.estimated_cost ?? null,
        currency: newItem.currency || "USD",
      })
      if (itineraryError) throw itineraryError
    } catch (e) {
      reportSyncError("addItineraryItem", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }

  return newItem
}

export async function deleteItineraryItem(itemId: string, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (trip && trip.itinerary_items) {
    trip.itinerary_items = trip.itinerary_items.filter((i) => i.id !== itemId)
    saveStore(store)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from("itinerary_items").delete().eq("id", itemId)
      if (error) throw error
    } catch (e) {
      reportSyncError("deleteItineraryItem", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}

// ── Bookings API ──────────────────────────────────────────────────────────────────────────

export async function getBookings(tripId?: string): Promise<DbBooking[]> {
  const trip = await getTripDetails(tripId)
  return trip?.bookings || []
}

export async function addBooking(booking: any): Promise<DbBooking> {
  // Same camelCase → snake_case normalization as addItineraryItem — without
  // it trip_id was undefined, the row targeted the wrong trip and the server
  // insert failed, so bookings never synced to other accounts.
  const tripId = booking.trip_id ?? booking.tripId ?? getActiveTripId()
  const store = loadStore()
  const trip =
    store.trips.find((t) => t.id === tripId) ||
    store.trips.find((t) => t.id === getActiveTripId())
  if (!trip) throw new Error("Trip not found")

  const newBooking: DbBooking = {
    id: generateUuid(),
    trip_id: tripId,
    booking_type: booking.booking_type ?? booking.bookingType ?? "transport",
    provider: booking.provider ?? null,
    name: booking.name,
    confirmation_code:
      booking.confirmation_code ?? booking.confirmationCode ?? booking.name ?? null,
    status: booking.status ?? "pending",
    starts_at: booking.starts_at ?? booking.startsAt ?? null,
    ends_at: booking.ends_at ?? booking.endsAt ?? null,
    amount: booking.amount ?? 0,
    currency: booking.currency || "USD",
    notes: booking.notes ?? null,
    details: booking.details,
    // Keep the linked itinerary row on the LOCAL copy too (it used to live
    // only on the server row), so a transport deleted from the Transport
    // screen can also delete its linked itinerary item while offline.
    itinerary_item_id: booking.itinerary_item_id ?? booking.itineraryItemId ?? null,
    created_at: new Date().toISOString(),
  }

  if (!trip.bookings) trip.bookings = []
  trip.bookings.push(newBooking)
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const createdBy = await getWriteUserId()
      await ensureProfile(createdBy || undefined)
      // supabase-js resolves (never throws) on RLS/validation failures, so
      // the error must be inspected — otherwise a joiner's rejected write
      // stays local-only and never reaches the organizer.
      const { error: bookingError } = await supabase.from("bookings").insert({
        id: newBooking.id,
        trip_id: newBooking.trip_id,
        itinerary_item_id: booking.itinerary_item_id ?? booking.itineraryItemId ?? null,
        created_by: createdBy,
        booking_type: newBooking.booking_type,
        provider: newBooking.provider ?? null,
        confirmation_code: newBooking.confirmation_code ?? null,
        status: newBooking.status ?? "pending",
        starts_at: newBooking.starts_at ?? null,
        ends_at: newBooking.ends_at ?? null,
        amount: newBooking.amount ?? null,
        currency: newBooking.currency || "USD",
        notes: newBooking.notes
          ? `${newBooking.name ? newBooking.name + " — " : ""}${newBooking.notes}`
          : (newBooking.name ?? null),
      })
      if (bookingError) throw bookingError
    } catch (e) {
      reportSyncError("addBooking", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }

  return newBooking
}

export async function deleteBooking(bookingId: string, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (trip && trip.bookings) {
    trip.bookings = trip.bookings.filter((b) => b.id !== bookingId)
    saveStore(store)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId)
      if (error) throw error
    } catch (e) {
      reportSyncError("deleteBooking", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}

export async function updateBooking(bookingId: string, patch: any, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (trip && trip.bookings) {
    const idx = trip.bookings.findIndex((b) => b.id === bookingId)
    if (idx >= 0) {
      const existing = trip.bookings[idx] as any
      trip.bookings[idx] = {
        ...existing,
        ...patch,
        id: existing.id,
        trip_id: existing.trip_id || targetTripId,
      }
      saveStore(store)
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await ensureProfile()
      const { error } = await supabase.from("bookings").update({
        booking_type: patch.booking_type ?? patch.bookingType ?? "transport",
        provider: patch.provider ?? null,
        confirmation_code: patch.confirmation_code ?? patch.confirmationCode ?? null,
        status: patch.status ?? "booked",
        starts_at: patch.starts_at ?? patch.startsAt ?? null,
        ends_at: patch.ends_at ?? patch.endsAt ?? null,
        amount: patch.amount ?? null,
        currency: patch.currency || "USD",
        notes:
          patch.notes !== undefined
            ? patch.notes
            : (patch.details ?? null),
      }).eq("id", bookingId)
      if (error) throw error
    } catch (e) {
      reportSyncError("updateBooking", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: targetTripId } }))
  }
}

export async function updateItineraryItem(itemId: string, patch: any, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (trip && trip.itinerary_items) {
    const idx = trip.itinerary_items.findIndex((i) => i.id === itemId)
    if (idx >= 0) {
      const existing = trip.itinerary_items[idx] as any
      trip.itinerary_items[idx] = {
        ...existing,
        ...patch,
        id: existing.id,
        trip_id: existing.trip_id || targetTripId,
      }
      saveStore(store)
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await ensureProfile()
      const { error } = await supabase.from("itinerary_items").update({
        item_type: patch.item_type ?? patch.itemType ?? "transport",
        title: patch.title,
        details: patch.details ?? null,
        starts_at: patch.starts_at ?? patch.startsAt ?? null,
        ends_at: patch.ends_at ?? patch.endsAt ?? null,
        estimated_cost: patch.estimated_cost ?? patch.estimatedCost ?? null,
        currency: patch.currency || "USD",
      }).eq("id", itemId)
      if (error) throw error
    } catch (e) {
      reportSyncError("updateItineraryItem", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: targetTripId } }))
  }
}

// ── Expenses API ──────────────────────────────────────────────────────────────────────────

export async function getExpenses(tripId?: string): Promise<DbExpense[]> {
  const trip = await getTripDetails(tripId)
  return trip?.expenses || []
}

export async function addExpense(expense: any): Promise<DbExpense> {
  // Same camelCase/snake_case normalization; callers may omit tripId entirely,
  // in which case the expense belongs to the active trip.
  const tripId = expense.trip_id ?? expense.tripId ?? getActiveTripId()
  const store = loadStore()
  const trip =
    store.trips.find((t) => t.id === tripId) ||
    store.trips.find((t) => t.id === getActiveTripId())
  if (!trip) throw new Error("Trip not found")

  const createdBy = getCurrentUserId()
  const splitWith = expense.split_with ?? expense.splitWith ?? null
  const newExpense: DbExpense = {
    id: generateUuid(),
    trip_id: tripId,
    category: expense.category || "other",
    description: cleanExpenseDescription(expense.description),
    amount: Number(expense.amount ?? 0),
    currency: expense.currency || "USD",
    expense_date:
      expense.expense_date ??
      expense.expenseDate ??
      new Date().toISOString().slice(0, 10),
    paid_by: expense.paid_by ?? expense.paidBy ?? createdBy ?? undefined,
    split_with: splitWith || undefined,
    created_at: new Date().toISOString(),
  }

  if (!trip.expenses) trip.expenses = []
  trip.expenses.push(newExpense)
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const writeUid = await getWriteUserId()
      await ensureProfile(writeUid || undefined)
      const { error: expenseError } = await supabase.from("expenses").insert({
        id: newExpense.id,
        trip_id: newExpense.trip_id,
        category: newExpense.category,
        description: encodeExpenseSplit(newExpense.description, splitWith),
        amount: Number(newExpense.amount),
        currency: newExpense.currency || "USD",
        expense_date: newExpense.expense_date,
        paid_by: newExpense.paid_by || writeUid || createdBy,
      })
      if (expenseError) throw expenseError
    } catch (e) {
      reportSyncError("addExpense", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }

  return newExpense
}

export async function updateTripBudget(totalBudget: number, tripId?: string): Promise<void> {
  const targetTripId = tripId || getActiveTripId()
  if (!targetTripId) throw new Error("Trip not found")
  const amount = Math.max(0, Number(totalBudget) || 0)
  const store = loadStore()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (!trip) throw new Error("Trip not found")
  trip.total_budget = amount
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from("trips").update({ total_budget: amount }).eq("id", trip.id)
      if (error) throw error
    } catch (e) {
      reportSyncError("updateTripBudget", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }
}

export async function updateTripDates(startDate: string | null, endDate: string | null, tripId?: string): Promise<void> {
  const targetTripId = tripId || getActiveTripId()
  if (!targetTripId) throw new Error("Trip not found")
  if (startDate && endDate && endDate < startDate) throw new Error("End date cannot be before start date.")
  const store = loadStore()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (!trip) throw new Error("Trip not found")
  trip.start_date = startDate || null
  trip.end_date = endDate || null
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from("trips")
        .update({ start_date: startDate || null, end_date: endDate || null })
        .eq("id", trip.id)
      if (error) throw error
    } catch (e) {
      reportSyncError("updateTripDates", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }
}

export async function deleteExpense(expenseId: string, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (trip && trip.expenses) {
    trip.expenses = trip.expenses.filter((e) => e.id !== expenseId)
    saveStore(store)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("expenses").delete().eq("id", expenseId)
    } catch (e) {
      reportSyncError("deleteExpense", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}

// ── Packing List API ──────────────────────────────────────────────────────────────────────────

export async function getPackingItems(tripId?: string): Promise<DbPackingItem[]> {
  const trip = await getTripDetails(tripId)
  return trip?.packing_items || []
}

export async function togglePackingItem(itemId: string, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (!trip || !trip.packing_items) return

  const item = trip.packing_items.find((p) => p.id === itemId)
  if (item) {
    item.is_packed = !item.is_packed
    saveStore(store)

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("packing_items").update({ is_packed: item.is_packed }).eq("id", itemId)
      } catch (e) {
        console.warn("Supabase togglePackingItem error:", e)
      }
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}

export async function addPackingItem(item: any): Promise<DbPackingItem> {
  // Callers pass camelCase (tripId, itemName); normalize so trip_id and
  // item_name are set for the store and the server (trip_id / label NOT NULL).
  const tripId = item.trip_id ?? item.tripId ?? getActiveTripId()
  const store = loadStore()
  const trip =
    store.trips.find((t) => t.id === tripId) ||
    store.trips.find((t) => t.id === getActiveTripId())
  if (!trip) throw new Error("Trip not found")

  const newItem: DbPackingItem = {
    id: generateUuid(),
    trip_id: tripId,
    category: item.category,
    item_name: item.item_name ?? item.itemName,
    is_packed: !!(
      item.is_packed ?? item.isPacked ?? false
    ),
    quantity: Number(item.quantity ?? 1),
    created_at: new Date().toISOString(),
  }

  if (!trip.packing_items) trip.packing_items = []
  trip.packing_items.push(newItem)
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const writeUid = await getWriteUserId()
      await ensureProfile(writeUid || undefined)
      // Table column is `label`; the app model uses `item_name`.
      const { error: packingError } = await supabase.from("packing_items").insert({
        id: newItem.id,
        trip_id: newItem.trip_id,
        created_by: writeUid,
        category: newItem.category,
        label: newItem.item_name,
        is_packed: newItem.is_packed,
        quantity: Number(newItem.quantity ?? 1),
      })
      if (packingError) throw packingError
    } catch (e) {
      reportSyncError("addPackingItem", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }

  return newItem
}

export async function deletePackingItem(itemId: string, tripId?: string): Promise<void> {
  const store = loadStore()
  const targetTripId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetTripId) || store.trips[0]
  if (trip && trip.packing_items) {
    trip.packing_items = trip.packing_items.filter((p) => p.id !== itemId)
    saveStore(store)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("packing_items").delete().eq("id", itemId)
    } catch (e) {
      console.warn("Supabase deletePackingItem error:", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}


// ── Saved Places API ───────────────────────────────────────────────────────

export async function getSavedPlaces(): Promise<DbSavedPlace[]> {
  const store = loadStore()
  if (isSupabaseConfigured && supabase && getCurrentUserId()) {
    try {
      const { data, error } = await supabase.from("saved_places").select("*")
      if (!error && Array.isArray(data)) {
        const remote = data.map((row: any) => ({
          id: row.id,
          name: row.title || "Saved place",
          address: row.notes || row.address || "",
          city: row.city || "",
          country: row.country || "",
          lat: row.lat ?? 0,
          lng: row.lng ?? 0,
          category: row.category || "other",
          rating: row.rating ?? 0,
          image_url: row.image_url || undefined,
          notes: row.notes || undefined,
          created_at: row.created_at,
        }))
        const remoteIds = new Set(remote.map((p) => p.id))
        store.saved_places = [...store.saved_places.filter((p) => !remoteIds.has(p.id)), ...remote]
        saveStore(store)
        return store.saved_places
      }
    } catch (e) {
      console.warn("Supabase getSavedPlaces fallback:", e)
    }
  }
  return store.saved_places
}

export async function addSavedPlace(place: Omit<DbSavedPlace, "id">): Promise<DbSavedPlace> {
  const store = loadStore()
  const newPlace: DbSavedPlace = {
    ...place,
    id: generateUuid(),
    created_at: new Date().toISOString(),
  }

  store.saved_places.unshift(newPlace)
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      const userId = getCurrentUserId()
      if (userId) {
        // Table columns are title/category/notes, not the local names.
        await supabase.from("saved_places").insert({
          id: newPlace.id,
          user_id: userId,
          title: newPlace.name,
          category: newPlace.category,
          notes: newPlace.notes || newPlace.address || null,
        })
      }
    } catch (e) {
      console.warn("Supabase addSavedPlace error:", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }

  return newPlace
}

export async function deleteSavedPlace(placeId: string): Promise<void> {
  const store = loadStore()
  store.saved_places = store.saved_places.filter((p) => p.id !== placeId)
  saveStore(store)

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from("saved_places").delete().eq("id", placeId)
    } catch (e) {
      console.warn("Supabase deleteSavedPlace error:", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
}

export function isPlaceSaved(name: string, city?: string): boolean {
  const store = loadStore()
  const normName = name.trim().toLowerCase()
  return (store.saved_places || []).some((p) => {
    const pName = (p.name || (p as any).title || "").trim().toLowerCase()
    if (pName === normName) return true
    if (city) {
      const pCity = (p.city || "").trim().toLowerCase()
      const normCity = city.trim().toLowerCase()
      return (pName.includes(normName) || normName.includes(pName)) && (pCity === normCity || pCity.includes(normCity))
    }
    return false
  })
}

export async function toggleSavedPlace(place: {
  id?: string
  name: string
  address?: string
  city?: string
  country?: string
  lat?: number
  lng?: number
  category?: string
  rating?: number
  image_url?: string
  notes?: string
}): Promise<boolean> {
  const store = loadStore()
  const normName = place.name.trim().toLowerCase()
  const existing = (store.saved_places || []).find((p) => {
    if (place.id && p.id === place.id) return true
    const pName = (p.name || (p as any).title || "").trim().toLowerCase()
    return pName === normName
  })
  if (existing) {
    await deleteSavedPlace(existing.id)
    return false // now unsaved
  } else {
    await addSavedPlace({
      name: place.name,
      address: place.address || place.city || "",
      city: place.city || "",
      country: place.country || "",
      lat: place.lat ?? 0,
      lng: place.lng ?? 0,
      category: place.category || "places",
      rating: place.rating ?? 4.8,
      image_url: place.image_url,
      notes: place.notes,
    })
    return true // now saved
  }
}

// ── Notifications API ──────────────────────────────────────────────────────

export async function getNotifications() {
  const store = loadStore()
  return store.notifications
}

// ── Profile API ────────────────────────────────────────────────────────────

export const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop"

/**
 * Stock faces used as historical fallbacks. They are NOT the user's photo —
 * treat them as empty everywhere an avatar is resolved, otherwise the user
 * sees a stranger's face (e.g. in the community feed) instead of their own.
 */
const PLACEHOLDER_AVATARS = new Set([
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=40&h=40&fit=crop",
])

export function isPlaceholderAvatar(url?: string | null): boolean {
  if (!url) return true
  const u = url.trim()
  if (!u || u.startsWith("data:,")) return true
  if (PLACEHOLDER_AVATARS.has(u)) return true
  // Same Unsplash photo IDs with different sizing params are still stock.
  return (
    u.includes("photo-1507003211169-0a1dd7228f2d") ||
    u.includes("photo-1534528741775-53994a69daeb") ||
    u.includes("photo-1494790108377-be9c29b29330") ||
    u.includes("photo-1500648767791-00dcc994a43e")
  )
}

/** Null when the value is missing or just a stock placeholder face. */
function realAvatar(url?: string | null): string | null {
  return url && !isPlaceholderAvatar(url) ? url : null
}

/**
 * Best avatar for the current account: uploaded profile photo first, then
 * the auth provider photo, then the local identity, then a fallback.
 * Stock placeholder faces are skipped at every step so the user never sees
 * a stranger's photo as "theirs".
 * Use this everywhere an avatar is shown so the uploaded profile photo
 * appears on ALL screens.
 */
export function getMyAvatarUrl(profile?: { avatarUrl?: string | null } | null, user?: any): string {
  return (
    realAvatar(profile?.avatarUrl) ||
    realAvatar(user?.user_metadata?.avatar_url) ||
    realAvatar(user?.user_metadata?.avatarUrl) ||
    realAvatar(getCurrentAuthUser()?.avatarUrl) ||
    FALLBACK_AVATAR
  )
}

/**
 * Downscale an uploaded photo to a small square JPEG data-URL so it fits
 * in localStorage / the profiles.avatar_url text column and loads fast
 * inside the APK WebView. Works with phone camera + gallery file inputs.
 */
export function processAvatarFile(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read the image."))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Could not read the image."))
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext("2d")
          if (!ctx) {
            resolve(String(reader.result))
            return
          }
          const scale = Math.max(size / img.width, size / img.height)
          const w = img.width * scale
          const h = img.height * scale
          ctx.fillStyle = "#0D0F2E"
          ctx.fillRect(0, 0, size, size)
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
          resolve(canvas.toDataURL("image/jpeg", 0.82))
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Could not read the image."))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export async function getUserProfile() {
  const authUser = getCurrentAuthUser()
  const store = loadStore()

  if (isSupabaseConfigured && supabase && authUser?.id && authUser.id !== "guest") {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single()

      if (!error && data) {
        return {
          ...store.profile,
          fullName: data.full_name || store.profile.fullName,
          username: data.username || store.profile.username,
          // A stock placeholder face stored locally is not the user's photo:
          // prefer the real server avatar, else keep the local custom photo,
          // else empty so callers fall through to the auth-provider photo.
          avatarUrl:
            realAvatar(data.avatar_url) ||
            realAvatar(store.profile.avatarUrl) ||
            "",
          bio: data.bio || store.profile.bio,
          homeCountry: data.home_country || store.profile.homeCountry,
          email: authUser.email,
        }
      }
    } catch (e) {
      console.warn("Supabase getUserProfile fallback to local:", e)
    }
  }

  return {
    ...store.profile,
    email: authUser?.email || "",
    fullName: authUser?.fullName || store.profile.fullName,
    username: authUser?.username || store.profile.username,
  }
}

export async function updateUserProfile(updates: Partial<LocalStoreData["profile"] & { email?: string; bio?: string }>) {
  const store = loadStore()
  store.profile = { ...store.profile, ...updates }
  // The uploaded profile photo must appear on ALL screens: patch the
  // current account's member avatar in every local trip (crew lists,
  // split bills, comments) so no stale Unsplash face survives.
  if (updates.avatarUrl) {
    try {
      const me = getCurrentAuthUser()
      const meId = me?.id
      const meEmail = me?.email?.toLowerCase()
      for (const trip of store.trips) {
        for (const m of trip.members || []) {
          if ((meId && (m.user_id === meId || m.id === meId)) || (meEmail && m.email?.toLowerCase() === meEmail)) {
            m.avatar = updates.avatarUrl
          }
        }
      }
    } catch {}
  }
  saveStore(store)

  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("trypo_local_auth_user")
      if (raw) {
        const u = JSON.parse(raw)
        const updatedUser = {
          ...u,
          email: updates.email || u.email,
          fullName: updates.fullName || u.fullName,
          user_metadata: {
            ...(u.user_metadata || {}),
            full_name: updates.fullName || u.user_metadata?.full_name,
            avatar_url: updates.avatarUrl || u.user_metadata?.avatar_url,
          },
          username: updates.username || u.username,
          bio: updates.bio || u.bio,
          homeCountry: updates.homeCountry || u.homeCountry,
        }
        localStorage.setItem("trypo_local_auth_user", JSON.stringify(updatedUser))
      }
    } catch {}
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (user) {
        // Send only fields the user actually set: an `avatar_url: undefined`
        // must never wipe the stored photo, and the username must satisfy
        // ^[a-z0-9_]{3,30}$ or the whole upsert (avatar included) is rejected
        // and the community keeps showing a stranger's fallback face.
        const payload: Record<string, unknown> = { id: user.id }
        if (updates.fullName !== undefined) payload.full_name = updates.fullName
        if (updates.username !== undefined) {
          payload.username = sanitizeUsernameForDb(updates.username)
        }
        if (updates.avatarUrl) payload.avatar_url = updates.avatarUrl
        if (updates.bio !== undefined) payload.bio = updates.bio
        if (updates.homeCountry !== undefined) payload.home_country = updates.homeCountry
        payload.onboarding_completed = true
        const { error } = await supabase.from("profiles").upsert(payload)
        if (error) reportSyncError("updateUserProfile", error)
      }
    } catch (e) {
      reportSyncError("updateUserProfile", e)
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }

  return store.profile
}

// ── Trip Crew & Collaboration API ─────────────────────────────────────────

export async function getTripMembers(tripId?: string): Promise<DbTripMember[]> {
  const trip = await getTripDetails(tripId)
  if (!trip) return []
  if (!trip.members || trip.members.length === 0) {
    const ownerName = trip.title ? "Organizer" : "Me"
    return [
      {
        id: generateUuid(),
        trip_id: trip.id,
        name: ownerName,
        role: "owner",
        status: "joined",
        joined_at: trip.created_at || new Date().toISOString(),
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
        color: "#3B41C8",
      },
    ]
  }
  return trip.members
}

export async function inviteTripMember(input: {
  tripId?: string
  name?: string
  email?: string
  role: "editor" | "viewer"
}): Promise<DbTripMember> {
  const store = loadStore()
  const targetId = input.tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetId) || store.trips[0]
  if (!trip) throw new Error("Trip not found")

  if (!Array.isArray(trip.members)) trip.members = []

  const avatarSeeds = [
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop",
    "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop",
  ]
  const randomAvatar = avatarSeeds[Math.floor(Math.random() * avatarSeeds.length)]

  const newMember: DbTripMember = {
    id: generateUuid(),
    trip_id: trip.id,
    name: input.name || input.email?.split("@")[0] || "Traveler",
    email: input.email || undefined,
    role: input.role,
    status: "pending",
    joined_at: new Date().toISOString(),
    avatar: randomAvatar,
    color: input.role === "editor" ? "#06C4D4" : "#FF6347",
  }

  trip.members.push(newMember)
  saveStore(store)
  return newMember
}

export async function updateMemberRole(
  tripId: string,
  memberId: string,
  role: "editor" | "viewer",
): Promise<void> {
  const store = loadStore()
  const trip = store.trips.find((t) => t.id === tripId) || store.trips[0]
  if (!trip || !trip.members) return

  const member = trip.members.find((m) => m.id === memberId || m.user_id === memberId)
  if (member && member.role !== "owner") {
    if (isSupabaseConfigured && supabase && member.user_id) {
      try {
        await supabase.from("trip_members").update({ role }).eq("trip_id", tripId).eq("user_id", member.user_id)
      } catch (e) {
        console.warn("Supabase updateMemberRole error:", e)
      }
    }
    member.role = role
    member.color = role === "editor" ? "#06C4D4" : "#FF6347"
    saveStore(store)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId } }))
    }
  }
}

export async function removeMember(tripId: string, memberId: string): Promise<void> {
  const store = loadStore()
  const trip = store.trips.find((t) => t.id === tripId) || store.trips[0]
  if (!trip || !trip.members) return

  const target = trip.members.find((m) => m.id === memberId || m.user_id === memberId)
  if (!target) return

  // Delete the real server membership so RLS access is revoked (owner-only by policy).
  if (isSupabaseConfigured && supabase && target.user_id) {
    try {
      await supabase.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", target.user_id)
    } catch (e) {
      console.warn("Supabase removeMember error:", e)
    }
  }

  trip.members = trip.members.filter(
    (m) => (m.id !== memberId && m.user_id !== memberId && m.id !== target.user_id) || m.role === "owner",
  )
  saveStore(store)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId } }))
  }
}

export async function leaveTrip(tripId: string): Promise<string | null> {
  const authUser = getCurrentAuthUser()
  const store = loadStore()
  const trip = store.trips.find((t) => t.id === tripId)
  // The membership row is keyed to the REAL Supabase session id (auth.uid())
  // because the members_leave policy compares against auth.uid(). Prefer the
  // session user over the local profile so leaving always targets own row.
  // Accounts with no real session (guest/local) have no server row to delete.
  const localUid = getCurrentUserId()
  let sessionUid: string | null = null
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase.auth.getSession()
      if (data?.session?.user?.id) sessionUid = data.session.user.id
    } catch {
      // keep null
    }
  }
  const uid = sessionUid || localUid

  // Remove the real server membership first (members_leave policy lets a
  // non-owner delete their own row). The owner's policy is role <> 'owner',
  // so an accidental leave attempt by the owner errors and is kept locally.
  // If the remote delete fails we keep the trip locally instead of "leaving"
  // silently and having it reappear on the next refresh.
  if (isSupabaseConfigured && supabase && sessionUid) {
    try {
      const { error } = await supabase
        .from("trip_members")
        .delete()
        .eq("trip_id", tripId)
        .eq("user_id", uid)
      if (error) {
        reportSyncError("leaveTrip", error)
        return error.message
      }
      try {
        await supabase
          .from("join_requests")
          .delete()
          .eq("trip_id", tripId)
          .eq("requester_id", uid)
      } catch {
        // Best-effort: the request is only cosmetics once the membership is gone.
      }
    } catch (e: any) {
      reportSyncError("leaveTrip", e)
      return e?.message || "Could not leave the trip"
    }
  }

  if (trip) {
    trip.members = (trip.members || []).filter(
      (m) =>
        m.user_id !== uid &&
        m.user_id !== authUser?.id &&
        m.email?.toLowerCase() !== authUser?.email?.toLowerCase(),
    )
  }
  store.trips = store.trips.filter((t) => t.id !== tripId)
  if (!store.left_trips) store.left_trips = []
  if (!store.left_trips.includes(tripId)) store.left_trips.push(tripId)
  if (getActiveTripId() === tripId) {
    localStorage.removeItem(ACTIVE_TRIP_KEY)
  }
  saveStore(store)

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed"))
  }
  return null
}

export async function getTripInviteCode(tripId?: string): Promise<string> {
  const store = loadStore()
  const targetId = tripId || getActiveTripId()
  const trip = store.trips.find((t) => t.id === targetId) || store.trips[0]
  if (!trip) return generateTripInviteCode("TRIP")

  if (!trip.invite_code) {
    trip.invite_code = generateTripInviteCode(trip.title, trip.id)
    saveStore(store)
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from("trips").update({ invite_code: trip.invite_code }).eq("id", trip.id)
      } catch (e) {
        console.warn("Supabase update invite_code error:", e)
      }
    }
  }

  if (typeof fetch !== "undefined") {
    fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trip),
    }).catch(() => {})
  }

  return trip.invite_code
}

export async function joinTripByCode(
  code: string,
  userInfo?: { id?: string; name?: string; email?: string; avatar?: string },
): Promise<{ success: boolean; trip?: DbTrip; message?: string }> {
  const store = loadStore()
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) {
    return { success: false, message: "Veuillez entrer un code d'invitation." }
  }

  const localUserId = getCurrentUserId()
  console.info("[trypo] join code", cleanCode, "| local uid:", localUserId, "| supabase configured:", Boolean(isSupabaseConfigured && supabase))

  // Server-authoritative join: the invited user becomes a real trip_members row
  // (RLS is enforced by private.is_trip_member), so edits sync between accounts.
  if (isSupabaseConfigured && supabase && localUserId) {
    try {
      const { data, error } = await supabase.rpc("join_trip_by_code", { p_code: cleanCode })
      console.info("[trypo] join RPC result:", error ? `error=${error.message}` : `rows=${Array.isArray(data) ? data.length : data}`)
      if (!error && Array.isArray(data) && data.length > 0) {
        const meta = data[0]
        let joinedTrip = await getTripDetails(meta.trip_id)
        if (!joinedTrip) {
          // The RPC just granted membership, so a direct read is safe here;
          // this is a safety net for any transient post-join read error.
          const { data: directRow, error: directError } = await supabase
            .from("trips")
            .select("*, trip_destinations(*), itinerary_items(*), bookings(*), expenses(*), packing_items(*)")
            .eq("id", meta.trip_id)
            .single()
          if (!directError && directRow) {
            const serverMembers = await fetchServerMembers(meta.trip_id)
            joinedTrip = { ...(directRow as any), server_member: true, members: serverMembers || [] }
          }
        }
        if (joinedTrip) {
          // The RPC granted real server membership: never let the revocation
          // check drop this trip because of a transient read failure.
          ;(joinedTrip as any).server_member = true
          const joinedStore = loadStore()
          const existingIdx = joinedStore.trips.findIndex((t) => t.id === joinedTrip.id)
          if (existingIdx >= 0) joinedStore.trips[existingIdx] = joinedTrip
          else joinedStore.trips.unshift(joinedTrip)
          saveStore(joinedStore)
          setActiveTripId(joinedTrip.id)
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: joinedTrip.id } }))
          }
          return {
            success: true,
            trip: joinedTrip,
            message: meta.already_member
              ? `Vous êtes déjà membre de "${joinedTrip.title}".`
              : `Bienvenue ! Vous avez rejoint "${joinedTrip.title}".`,
          }
        }
      } else if (error && !String(error.message || "").toLowerCase().includes("trip_not_found")) {
        console.warn("join_trip_by_code rpc error:", error.message)
      }
    } catch (e) {
      console.warn("join_trip_by_code rpc unexpected:", e)
    }
  }

  let trip: DbTrip | undefined = store.trips.find(
    (t) =>
      (t.invite_code && t.invite_code.toUpperCase() === cleanCode) ||
      t.id.toUpperCase() === cleanCode ||
      (t.title && t.title.toUpperCase().replace(/\s+/g, "") === cleanCode.replace(/\s+/g, "")),
  )

  // Search across local database stores on this machine/browser
  if (!trip && typeof window !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith("trypo_local_db_")) {
          const raw = localStorage.getItem(k)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed.trips)) {
              const match = parsed.trips.find(
                (t: any) =>
                  (t.invite_code && t.invite_code.toUpperCase() === cleanCode) ||
                  t.id.toUpperCase() === cleanCode ||
                  (t.title && t.title.toUpperCase().replace(/\s+/g, "") === cleanCode.replace(/\s+/g, "")),
              )
              if (match) {
                trip = match
                break
              }
            }
          }
        }
      }
    } catch {}
  }

  if (!trip && typeof fetch !== "undefined") {
    try {
      const res = await fetch(`/api/trips/join?code=${encodeURIComponent(cleanCode)}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.success && data.trip) {
          trip = data.trip
        }
      }
    } catch {}
  }

  if (!trip && isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("trips")
        .select("*, trip_destinations(*), itinerary_items(*), bookings(*), expenses(*), packing_items(*)")
        .or(`invite_code.ilike.${cleanCode},id.ilike.${cleanCode}`)
        .limit(1)

      if (!error && data && data.length > 0) {
        trip = data[0]
      } else {
        const { data: rawData } = await supabase
          .from("trips")
          .select("*")
          .or(`invite_code.ilike.${cleanCode},id.ilike.${cleanCode}`)
          .limit(1)
        if (rawData && rawData.length > 0) {
          trip = rawData[0]
        }
      }
    } catch (e) {
      console.warn("Supabase joinTripByCode fallback:", e)
    }
  }

  if (!trip) {
    console.info("[trypo] join fallback: trip not found for code", cleanCode)
    return {
      success: false,
      message: `Code "${cleanCode}" introuvable. Veuillez vérifier le code et réessayer.`,
    }
  }

  // The local fallback resolved the trip, but this account may not have a
  // real server membership yet — RLS would then block the shared reads/writes
  // that keep the two accounts in sync (edits would only stay on-device).
  // Create the membership when a real Supabase session exists, then reload the
  // server copy so the trip is immediately visible and editable.
  if (
    trip &&
    !(trip as any).server_member &&
    isSupabaseConfigured &&
    supabase
  ) {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session?.user) {
        const { data: rpcData, error: rpcError } = await supabase.rpc("join_trip_by_code", {
          p_code: cleanCode,
        })
        if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
          const serverTrip = await getTripDetails(rpcData[0].trip_id)
          if (serverTrip) {
            ;(serverTrip as any).server_member = true
            trip = serverTrip
          }
        }
      }
    } catch (e) {
      console.warn("[trypo] ensure server membership after local join failed:", e)
    }
  }

  console.info("[trypo] join fallback: resolved trip", trip.id, trip.title, "| from", trip.source || "store/api")

  if (!Array.isArray(trip.members)) {
    trip.members = []
  }

  const userEmail = userInfo?.email || "friend@trypo.app"
  const userName = userInfo?.name || userEmail.split("@")[0] || "Traveler"

  const existingMember = trip.members.find(
    (m) => (userInfo?.id && m.user_id === userInfo.id) || (m.email && m.email.toLowerCase() === userEmail.toLowerCase()),
  )

  if (existingMember) {
    existingMember.status = "joined"
  } else {
    trip.members.push({
      id: generateUuid(),
      trip_id: trip.id,
      user_id: userInfo?.id,
      name: userName,
      email: userEmail,
      role: "editor",
      status: "joined",
      avatar: userInfo?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
      joined_at: new Date().toISOString(),
      color: "#06C4D4",
    })
  }

  // Add the trip to the joining user's local store if not already there
  const existingIdx = store.trips.findIndex((t) => t.id === trip.id)
  if (existingIdx >= 0) {
    store.trips[existingIdx] = trip
  } else {
    store.trips.unshift(trip)
  }

  saveStore(store)
  setActiveTripId(trip.id)

  // Sync updated trip (with new member) back to shared backend
  if (typeof fetch !== "undefined") {
    fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trip),
    }).catch(() => {})
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
  }
  return { success: true, trip, message: `Bienvenue ! Vous avez rejoint "${trip.title}".` }
}

const lastClaimAttempt = new Map<string, number>()
const CLAIM_THROTTLE_MS = 60_000

/**
 * Self-heal for incomplete invite-code joins: the trip sits in this
 * account's local store (with this user in its local roster) but the server
 * has no trip_members row for them — so server reads return nothing and
 * every write is rejected by RLS, meaning neither account ever sees the
 * other's destinations, transport, stays, etc.
 *
 * Claims a real membership via the invite code. NEVER heals trips this
 * account previously held on the server (server_member) — losing that means
 * kicked/left, which must not auto-rejoin — nor trips in left_trips.
 */
export async function claimMissingServerMembership(trip: DbTrip | any): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !trip?.id) return false
  if ((trip as any).server_member) return false
  const now = Date.now()
  if (now - (lastClaimAttempt.get(trip.id) || 0) < CLAIM_THROTTLE_MS) return false
  lastClaimAttempt.set(trip.id, now)
  try {
    const store = loadStore()
    if ((store.left_trips || []).includes(trip.id)) return false
    const { data: sess } = await supabase.auth.getSession()
    const sessionUid = sess?.session?.user?.id
    if (!sessionUid) return false
    if (trip.owner_id && trip.owner_id === sessionUid) return false
    const code = String(trip.invite_code || "").trim()
    if (!code) return false
    const { data, error } = await supabase.rpc("join_trip_by_code", {
      p_code: code.toUpperCase(),
    })
    if (error || !Array.isArray(data) || data.length === 0) return false
    const refreshed = await getTripDetails(trip.id)
    if (refreshed) (refreshed as any).server_member = true
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId: trip.id } }))
    }
    return true
  } catch {
    return false
  }
}

export async function getUserTripPermission(
  tripId?: string,
  userEmailOrId?: string,
): Promise<{ role: TripMemberRole; canEdit: boolean }> {
  const trip = await getTripDetails(tripId)
  if (!trip) return { role: "owner", canEdit: true }

  const members = trip.members || []
  if (members.length === 0) return { role: "owner", canEdit: true }

  if (userEmailOrId) {
    const member = members.find(
      (m) => m.user_id === userEmailOrId || (m.email && m.email.toLowerCase() === userEmailOrId.toLowerCase()),
    )
    if (member) {
      return { role: member.role, canEdit: member.role === "owner" || member.role === "editor" }
    }
  }

  const myRole = members[0]?.role || "owner"
  return { role: myRole, canEdit: myRole === "owner" || myRole === "editor" }
}

// ── Explore / Community API (Supabase-backed) ─────────────────────────────────

export type PublicDestination = {
  id: string
  city: string
  country: string
  countryCode?: string | null
  latitude?: number | null
  longitude?: number | null
  coverImageUrl?: string | null
  description?: string | null
  tags: string[]
  averageDailyBudget?: number | null
}

export type CommunityActivity = {
  id: string
  destinationId?: string | null
  title: string
  category: string
  description?: string | null
  locationName?: string | null
  coverImageUrl?: string | null
  estimatedCost?: number | null
  currency?: string
  durationMinutes?: number | null
}

export type CommunityDestination = { id: string; city: string; country: string; position?: number }

export type CommunityTrip = {
  id: string
  title: string
  summary?: string | null
  coverImageUrl?: string | null
  startDate?: string | null
  endDate?: string | null
  travelStyle?: string | null
  destinationCount: number
  destinations: CommunityDestination[]
  authorName: string
  authorAvatar?: string | null
  createdAt?: string | null
  /** Owner id so the UI can detect "this is my trip". */
  ownerId?: string | null
  /** Accepted crew members (excluding the owner). */
  joinersCount?: number
  /** Number of comments posted on the trip. */
  commentsCount?: number
  /** Number of reactions on the trip. */
  reactionsCount?: number
}

export type CommunityTripPlan = {
  destinations: CommunityDestination[]
  itinerary: Array<{
    id: string
    item_type: string
    title: string
    details?: string | null
    locationName?: string | null
    startsAt?: string | null
  }>
}

export type CommunityTripComment = {
  id: string
  tripId: string
  /** Author id so the UI can show my live photo on my own comments. */
  authorId?: string | null
  authorName: string
  authorAvatar?: string | null
  body: string
  commentType?: "advice" | "opinion" | "question" | "join-interest"
  createdAt?: string | null
}

const DB_COMMENT_TYPE: Record<string, "advice" | "opinion" | "question" | "join-interest"> = {
  advice: "advice",
  opinion: "opinion",
  question: "question",
  join_interest: "join-interest",
}

const UI_COMMENT_TYPE: Record<string, string> = {
  "advice": "advice",
  "opinion": "opinion",
  "question": "question",
  "join-interest": "join_interest",
}

export async function getPublishedDestinations(): Promise<PublicDestination[]> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) return []
  try {
    const { data, error } = await supabase
      .from("destinations")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: true })
    if (error) {
      console.warn("getPublishedDestinations error:", error.message)
      return []
    }
    if (!Array.isArray(data)) return []
    return data.map((d: any) => ({
      id: d.id,
      city: d.city,
      country: d.country,
      countryCode: d.country_code,
      latitude: d.latitude != null ? Number(d.latitude) : null,
      longitude: d.longitude != null ? Number(d.longitude) : null,
      coverImageUrl: d.cover_image_url,
      description: d.description,
      tags: d.tags || [],
      averageDailyBudget: d.average_daily_budget != null ? Number(d.average_daily_budget) : null,
    }))
  } catch (e) {
    console.warn("getPublishedDestinations fallback:", e)
    return []
  }
}

export async function getActivitiesForDestination(destinationId: string): Promise<CommunityActivity[]> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId() || !destinationId) return []
  try {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("destination_id", destinationId)
      .eq("is_published", true)
      .order("created_at", { ascending: true })
    if (error) {
      console.warn("getActivitiesForDestination error:", error.message)
      return []
    }
    if (!Array.isArray(data)) return []
    return data.map((a: any) => ({
      id: a.id,
      destinationId: a.destination_id,
      title: a.title,
      category: a.category,
      description: a.description,
      locationName: a.location_name,
      coverImageUrl: a.cover_image_url,
      estimatedCost: a.estimated_cost != null ? Number(a.estimated_cost) : null,
      currency: a.currency,
      durationMinutes: a.duration_minutes,
    }))
  } catch (e) {
    console.warn("getActivitiesForDestination fallback:", e)
    return []
  }
}

type CommunityFeedRow = {
  id: string
  title: string
  summary?: string | null
  cover_image_url?: string | null
  start_date?: string | null
  end_date?: string | null
  travel_style?: string | null
  created_at?: string | null
  author_name: string
  author_avatar?: string | null
  owner_id?: string | null
  joiners_count?: number | string | null
  comments_count?: number | string | null
  reactions_count?: number | string | null
}

export async function getCommunityTrips(): Promise<CommunityTrip[]> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) return []
  try {
    const { data, error } = await supabase.rpc("get_community_feed")
    if (error) {
      console.warn("getCommunityTrips error:", error.message)
      // Fall back to the plain query so the feed still works on projects that
      // have not applied the community_live migration yet.
      return getCommunityTripsLegacy()
    }
    if (!Array.isArray(data)) return []
    const rows = data as CommunityFeedRow[]
    if (rows.length === 0) return []

    const ids = rows.map((r) => r.id)
    const { data: destRows } = await supabase
      .from("trip_destinations")
      .select("id,trip_id,city,country,position")
      .in("trip_id", ids)
      .order("position", { ascending: true })
    const destsByTrip: Record<string, CommunityDestination[]> = {}
    for (const d of destRows || []) {
      const list = destsByTrip[d.trip_id] || (destsByTrip[d.trip_id] = [])
      list.push({
        id: d.id,
        city: d.city,
        country: d.country,
        position: Number(d.position ?? 0),
      })
    }

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      coverImageUrl: r.cover_image_url,
      startDate: r.start_date,
      endDate: r.end_date,
      travelStyle: r.travel_style,
      destinationCount: (destsByTrip[r.id] || []).length,
      destinations: destsByTrip[r.id] || [],
      authorName: r.author_name || "Traveler",
      authorAvatar: r.author_avatar,
      createdAt: r.created_at,
      ownerId: r.owner_id,
      joinersCount: Number(r.joiners_count ?? 0),
      commentsCount: Number(r.comments_count ?? 0),
      reactionsCount: Number(r.reactions_count ?? 0),
    }))
  } catch (e) {
    console.warn("getCommunityTrips fallback:", e)
    return []
  }
}

async function getCommunityTripsLegacy(): Promise<CommunityTrip[]> {
  try {
    const { data, error } = await supabase!
      .from("trips")
      .select(
        "id,title,summary,cover_image_url,start_date,end_date,travel_style,created_at,trip_destinations(id,city,country,position),profiles!trips_owner_id_fkey(id,full_name,avatar_url)",
      )
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(24)
    if (error) {
      console.warn("getCommunityTrips legacy error:", error.message)
      return []
    }
    if (!Array.isArray(data)) return []

    return data.map((t: any) => {
      const owner = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles
      return {
        id: t.id,
        title: t.title,
        summary: t.summary,
        coverImageUrl: t.cover_image_url,
        startDate: t.start_date,
        endDate: t.end_date,
        travelStyle: t.travel_style,
        destinationCount: Array.isArray(t.trip_destinations) ? t.trip_destinations.length : 0,
        destinations: (Array.isArray(t.trip_destinations) ? t.trip_destinations : []).map((d: any) => ({
          id: d.id,
          city: d.city,
          country: d.country,
          position: Number(d.position ?? 0),
        })),
        authorName: owner?.full_name || "Traveler",
        authorAvatar: owner?.avatar_url,
        createdAt: t.created_at,
        ownerId: t.owner_id,
        joinersCount: 0,
        commentsCount: 0,
      }
    })
  } catch (e) {
    console.warn("getCommunityTrips fallback:", e)
    return []
  }
}

export async function getCommunityTripPlan(tripId: string): Promise<CommunityTripPlan> {
  const empty: CommunityTripPlan = { destinations: [], itinerary: [] }
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId() || !tripId) return empty
  try {
    const [{ data: dests, error: de }, { data: items, error: ie }] = await Promise.all([
      supabase
        .from("trip_destinations")
        .select("id,city,country,position")
        .eq("trip_id", tripId)
        .order("position", { ascending: true }),
      supabase
        .from("itinerary_items")
        .select("id,item_type,title,details,location_name,starts_at")
        .eq("trip_id", tripId)
        .order("position", { ascending: true }),
    ])
    if (!de) {
      empty.destinations = (Array.isArray(dests) ? dests : []).map((d: any) => ({
        id: d.id,
        city: d.city,
        country: d.country,
        position: Number(d.position ?? 0),
      }))
    }
    if (!ie) {
      empty.itinerary = (Array.isArray(items) ? items : []).map((i: any) => ({
        id: i.id,
        item_type: i.item_type,
        title: i.title,
        details: i.details,
        locationName: i.location_name,
        startsAt: i.starts_at,
      }))
    }
    return empty
  } catch (e) {
    console.warn("getCommunityTripPlan fallback:", e)
    return empty
  }
}

export async function getCommunityTripComments(tripId: string): Promise<CommunityTripComment[]> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId() || !tripId) return []
  try {
    const { data, error } = await supabase
      .from("trip_comments")
      .select("id,trip_id,author_id,body,comment_type,created_at,profiles!trip_comments_author_id_fkey(id,full_name,avatar_url)")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
    if (error) {
      console.warn("getCommunityTripComments error:", error.message)
      return []
    }
    if (!Array.isArray(data)) return []
    return data.map((c: any) => {
      const author = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
      return {
        id: c.id,
        tripId: c.trip_id,
        authorId: c.author_id,
        authorName: author?.full_name || "Traveler",
        authorAvatar: author?.avatar_url,
        body: c.body,
        commentType: DB_COMMENT_TYPE[c.comment_type] ?? "opinion",
        createdAt: c.created_at,
      }
    })
  } catch (e) {
    console.warn("getCommunityTripComments fallback:", e)
    return []
  }
}

export async function addCommunityTripComment(
  tripId: string,
  body: string,
  commentType: "advice" | "opinion" | "question" | "join-interest" = "opinion",
): Promise<CommunityTripComment | null> {
  const userId = getCurrentUserId()
  if (!isSupabaseConfigured || !supabase || !userId || !tripId) return null
  try {
    const { data, error } = await supabase
      .from("trip_comments")
      .insert({
        trip_id: tripId,
        author_id: userId,
        body: body.trim(),
        comment_type: UI_COMMENT_TYPE[commentType] || "opinion",
      })
      .select()
      .single()
    if (error) {
      console.warn("addCommunityTripComment error:", error.message)
      return null
    }
    const authUser = getCurrentAuthUser()
    // Resolve the freshest photo (uploaded profile photo first) so the saved
    // comment carries MY picture — not a stale cached avatar or a fallback.
    let myAvatar: string | null = null
    try {
      const profile = await getUserProfile()
      const u = (await supabase.auth.getUser()).data.user as any
      myAvatar = getMyAvatarUrl(
        profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : null,
        u || undefined,
      )
    } catch {
      myAvatar = authUser?.avatarUrl || null
    }
    return {
      id: data?.id,
      tripId,
      authorId: userId,
      authorName: authUser?.fullName || "You",
      authorAvatar: myAvatar,
      body: (data?.body as string) || body.trim(),
      commentType: DB_COMMENT_TYPE[(data as any)?.comment_type] ?? commentType,
      createdAt: data?.created_at,
    }
  } catch (e) {
    console.warn("addCommunityTripComment fallback:", e)
    return null
  }
}
