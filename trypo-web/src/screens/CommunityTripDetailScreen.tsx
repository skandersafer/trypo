import { useEffect, useMemo, useRef, useState } from "react"
import type { Screen } from "../App"
import ShareSheet from "../components/ShareSheet"
import { useAuth, useMyAvatar } from "../lib/auth"
import {
  addCommunityTripComment,
  fetchServerMembers,
  getCommunityTripPlan,
  leaveTrip,
  type CommunityTripComment,
  type DbTripMember,
} from "../lib/trips"
import {
  NOT_SIGNED_IN_MESSAGE,
  ACCOUNT_MISMATCH_MESSAGE,
  requestToJoinTrip,
  toggleTripReaction,
  useMyJoinStatus,
  useServerSignedIn,
  useTripComments,
  useTripReactions,
} from "../lib/communityLive"
import { getCommunityTripSelection } from "../lib/community"
import { useIsDesktop } from "../lib/useIsDesktop"
import { HeartIcon, NoteIcon, PlaneIcon, SparklesIcon } from "../components/icons"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  trip?: CommunityTripData
}

export type CommunityTripData = {
  id: number | string
  author: string
  avatar: string
  flag: string
  title: string
  route: string
  duration: string
  image: string
  reactions: number
  joiners: number
  spots: number
  about: string
  budget: string
  style: string
  ownerId?: string | null
  stops: {
    city: string
    emoji: string
    dates: string
    days: number
    highlights: string[]
  }[]
}

type CommentType = "advice" | "opinion" | "question" | "join-interest"

type Comment = {
  id: string
  name: string
  avatar: string
  authorId?: string | null
  flag: string
  time: string
  text: string
  likes: number
  liked: boolean
  type: CommentType
}

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop"

const typeLabel: Record<CommentType, { label: string; color: string; bg: string }> = {
  advice: { label: "Tip", color: "#3B41C8", bg: "rgba(59,65,200,0.08)" },
  opinion: {
    label: "Opinion",
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
  },
  question: {
    label: "Question",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
  },
  "join-interest": {
    label: "Wants to join",
    color: "#FF6347",
    bg: "rgba(255,99,71,0.08)",
  },
}

function formatTime(iso?: string | null): string {
  if (!iso) return "Recently"
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "Now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString()
}

function toComment(c: CommunityTripComment): Comment {
  return {
    id: c.id || `c-${Math.random()}`,
    name: c.authorName || "Traveler",
    avatar: c.authorAvatar || DEFAULT_AVATAR,
    authorId: c.authorId,
    flag: "🌍",
    time: formatTime(c.createdAt),
    text: c.body,
    likes: 0,
    liked: false,
    type: c.commentType || "opinion",
  }
}

