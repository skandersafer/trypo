import { useEffect, useRef, useState } from "react"
import { supabase, isSupabaseConfigured } from "./supabase"
import {
  getCommunityTripComments,
  getCommunityTrips,
  getCurrentUserId,
  type CommunityTrip,
  type CommunityTripComment,
} from "./trips"

// ── Types ──────────────────────────────────────────────────────────────────
export type JoinRequestStatus = "pending" | "accepted" | "declined"

export type CommunityJoinRequest = {
  id: string
  trip_id: string
  requester_id: string
  message?: string | null
  status: JoinRequestStatus
  created_at?: string | null
  requester_name?: string
  requester_avatar?: string | null
  trip_title?: string | null
}

export type MyJoinStatus = {
  requestId: string | null
  status: JoinRequestStatus | "none"
}

export type MyJoinState = MyJoinStatus & {
  isMember: boolean
  memberRole: string | null
}

// ── RPC wrappers ───────────────────────────────────────────────────────────
export const NOT_SIGNED_IN_MESSAGE =
  "Sign in with your Trypo account to request to join a trip"
export const ACCOUNT_MISMATCH_MESSAGE =
  "You're not signed in as this account — sign in with this account to send join requests"

/** True when a real Supabase session exists (so server RPCs will work). */
export async function hasServerSession(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  try {
    const { data } = await supabase.auth.getSession()
    return Boolean(data?.session)
  } catch {
    return false
  }
}

/**
 * The identity the server actually judges membership against (`auth.uid()`),
 * falling back to the local account id. All membership/request queries must
 * use THIS id, or the client pre-check can disagree with the RPC and produce
 * a phantom "already in" / missing membership state.
 */
export async function getServerUserId(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return getCurrentUserId()
  try {
    const { data } = await supabase.auth.getSession()
    if (data?.session?.user?.id) return data.session.user.id
  } catch {
    /* fall through */
  }
  return getCurrentUserId()
}

/** Live indicator of a real Supabase session (server actions work). */
export function useServerSignedIn() {
  const [signedIn, setSignedIn] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured || !supabase) {
      setChecked(true)
      return
    }
    const check = () => {
      void supabase.auth.getSession().then(({ data }) => {
        if (!active) return
        setSignedIn(Boolean(data?.session))
        setChecked(true)
      })
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => {
      active = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  return { signedIn, checked }
}

export async function requestToJoinTrip(
  tripId: string,
  message?: string,
): Promise<{
  status: string
  error?: string
  requestId?: string | null
  alreadyInTrip?: boolean
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { status: "none", error: "Community is unavailable right now" }
  }
  const uid = getCurrentUserId()
  if (!uid) {
    return { status: "none", error: NOT_SIGNED_IN_MESSAGE }
  }
  try {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess?.session) {
      return { status: "none", error: NOT_SIGNED_IN_MESSAGE }
    }
    // RPCs are keyed to the real Supabase identity (auth.uid()). If the
    // signed-in session belongs to a DIFFERENT account than the one the user
    // is acting as (e.g. a local profile after an account switch), the server
    // would judge the OTHER account's membership — refuse instead of showing
    // a misleading "already a member" for a request that never reaches anyone.
    if (sess.session.user.id !== uid) {
      return { status: "none", error: ACCOUNT_MISMATCH_MESSAGE }
    }
  } catch {
    return { status: "none", error: NOT_SIGNED_IN_MESSAGE }
  }
  try {
    const { data, error } = await supabase.rpc("request_to_join_trip", {
      p_trip_id: tripId,
      p_message: (message || "").trim() || null,
    })
    if (error) return { status: "none", error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    window.dispatchEvent(
      new CustomEvent("trypo:db_changed", { detail: { tripId } }),
    )
    return {
      status: row?.status || "pending",
      requestId: row?.request_id || null,
      alreadyInTrip: Boolean(row?.already_in_trip),
    }
  } catch (e: any) {
    return { status: "none", error: e?.message || "Could not send request" }
  }
}

export async function respondToJoinRequest(
  requestId: string,
  accept: boolean,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (!isSupabaseConfigured || !supabase || !(await hasServerSession())) {
    return { ok: false, error: NOT_SIGNED_IN_MESSAGE }
  }
  try {
    const { data, error } = await supabase.rpc("respond_to_join_request", {
      p_request_id: requestId,
      p_accept: accept,
    })
    if (error) return { ok: false, error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    if (row?.trip_id) {
      window.dispatchEvent(
        new CustomEvent("trypo:db_changed", { detail: { tripId: row.trip_id } }),
      )
    }
    return { ok: true, status: row?.status }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not respond" }
  }
}

export async function setTripVisibility(
  tripId: string,
  isPublic: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) {
    return { ok: false, error: "Sign in to share trips" }
  }
  try {
    const { error } = await supabase.rpc("set_trip_visibility", {
      p_trip_id: tripId,
      p_public: isPublic,
    })
    if (error) return { ok: false, error: error.message }
    window.dispatchEvent(new CustomEvent("trypo:db_changed", { detail: { tripId } }))
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not update visibility" }
  }
}

export async function toggleTripReaction(
  tripId: string,
): Promise<{ active: boolean; total: number; error?: string }> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) {
    return { active: false, total: 0, error: "Sign in to react" }
  }
  try {
    const { data, error } = await supabase.rpc("toggle_trip_reaction", {
      p_trip_id: tripId,
    })
    if (error) return { active: false, total: 0, error: error.message }
    const row = Array.isArray(data) ? data[0] : data
    return { active: Boolean(row?.active), total: Number(row?.total || 0) }
  } catch (e: any) {
    return { active: false, total: 0, error: e?.message }
  }
}

export async function getTripReactionState(
  tripId: string,
): Promise<{ myActive: boolean; total: number }> {
  const uid = getCurrentUserId()
  if (!isSupabaseConfigured || !supabase || !uid || !tripId) return { myActive: false, total: 0 }
  try {
    const [{ data: mine }, { count }] = await Promise.all([
      supabase
        .from("trip_reactions")
        .select("user_id")
        .eq("trip_id", tripId)
        .eq("user_id", uid)
        .limit(1),
      supabase
        .from("trip_reactions")
        .select("user_id", { count: "exact", head: true })
        .eq("trip_id", tripId),
    ])
    return { myActive: Array.isArray(mine) && mine.length > 0, total: count || 0 }
  } catch {
    return { myActive: false, total: 0 }
  }
}

export async function getMyJoinRequestStatus(tripId: string): Promise<MyJoinStatus> {
  const uid = (await getServerUserId()) || getCurrentUserId()
  if (!isSupabaseConfigured || !supabase || !uid || !tripId) {
    return { requestId: null, status: "none" }
  }
  try {
    const { data, error } = await supabase
      .from("join_requests")
      .select("id,status")
      .eq("trip_id", tripId)
      .eq("requester_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
    if (error || !Array.isArray(data) || data.length === 0) {
      return { requestId: null, status: "none" }
    }
    return { requestId: data[0].id, status: data[0].status as JoinRequestStatus }
  } catch {
    return { requestId: null, status: "none" }
  }
}

export async function getTripJoinRequests(tripId: string): Promise<CommunityJoinRequest[]> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId() || !tripId) return []
  try {
    const { data, error } = await supabase
      .from("join_requests")
      .select(
        "id,trip_id,requester_id,message,status,created_at,profiles!join_requests_requester_id_fkey(id,full_name,avatar_url)",
      )
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
    if (error) {
      console.warn("getTripJoinRequests error:", error.message)
      return []
    }
    if (!Array.isArray(data)) return []
    return data.map((r: any) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        id: r.id,
        trip_id: r.trip_id,
        requester_id: r.requester_id,
        message: r.message,
        status: r.status,
        created_at: r.created_at,
        requester_name: p?.full_name || "Traveler",
        requester_avatar: p?.avatar_url,
      }
    })
  } catch (e) {
    console.warn("getTripJoinRequests fallback:", e)
    return []
  }
}

/**
 * All join requests for every trip the current account manages (i.e. owns).
 * RLS (`can_manage_trip`) lets the owner read them regardless of which trip is
 * active, so the organizer never misses a request sent to another trip.
 */
export async function getMyJoinRequests(): Promise<CommunityJoinRequest[]> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) return []
  try {
    const { data, error } = await supabase
      .from("join_requests")
      .select(
        "id,trip_id,requester_id,message,status,created_at,profiles!join_requests_requester_id_fkey(id,full_name,avatar_url),trips!join_requests_trip_id_fkey(id,title)",
      )
      .order("created_at", { ascending: false })
    if (error) {
      console.warn("getMyJoinRequests error:", error.message)
      return []
    }
    if (!Array.isArray(data)) return []
    return data.map((r: any) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      const t = Array.isArray(r.trips) ? r.trips[0] : r.trips
      return {
        id: r.id,
        trip_id: r.trip_id,
        requester_id: r.requester_id,
        message: r.message,
        status: r.status,
        created_at: r.created_at,
        requester_name: p?.full_name || "Traveler",
        requester_avatar: p?.avatar_url,
        trip_title: t?.title || null,
      }
    })
  } catch (e) {
    console.warn("getMyJoinRequests fallback:", e)
    return []
  }
}