export default function CommunityTripDetailScreen({
  navigate,
  goBack,
  trip: tripProp,
}: Props) {
  const [current, setCurrent] = useState<CommunityTripSelection | null>(() =>
    getCommunityTripSelection(),
  )
  const viewTrip = useMemo<CommunityTripData | null>(() => {
    if (tripProp?.id) return tripProp
    const sel = current
    if (!sel?.meta) return null
    const plan = sel.plan
    const dests =
      plan.destinations.length > 0 ? plan.destinations : sel.meta.destinations
    const stops: CommunityTripData["stops"] = dests.map((d) => {
      const related = (plan.itinerary || []).filter(
        (i) =>
          i.locationName &&
          i.locationName.toLowerCase().includes(d.city.toLowerCase()),
      )
      const highlights = related.map((i) => i.title)
      return {
        city: d.city,
        emoji: "📍",
        dates: "Dates to be set",
        days: 1,
        highlights:
          highlights.length > 0
            ? highlights
            : ["See the public plan for this stop"],
      }
    })
    const style = sel.meta.travelStyle || "Community trip"
    return {
      id: sel.meta.id,
      author: sel.meta.authorName || "Traveler",
      avatar: sel.meta.authorAvatar || DEFAULT_AVATAR,
      flag: "🌍",
      title: sel.meta.title,
      route:
        stops.length > 0
          ? stops.map((s) => s.city).join(" → ")
          : style,
      duration:
        [sel.meta.startDate, sel.meta.endDate].filter(Boolean).join(" – ") ||
        `${stops.length} stop${stops.length === 1 ? "" : "s"}`,
      image:
        sel.meta.coverImageUrl ||
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=500&fit=crop&auto=format",
      reactions: 0,
      joiners: sel.meta.joinersCount ?? 0,
      spots: 0,
      about:
        sel.meta.summary ||
        "A community trip shared on Trypo. Tap a stop to explore what travelers are planning.",
      budget: "—",
      style,
      ownerId: sel.meta.ownerId,
      stops,
    }
  }, [current, tripProp])

  const [tab, setTab] = useState<"plan" | "comments">("plan")
  const [newComment, setNewComment] = useState("")
  const [commentType, setCommentType] = useState<CommentType>("opinion")
  const [showShare, setShowShare] = useState(false)
  const [expandedStop, setExpandedStop] = useState<string | null>(null)
  const [requestFlow, setRequestFlow] = useState<"idle" | "sending" | "error">("idle")
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestInfo, setRequestInfo] = useState<string | null>(null)
  const [trailingComments, setTrailingComments] = useState<Comment[]>([])
  const [crew, setCrew] = useState<DbTripMember[]>([])
  const [sentOptimistic, setSentOptimistic] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leavingTrip, setLeavingTrip] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  // Guards rapid double-taps / double-Enter from inserting the same row twice.
  const lastSentRef = useRef<{ text: string; at: number } | null>(null)

  const contentId = String(tripProp?.id ?? current?.meta?.id ?? "")
  const fetchedForId = useRef<string | null>(null)

  // Live data (realtime when Supabase is enabled)
  const { comments: serverComments } = useTripComments(contentId)
  const { status: joinStatus, isMember: acceptedMember, refresh: refreshJoinStatus } =
    useMyJoinStatus(contentId)
  const { myActive: myReaction, total: reactionTotal } = useTripReactions(contentId)
  const { signedIn } = useServerSignedIn()

  useEffect(() => {
    if (!contentId || fetchedForId.current === contentId) return
    fetchedForId.current = contentId
    let active = true
    void getCommunityTripPlan(contentId).then((plan) => {
      if (!active || !plan.destinations.length) return
      setCurrent((prev) => (prev ? { ...prev, plan } : prev))
    })
    return () => {
      active = false
    }
  }, [contentId])

  // Accepted crew roster (members/owner only — RLS). Refreshes when the
  // organizer accepts a join request elsewhere (trypo:db_changed).
  useEffect(() => {
    setCrew([])
    if (!contentId) return
    let active = true
    const loadCrew = async () => {
      const list = await fetchServerMembers(contentId)
      if (active && Array.isArray(list)) setCrew(list)
    }
    void loadCrew()
    const onDbChanged = () => void loadCrew()
    window.addEventListener("trypo:db_changed", onDbChanged)
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", onDbChanged)
    }
  }, [contentId])

  // Once the server confirms pending/accepted, drop the optimistic flip.
  useEffect(() => {
    if (joinStatus !== "none") setSentOptimistic(false)
  }, [joinStatus])

  const comments = useMemo<Comment[]>(() => {
    const server = serverComments.map(toComment)
    // De-dupe: an optimistic comment that the server already echoes back
    // (same id after save, or same author+text via realtime) must appear
    // once — otherwise every new comment shows twice.
    const serverIds = new Set(server.map((c) => c.id))
    const serverBodies = new Set(server.map((c) => `${c.name}‖${c.text}`))
    const pending = trailingComments.filter(
      (c) =>
        !serverIds.has(c.id) &&
        !serverBodies.has(c.text ? `${c.name}‖${c.text}` : ""),
    )
    // Newest first for the list; optimistic/trailing comments go on top.
    return [...pending, ...server.reverse()]
  }, [serverComments, trailingComments])

  const { user } = useAuth()
  const myAvatar = useMyAvatar()
  const isDesktop = useIsDesktop()
  const userName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Me"
  const isOwner = Boolean(viewTrip?.ownerId && user?.id && viewTrip.ownerId === user.id)

  const addComment = () => {
    const text = newComment.trim()
    if (!text) return
    // Same text within 2s → double submit, ignore.
    const now = Date.now()
    if (lastSentRef.current?.text === text && now - lastSentRef.current.at < 2000) return
    lastSentRef.current = { text, at: now }
    const optimistic: Comment = {
      id: `local-${now}`,
      name: `${userName} (You)`,
      avatar: myAvatar,
      authorId: user?.id || null,
      flag: "🌍",
      time: "Now",
      text,
      likes: 0,
      liked: false,
      type: commentType,
    }
    setTrailingComments((prev) => [optimistic, ...prev])
    setNewComment("")
    const tripId = viewTrip?.id ? String(viewTrip.id) : ""
    if (!tripId) return
    void addCommunityTripComment(tripId, optimistic.text, commentType).then(
      (saved) => {
        if (!saved) return
        // Drop the optimistic entry — the realtime feed delivers the saved
        // row, and the memo above hides it meanwhile so it never doubles.
        setTrailingComments((prev) =>
          prev.filter(
            (c) => c.id !== optimistic.id && !(c.text === saved.body && c.name === `${userName} (You)`),
          ),
        )
      },
    )
  }

  const joinRequested = sentOptimistic || joinStatus === "pending"

  const joinLabel = isOwner
    ? "Your trip"
    : !signedIn
      ? "Sign in to Join"
      : acceptedMember
        ? "Leave trip"
        : joinRequested
          ? "Requested"
          : joinStatus === "declined"
            ? "Request again"
            : "Request to Join"

  const sendJoinRequest = async () => {
    const tripId = viewTrip?.id ? String(viewTrip.id) : ""
    if (!tripId) return
    setRequestFlow("sending")
    setRequestError(null)
    setRequestInfo(null)
    const message =
      commentType === "join-interest" && newComment.trim()
        ? newComment.trim()
        : undefined
    const res = await requestToJoinTrip(tripId, message)
    if (res.error) {
      setRequestFlow("error")
      setRequestError(res.error)
      return
    }
    setRequestFlow("idle")
    if (res.alreadyInTrip) {
      setRequestInfo(
        isOwner
          ? "This is your trip — manage join requests from Trip Social"
          : "You're already part of this trip's crew",
      )
      return
    }
    setRequestInfo("Request sent — the organizer will review it")
    setSentOptimistic(true)
    void refreshJoinStatus()
  }

  const onJoinTap = () => {
    if (!signedIn) {
      navigate("auth")
      return
    }
    if (isOwner) {
      setRequestError(null)
      setRequestInfo(
        "This is your trip — manage join requests from Trip Social",
      )
      return
    }
    // Real membership (not the request status): a member leaves, others join.
    if (acceptedMember) {
      setShowLeaveModal(true)
      return
    }
    if (joinDisabled) return
    void sendJoinRequest()
  }

  const joinDisabled = joinRequested || requestFlow === "sending"

  const confirmLeaveTrip = async () => {
    const tripId = viewTrip?.id ? String(viewTrip.id) : ""
    if (!tripId) return
    setLeavingTrip(true)
    setLeaveError(null)
    const msg = await leaveTrip(tripId)
    if (msg) {
      setLeaveError(msg)
      setLeavingTrip(false)
      return
    }
    setShowLeaveModal(false)
    setLeavingTrip(false)
    setSentOptimistic(false)
    setRequestError(null)
    setRequestInfo("You left this trip — it was removed from your trips.")
    void refreshJoinStatus()
  }

  if (!viewTrip) {
    return (
      <div className="min-h-full bg-surface flex flex-col items-center justify-center px-8 text-center">
        <div className="pt-12" />
        <h1 className="text-navy font-black text-[18px] mb-2">
          No community trip selected
        </h1>
        <p className="text-slate-400 text-[13px] mb-6 leading-relaxed">
          Pick a trip from the community feed to see its full plan and join the
          discussion.
        </p>
        <button
          onClick={() => navigate("trip-social")}
          className="px-6 py-3 rounded-2xl text-white font-black text-[14px]"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
          }}
        >
          Browse community trips
        </button>
      </div>
    )
  }

  const trip = viewTrip

  return (
    <div className="min-h-full bg-surface">
      {/* Hero */}
      <div className={isDesktop ? "relative h-[380px]" : "relative h-[240px]"}>
        <img
          src={trip.image}
          alt={trip.title}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(13,15,46,0.75) 100%)",
          }}
        />

        <button
          onClick={() => setShowShare(true)}
          className="absolute top-12 right-5 md:right-8 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="13" cy="3" r="2" stroke="white" strokeWidth="1.5" />
            <circle cx="3" cy="8" r="2" stroke="white" strokeWidth="1.5" />
            <circle cx="13" cy="13" r="2" stroke="white" strokeWidth="1.5" />
            <path
              d="M5 7l6-3M5 9l6 3"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          onClick={() => goBack("trip-social")}
          className="absolute top-12 left-5 md:left-8 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {trip.spots > 0 && (
          <div
            className="absolute top-12 left-16 px-3 py-1.5 rounded-full text-[11px] font-black text-white"
            style={{ background: "rgba(255,99,71,0.9)" }}
          >
            {trip.spots} spot{trip.spots > 1 ? "s" : ""} left
          </div>
        )}

        <div className="absolute bottom-4 left-5 right-5 md:left-8 md:right-8">
          <p className="text-white font-black text-[22px] md:text-[30px] leading-tight mb-1">
            {trip.title}
          </p>
          <p className="text-white/60 text-[12px]">{trip.route}</p>
        </div>
      </div>

      {/* Author + stats */}
      <div
        className="bg-white px-5 md:px-8 py-3.5 flex items-center gap-3"
        style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
      >
        <img
          src={isOwner ? myAvatar : trip.avatar}
          className="w-10 h-10 rounded-full object-cover"
          alt=""
          style={{ border: "2px solid #3B41C8" }}
        />
        <div className="flex-1">
          <p className="text-navy font-black text-[14px]">
            {trip.author}
          </p>
          <p className="text-slate-400 text-[11px]">
            {trip.duration} · {trip.budget}
          </p>
        </div>
        <div className="flex gap-3 text-[12px] text-slate-400">
          <span className="flex items-center gap-1">
            <HeartIcon size={12} />
            <span className="font-bold text-navy">{reactionTotal}</span>
            <span className="text-slate-400">likes</span>
          </span>
          <span className="flex items-center gap-1">
            <PlaneIcon size={12} />
            <span className="font-bold text-navy">{trip.joiners + (acceptedMember ? 1 : 0)}</span>
            <span className="text-slate-400">going</span>
          </span>
          <span className="flex items-center gap-1">
            <NoteIcon size={12} />
            <span className="font-bold text-navy">{comments.length}</span>
            <span className="text-slate-400">comments</span>
          </span>
        </div>
      </div>

      {/* Accepted crew roster (visible to members/owner) */}
      {crew.length > 0 && (
        <div className="px-5 md:px-8 py-4 bg-white border-t border-slate-50 flex items-center gap-3 overflow-hidden mb-4">
          <span className="text-[10px] font-black text-slate-400 tracking-wide uppercase shrink-0">
            Crew
          </span>
          <div className="flex -space-x-2 shrink-0">
            {crew.slice(0, 6).map((m) => (
              <img
                key={m.user_id}
                src={m.user_id && user?.id && m.user_id === user.id ? myAvatar : m.avatar}
                alt=""
                title={m.name}
                className="w-7 h-7 rounded-full object-cover border-2 border-white"
              />
            ))}
          </div>
          <p className="text-[11px] font-bold text-navy truncate">
            {crew.slice(0, 3).map((m) => m.name).join(", ")}
            {crew.length > 3 ? ` +${crew.length - 3}` : ""}
          </p>
        </div>
      )}

      {/* Reaction + Join row */}
      <div className="px-5 md:px-8 py-4 flex gap-2 bg-white border-t border-slate-50 mb-4 items-stretch">
        <button
          onClick={() => {
            if (contentId) void toggleTripReaction(contentId)
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold flex-1 justify-center min-h-[44px] whitespace-nowrap"
          style={{
            background: myReaction ? "rgba(255,99,71,0.1)" : "rgba(241,245,249,1)",
            color: myReaction ? "#FF6347" : "#64748b",
            outline: myReaction ? "2px solid rgba(255,99,71,0.3)" : "none",
          }}
        >
          <SparklesIcon size={14} />
          <span>Epic{reactionTotal > 0 && ` ${reactionTotal}`}</span>
        </button>
        <button
          onClick={() => navigate("trip-social")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold flex-1 justify-center min-h-[44px] whitespace-nowrap"
          style={{
            background: "rgba(241,245,249,1)",
            color: "#3B41C8",
          }}
        >
          <NoteIcon size={14} />
          <span>Comment</span>
        </button>
        <button
          onClick={onJoinTap}
          disabled={joinDisabled || requestFlow === "sending"}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-black flex-1 justify-center text-white min-h-[44px] whitespace-nowrap"
          style={{
            background:
              isOwner
                ? "rgba(16,185,129,0.9)"
                : acceptedMember
                  ? "linear-gradient(135deg, #FF6347, #E03E1F)"
                  : "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: joinDisabled ? "none" : "0 4px 12px rgba(59,65,200,0.3)",
          }}
        >
          {requestFlow === "sending" ? "Sending…" : joinLabel}
        </button>
      </div>

      {requestFlow === "error" && requestError && (
        <div className="px-5 md:px-8 mb-4">
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
            {requestError}
          </div>
          {(requestError === NOT_SIGNED_IN_MESSAGE ||
            requestError === ACCOUNT_MISMATCH_MESSAGE) && (
            <button
              onClick={() => navigate("auth")}
              className="w-full mt-2 py-2.5 rounded-xl text-[12px] font-black"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                color: "white",
              }}
            >
              Sign in to request to join
            </button>
          )}
        </div>
      )}

      {requestInfo && (
        <div className="px-5 md:px-8 mb-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-bold">
            {requestInfo}
          </div>
        </div>
      )}

      {/* About */}
      <div className="px-5 md:px-8 py-4 bg-white border-t border-slate-50 mb-4">
        <p className="text-slate-600 text-[13px] leading-relaxed mb-2">
          {trip.about}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {trip.style.split(" · ").map((s) => (
            <span
              key={s}
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
              style={{ background: "rgba(59,65,200,0.07)", color: "#3B41C8" }}
            >
              {s}
            </span>
          ))}
        </div>
        {isOwner && (
          <button
            onClick={() => navigate("trip-social")}
            className="mt-3 w-full py-2.5 rounded-xl text-[12px] font-black"
            style={{
              background: "rgba(59,65,200,0.08)",
              color: "#3B41C8",
            }}
          >
            Manage join requests
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 md:px-8 mb-4">
        {(["plan", "comments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-full text-[12px] font-bold relative"
            style={{
              background: tab === t ? "#3B41C8" : "white",
              color: tab === t ? "white" : "#64748b",
              boxShadow:
                tab === t
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {t === "plan"
              ? `Trip Plan (${trip.stops.length} stops)`
              : `Comments (${comments.length})`}
          </button>
        ))}
      </div>

      {/* ── PLAN TAB ── */}
      {tab === "plan" && (
        <div className="px-5 md:px-8 pb-8">
          <div className="flex flex-col">
            {trip.stops.map((stop, i) => (
              <div key={stop.city} className="flex gap-3 items-start">
                {/* Timeline */}
                <div
                  className="flex flex-col items-center flex-shrink-0"
                  style={{ width: "32px" }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    }}
                  >
                    {i + 1}
                  </div>
                  {i < trip.stops.length - 1 && (
                    <div
                      className="w-[2px] flex-1 my-1"
                      style={{
                        background:
                          "linear-gradient(to bottom, #06C4D4, #3B41C8)",
                        minHeight: "28px",
                      }}
                    />
                  )}
                </div>

                {/* Card */}
                <div className="flex-1 pb-3">
                  <button
                    className="w-full bg-white rounded-2xl text-left"
                    style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
                    onClick={() =>
                      setExpandedStop(
                        expandedStop === stop.city ? null : stop.city,
                      )
                    }
                  >
                    <div className="flex items-center justify-between p-3.5">
                      <div>
                        <h3 className="text-navy font-black text-[15px]">
                          {stop.city}
                        </h3>
                        <p className="text-slate-400 text-[12px]">
                          {stop.dates}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                          style={{
                            background: "rgba(59,65,200,0.08)",
                            color: "#3B41C8",
                          }}
                        >
                          {stop.days}d
                        </span>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          opacity="0.3"
                          style={{
                            transform:
                              expandedStop === stop.city
                                ? "rotate(90deg)"
                                : "none",
                            transition: "transform 0.2s",
                          }}
                        >
                          <path
                            d="M5 3l4 4-4 4"
                            stroke="#0D0F2E"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>

                    {expandedStop === stop.city && (
                      <div className="px-4 pb-4 border-t border-slate-50">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-3 mb-2">
                          Highlights
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {stop.highlights.map((h) => (
                            <div key={h} className="flex items-center gap-2">
                              <div
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: "#06C4D4" }}
                              />
                              <span className="text-slate-600 text-[12px]">
                                {h}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Join CTA */}
          <button
            onClick={onJoinTap}
            disabled={joinDisabled || requestFlow === "sending"}
            className="w-full py-4 rounded-2xl text-white font-black text-[15px] mt-2"
            style={{
              background:
                joinStatus === "accepted" || isOwner
                  ? "rgba(16,185,129,0.9)"
                  : "linear-gradient(135deg, #3B41C8, #06C4D4)",
              boxShadow: joinDisabled ? "none" : "0 8px 24px rgba(59,65,200,0.3)",
            }}
          >
            {requestFlow === "sending"
              ? "Sending…"
              : joinRequested
                ? "Join Request Sent"
                : joinLabel}
          </button>
          {joinRequested && !isOwner && (
            <p className="text-center text-slate-400 text-[11px] mt-2">
              {trip.author} will review your request and get back to you
            </p>
          )}
          {joinStatus === "accepted" && !isOwner && (
            <p className="text-center text-emerald-600 text-[11px] mt-2">
              You're part of the crew — see you on the road!
            </p>
          )}
        </div>
      )}

      {/* ── Share sheet ── */}
      {showShare && (
        <ShareSheet
          title={trip.title}
          subtitle={trip.route + " · " + trip.duration}
          link={`https://trypo-app.vercel.app/community/trip/${trip.id}`}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* ── COMMENTS TAB ── */}
      {tab === "comments" && (
        <div className="px-5 md:px-8 pb-8">
          {/* Type selector */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
            {(Object.keys(typeLabel) as CommentType[]).map((t) => (
              <button
                key={t}
                onClick={() => setCommentType(t)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold"
                style={{
                  background: commentType === t ? typeLabel[t].bg : "white",
                  color: commentType === t ? typeLabel[t].color : "#94a3b8",
                  outline:
                    commentType === t
                      ? `2px solid ${typeLabel[t].color}40`
                      : "none",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
              >
                {typeLabel[t].label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 mb-5">
            <img
              src={myAvatar}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              alt=""
            />
            <div
              className="flex-1 bg-white rounded-2xl px-3 py-2.5 flex items-center gap-2"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
            >
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
                placeholder={
                  commentType === "join-interest"
                    ? "Tell them why you want to join…"
                    : commentType === "advice"
                      ? "Share a tip for this route…"
                      : commentType === "question"
                        ? "Ask a question…"
                        : "Share your opinion…"
                }
                className="flex-1 text-[13px] text-navy outline-none bg-transparent placeholder:text-slate-300"
              />
              {newComment.length > 0 && (
                <button
                  onClick={addComment}
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M11 1L1 6l4 1 1 4L11 1z" fill="white" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Comments */}
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "flex flex-col gap-3"}>
            {comments.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <p className="text-navy font-black text-[14px]">
                  Start the discussion
                </p>
                <p className="text-slate-400 text-[11px] mt-1">
                  Ask about the route or share a tip with the crew.
                </p>
              </div>
            )}
            {comments.map((c) => {
              const badge = typeLabel[c.type]
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-[18px] p-4"
                  style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <img
                      src={
                        c.authorId && user?.id && c.authorId === user.id
                          ? myAvatar
                          : c.avatar
                      }
                      className="w-8 h-8 rounded-full object-cover"
                      alt=""
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-navy font-black text-[13px]">
                          {c.name}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[10px]">{c.time}</p>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-[9px] font-black flex-shrink-0"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[13px] leading-relaxed mb-2">
                    {c.text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Leave this trip confirmation */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm">
          <div className="bg-white rounded-[28px] max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-2xl font-black mb-3.5 border border-orange-100">
              !
            </div>
            <h3 className="text-[17px] font-black text-navy mb-1.5">
              Leave this trip?
            </h3>
            <p className="text-slate-500 text-[13px] leading-relaxed mb-6">
              You will be removed from the crew of{" "}
              <strong className="text-navy">« {trip.title} »</strong> and the
              trip will disappear from your trips.
            </p>
            {leaveError && (
              <div className="mb-6 w-full p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
                {leaveError}
              </div>
            )}
            <div className="flex w-full gap-2.5">
              <button
                onClick={() => setShowLeaveModal(false)}
                disabled={leavingTrip}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-[13px] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmLeaveTrip()}
                disabled={leavingTrip}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {leavingTrip ? "Leaving…" : "Yes, leave"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}