// ── Realtime hooks ─────────────────────────────────────────────────────────
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** Live community feed: public trips with joiner/comment counters. */
export function useCommunityFeed() {
  const [trips, setTrips] = useState<CommunityTrip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const list = await getCommunityTrips()
      if (active) setTrips(list)
    }
    void load().finally(() => {
      if (active) setLoading(false)
    })

    if (!isSupabaseConfigured || !supabase) return
    const channel = supabase.channel(`community-feed-${uuid()}`)
    const reload = () => {
      void load()
    }
    for (const table of ["trips", "trip_comments", "trip_members"] as const) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, reload)
    }
    channel.subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  return { trips, loading }
}

/**
 * Reloads whenever the signed-in account's own membership changes anywhere
 * (e.g. the organizer accepting a join request on another device/browser).
 * Keeps "My Trips" fresh without relying on navigation or the active-trip poll.
 */
export function useMyTripsRealtime(onReload: () => void) {
  const uid = getCurrentUserId()
  const cbRef = useRef(onReload)
  cbRef.current = onReload

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !uid) return
    const channel = supabase.channel(`my-trips-${uid}-${uuid()}`)
    const reload = () => cbRef.current()
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_members", filter: `user_id=eq.${uid}` },
      reload,
    )
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [uid])
}

/** Realtime comments for a community trip. */
export function useTripComments(tripId?: string | null) {
  const [comments, setComments] = useState<CommunityTripComment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setComments([])
    if (!tripId) {
      setLoading(false)
      return
    }
    let active = true
    const load = async () => {
      const list = await getCommunityTripComments(tripId)
      if (active) setComments(list)
    }
    void load().finally(() => {
      if (active) setLoading(false)
    })

    if (!isSupabaseConfigured || !supabase) return () => {
      active = false
    }
    const channel = supabase.channel(`trip-comments-${tripId}-${uuid()}`)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_comments", filter: `trip_id=eq.${tripId}` },
      () => void load(),
    )
    channel.subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [tripId])

  return { comments, loading }
}

/** True when the current account already has a trip_members row for a trip. */
export async function getMyTripMembership(
  tripId: string,
): Promise<{ isMember: boolean; role: string | null; status: string | null }> {
  const uid = (await getServerUserId()) || getCurrentUserId()
  if (!isSupabaseConfigured || !supabase || !uid || !tripId) {
    return { isMember: false, role: null, status: null }
  }
  try {
    const { data, error } = await supabase
      .from("trip_members")
      .select("role,status")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .limit(1)
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    if (error || !row) return { isMember: false, role: null, status: null }
    return { isMember: true, role: row.role, status: row.status }
  } catch {
    return { isMember: false, role: null, status: null }
  }
}

/** Live join state: real trip membership + any join request I sent. */
export function useMyJoinStatus(tripId?: string | null) {
  const [status, setStatus] = useState<MyJoinState>({
    requestId: null,
    status: "none",
    isMember: false,
    memberRole: null,
  })
  const [loading, setLoading] = useState(true)
  const loadRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!tripId) {
      setStatus({ requestId: null, status: "none", isMember: false, memberRole: null })
      setLoading(false)
      return
    }
    let active = true
    const load = async () => {
      const [req, member] = await Promise.all([
        getMyJoinRequestStatus(tripId),
        getMyTripMembership(tripId),
      ])
      if (!active) return
      const memberStatus: JoinRequestStatus | "none" = member.isMember
        ? member.status === "invited" || member.status === "pending"
          ? "pending"
          : "accepted"
        : req.status
      setStatus({
        requestId: req.requestId,
        status: memberStatus,
        isMember: member.isMember,
        memberRole: member.role,
      })
    }
    loadRef.current = () => void load()
    void load().finally(() => {
      if (active) setLoading(false)
    })

    if (!isSupabaseConfigured || !supabase) return () => {
      active = false
    }
    const channel = supabase.channel(`my-join-${tripId}-${uuid()}`)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "join_requests", filter: `trip_id=eq.${tripId}` },
      () => void load(),
    )
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
      () => void load(),
    )
    const onDbChanged = () => void load()
    window.addEventListener("trypo:db_changed", onDbChanged)
    channel.subscribe()
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", onDbChanged)
      void supabase.removeChannel(channel)
    }
  }, [tripId])

  return {
    status,
    loading,
    refresh: () => {
      loadRef.current?.()
    },
  }
}
export function useTripJoinRequests(tripId?: string | null) {
  const [requests, setRequests] = useState<CommunityJoinRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tripId) {
      setRequests([])
      setLoading(false)
      return
    }
    let active = true
    const load = async () => {
      const list = await getTripJoinRequests(tripId)
      if (active) setRequests(list)
    }
    void load().finally(() => {
      if (active) setLoading(false)
    })

    if (!isSupabaseConfigured || !supabase) return () => {
      active = false
    }
    const channel = supabase.channel(`trip-joins-${tripId}-${uuid()}`)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "join_requests", filter: `trip_id=eq.${tripId}` },
      () => void load(),
    )
    channel.subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [tripId])

  return { requests, loading }
}

/** Live join requests across all trips the current account owns. */
export function useMyJoinRequests() {
  const [requests, setRequests] = useState<CommunityJoinRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const list = await getMyJoinRequests()
      if (active) setRequests(list)
    }
    void load().finally(() => {
      if (active) setLoading(false)
    })

    if (!isSupabaseConfigured || !supabase) return () => {
      active = false
    }
    const channel = supabase.channel(`my-joins-${uuid()}`)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "join_requests" },
      () => void load(),
    )
    const onDbChanged = () => void load()
    window.addEventListener("trypo:db_changed", onDbChanged)
    channel.subscribe()
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", onDbChanged)
      void supabase.removeChannel(channel)
    }
  }, [])

  return { requests, loading }
}
export function useTripReactions(tripId?: string | null) {
  const [myActive, setMyActive] = useState(false)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tripId) {
      setMyActive(false)
      setTotal(0)
      setLoading(false)
      return
    }
    let active = true
    const load = async () => {
      const s = await getTripReactionState(tripId)
      if (active) {
        setMyActive(s.myActive)
        setTotal(s.total)
      }
    }
    void load().finally(() => {
      if (active) setLoading(false)
    })

    if (!isSupabaseConfigured || !supabase) return () => {
      active = false
    }
    const channel = supabase.channel(`trip-reactions-${tripId}-${uuid()}`)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trip_reactions", filter: `trip_id=eq.${tripId}` },
      () => void load(),
    )
    channel.subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [tripId])

  return { myActive, total, loading }
}

// ── Notifications (bell) ────────────────────────────────────────────────────
export type DbNotification = {
  id: string
  user_id: string
  type: string
  title: string
  body?: string | null
  data?: Record<string, unknown> | null
  read_at?: string | null
  created_at?: string | null
}

/** Mark the current user's notifications as read (all unread, or just `ids`). */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) return
  try {
    let q = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
    q = ids && ids.length > 0 ? q.in("id", ids) : q.is("read_at", null)
    await q
    window.dispatchEvent(new CustomEvent("trypo:notifications_changed"))
  } catch (e) {
    console.warn("markNotificationsRead error:", e)
  }
}

/** Remove one of the current user's notifications. */
export async function deleteNotification(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !getCurrentUserId()) return
  try {
    await supabase.from("notifications").delete().eq("id", id)
    window.dispatchEvent(new CustomEvent("trypo:notifications_changed"))
  } catch (e) {
    console.warn("deleteNotification error:", e)
  }
}

/**
 * Live notifications for the current user, delivered via the realtime
 * publication on `notifications`. RLS keeps every client on its own rows.
 */
export function useMyNotifications() {
  const [notifications, setNotifications] = useState<DbNotification[]>([])
  const [loading, setLoading] = useState(true)
  const uid = getCurrentUserId()

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !uid) {
      setNotifications([])
      setLoading(false)
      return
    }
    let active = true

    const load = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)
      if (active && !error && Array.isArray(data)) setNotifications(data)
    }
    void load().finally(() => {
      if (active) setLoading(false)
    })

    const onResync = () => void load()
    window.addEventListener("trypo:notifications_changed", onResync)

    const channel = supabase.channel(`my-notifications-${uid}-${uuid()}`)
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload: any) => {
          const row = payload.new as DbNotification | undefined
          if (!active || !row?.id) return
          setNotifications((prev) =>
            prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, 200),
          )
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload: any) => {
          const row = payload.new as DbNotification | undefined
          if (!active || !row?.id) return
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? row : n)))
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications" },
        (payload: any) => {
          const id = payload.old?.id as string | undefined
          if (!active || !id) return
          setNotifications((prev) => prev.filter((n) => n.id !== id))
        },
      )
      .subscribe()

    return () => {
      active = false
      window.removeEventListener("trypo:notifications_changed", onResync)
      void supabase.removeChannel(channel)
    }
  }, [uid])

  const unread = notifications.filter((n) => !n.read_at).length
  return { notifications, loading, unread }
}