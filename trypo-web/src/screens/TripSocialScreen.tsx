import { useEffect, useMemo, useRef, useState } from "react"
import type { Screen } from "../App"
import { useAuth, useMyAvatar } from "../lib/auth"
import {
  getCommunityTripPlan,
  addCommunityTripComment,
  getTripDetails,
  type CommunityTrip as BackendTrip,
  type CommunityTripComment,
  type DbTrip,
} from "../lib/trips"
import {
  respondToJoinRequest,
  setTripVisibility,
  useCommunityFeed,
  useMyJoinRequests,
  useTripComments,
} from "../lib/communityLive"
import { setCommunityTripSelection } from "../lib/community"
import CommunityTripCover, { formatTripDateRange } from "../components/CommunityTripCover"
import { useIsDesktop } from "../lib/useIsDesktop"
import {
  GlobeIcon,
  HeartIcon,
  LockIcon,
  NoteIcon,
  PlaneIcon,
  QuestionIcon,
  SparklesIcon,
  UsersIcon,
} from "../components/icons"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Reaction = "epic" | "save" | "join"

type CommentType = "advice" | "opinion" | "question" | "join-interest"

type Comment = {
  id: string
  name: string
  avatar: string
  authorId?: string | null
  flag: string
  time: string
  text: string
  type: CommentType
}

const DEFAULT_AVATAR =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop"

const DEMO_IMAGE =
  "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=400&fit=crop&auto=format"

const typeLabel: Record<CommentType, { label: string; color: string; bg: string; Icon: (p: { size?: number }) => React.ReactElement }> = {
  advice: { label: "Tip", color: "#3B41C8", bg: "rgba(59,65,200,0.08)", Icon: SparklesIcon },
  opinion: { label: "Opinion", color: "#7C3AED", bg: "rgba(124,58,237,0.08)", Icon: NoteIcon },
  question: { label: "Question", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", Icon: QuestionIcon },
  "join-interest": {
    label: "Wants to join",
    color: "#FF6347",
    bg: "rgba(255,99,71,0.08)",
    Icon: PlaneIcon,
  },
}

function formatTime(iso?: string | null): string {
  if (!iso) return "Recently"
  const d = new Date(iso)
  const min = Math.floor((Date.now() - d.getTime()) / 60_000)
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
    type: c.commentType || "opinion",
  }
}

export default function TripSocialScreen({ navigate, goBack }: Props) {
  const { user } = useAuth()
  const myAvatar = useMyAvatar()
  const isDesktop = useIsDesktop()
  const [ownerTrip, setOwnerTrip] = useState<DbTrip | null>(null)
  const [shared, setShared] = useState(false)
  const [reactions, setReactions] = useState<Record<Reaction, number>>({
    epic: 0,
    save: 0,
    join: 0,
  })
  const [myReaction, setMyReaction] = useState<Reaction | null>(null)
  const [tab, setTab] = useState<"post" | "requests" | "community">("post")
  const [showShareModal, setShowShareModal] = useState(false)
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null)
  const [shareMsg, setShareMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [newComment, setNewComment] = useState("")
  const [commentType, setCommentType] = useState<CommentType>("opinion")
  const [trailingComments, setTrailingComments] = useState<Comment[]>([])
  const [busyRequest, setBusyRequest] = useState<string | null>(null)
  // Guards rapid double-taps / double-Enter from inserting the same row twice.
  const lastSentRef = useRef<{ text: string; at: number } | null>(null)

  const tripId = ownerTrip?.id || null
  const isOwner = Boolean(
    ownerTrip?.owner_id && user?.id && String(ownerTrip.owner_id) === user.id,
  )

  // Live data (realtime when Supabase is configured)
  const { trips: liveCommunityTrips } = useCommunityFeed()
  const { comments: serverComments } = useTripComments(tripId)
  const { requests: joinRequests } = useMyJoinRequests()

  const loadOwnerTrip = async () => {
    const t = await getTripDetails()
    setOwnerTrip(t || null)
    if (t) setShared(t.visibility === "public")
  }

  useEffect(() => {
    void loadOwnerTrip()
    const onDb = () => void loadOwnerTrip()
    window.addEventListener("trypo:db_changed", onDb)
    return () => window.removeEventListener("trypo:db_changed", onDb)
  }, [])

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
    return [...pending, ...server.reverse()]
  }, [serverComments, trailingComments])

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
      type: commentType,
    }
    setTrailingComments((prev) => [optimistic, ...prev])
    setNewComment("")
    if (!tripId) return
    void addCommunityTripComment(tripId, optimistic.text, commentType).then(
      (saved) => {
        if (!saved) return
        // Drop the optimistic entry — the realtime feed delivers the saved
        // row (same id/body), and the memo above hides it meanwhile.
        setTrailingComments((prev) =>
          prev.filter(
            (c) => c.id !== optimistic.id && !(c.text === saved.body && c.name === `${userName} (You)`),
          ),
        )
      },
    )
  }

  const openCommunityTrip = (trip: BackendTrip) => {
    const plan = { destinations: trip.destinations, itinerary: [] }
    setCommunityTripSelection({ meta: trip, plan })
    void getCommunityTripPlan(trip.id).then((livePlan) => {
      setCommunityTripSelection({ meta: trip, plan: livePlan })
    })
    navigate("community-trip-detail")
  }

  const react = (r: Reaction) => {
    setReactions((prev) => {
      const n = { ...prev }
      if (myReaction === r) {
        n[r]--
        setMyReaction(null)
      } else {
        if (myReaction) n[myReaction]--
        n[r]++
        setMyReaction(r)
      }
      return n
    })
    if (myReaction !== r) setMyReaction(r)
    else setMyReaction(null)
  }

  const handleRequest = async (reqId: string, accept: boolean) => {
    setBusyRequest(reqId)
    setShareMsg(null)
    await respondToJoinRequest(reqId, accept)
    setBusyRequest(null)
  }

  const pickVisibility = async (isPublic: boolean) => {
    setShared(isPublic)
    setShowShareModal(false)
    setShareMsg(null)
    if (!tripId || !isOwner) {
      if (!isOwner && tripId) {
        setShareMsg({ ok: false, text: "Only the trip owner can change visibility." })
      }
      return
    }
    const res = await setTripVisibility(tripId, isPublic)
    if (res.ok) {
      setShareMsg({
        ok: true,
        text: isPublic
          ? "Your trip is now live to the community"
          : "Your trip is back to private",
      })
    } else {
      setShareMsg({ ok: false, text: res.error || "Could not update visibility" })
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(
        tripId ? `https://trypo-app.vercel.app/community/trip/${tripId}` : "https://trypo-app.vercel.app",
      )
      setShareMsg({ ok: true, text: "Link copied to clipboard!" })
    } catch {
      setShareMsg({ ok: false, text: "Could not copy the link" })
    }
  }

  const userName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Alex"

  const pending = joinRequests.filter((r) => r.status === "pending")
  const acceptedList = joinRequests.filter((r) => r.status === "accepted")

  const heroTitle = ownerTrip?.title || "Tunisia Coast Escape"
  const heroRoute =
    (ownerTrip?.trip_destinations || []).length > 0
      ? (ownerTrip.trip_destinations || [])
          .slice()
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
          .map((d: any) => d.city)
          .join(" → ")
      : ownerTrip?.title
        ? "Open the plan to set destinations"
        : "Tunis → Sousse → Sfax"
  const heroDates =
    formatTripDateRange(ownerTrip?.start_date, ownerTrip?.end_date) || undefined
  const heroImage = ownerTrip?.cover_image_url || DEMO_IMAGE

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-4">
        <button
          onClick={() => goBack("home")}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="#0D0F2E"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-[20px] md:text-[24px] font-black text-navy">Trip Community</h1>
          <p className="text-slate-400 text-[12px]">
            {heroTitle} · {shared ? "Public" : "Private"}
          </p>
        </div>
        <button
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black"
          style={{
            background: shared
              ? "rgba(16,185,129,0.12)"
              : "rgba(59,65,200,0.1)",
            color: shared ? "#10b981" : "#3B41C8",
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: shared ? "#10b981" : "#94a3b8" }}
          />
          {shared ? "Live" : "Share"}
        </button>
      </div>

      {/* Share confirmation toast */}
      {shareMsg && (
        <div className="px-5 md:px-8 mb-3">
          <div
            className={`p-3 rounded-xl text-[12px] font-bold ${
              shareMsg.ok
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {shareMsg.text}
          </div>
        </div>
      )}

      {/* Your trip card */}
      <div className="px-5 md:px-8 mb-4">
        <div
          className="rounded-[22px] overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(59,65,200,0.12)" }}
        >
          <div className={isDesktop ? "relative h-[220px]" : "relative h-[140px]"}>
            <img
              src={heroImage}
              alt={heroTitle}
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(13,15,46,0.85) 0%, transparent 55%)",
              }}
            />
            <div className="absolute bottom-3 left-4 right-4">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-white font-black text-[16px]">{heroTitle}</p>
              </div>
              <p className="text-white/60 text-[11px]">
                {heroRoute}
                {heroDates ? ` · ${heroDates}` : ""}
              </p>
            </div>
            {shared && (
              <div
                className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(16,185,129,0.9)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <span className="text-white text-[10px] font-black">Public</span>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="bg-white px-4 py-3 flex items-center gap-4">
            {[
              { val: "312", label: "Views" },
              { val: String(reactions.epic + reactions.save), label: "Reactions" },
              { val: String(pending.length), label: "Requests" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="text-navy font-black text-[14px]">{s.val}</span>
                <span className="text-slate-400 text-[11px]">{s.label}</span>
              </div>
            ))}
            <div className="ml-auto flex -space-x-2">
              {acceptedList.slice(0, 3).map((r) => (
                <img
                  key={r.id}
                  src={
                    r.requester_avatar ||
                    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop"
                  }
                  className="w-6 h-6 rounded-full object-cover border-2 border-white"
                  alt=""
                />
              ))}
              {acceptedList.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-brand/10 border-2 border-white flex items-center justify-center">
                  <span className="text-[8px] font-black text-brand">
                    +{acceptedList.length - 3}
                  </span>
                </div>
              )}
              {acceptedList.length === 0 && (
                <div className="w-6 h-6 rounded-full bg-brand/10 border-2 border-white flex items-center justify-center">
                  <span className="text-[8px] font-black text-brand">+0</span>
                </div>
              )}
            </div>
          </div>

          {/* Reaction bar */}
          <div className="bg-white border-t border-slate-50 px-4 pb-4 pt-1 flex gap-2">
            {[
              { key: "epic" as Reaction, label: "Epic", color: "#FF6347" },
              { key: "save" as Reaction, label: "Save", color: "#3B41C8" },
              { key: "join" as Reaction, label: "Join me!", color: "#06C4D4" },
            ].map((r) => (
              <button
                key={r.key}
                onClick={() => react(r.key)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold text-[12px] transition-all"
                style={{
                  background: myReaction === r.key ? `${r.color}18` : "rgba(241,245,249,1)",
                  color: myReaction === r.key ? r.color : "#64748b",
                  outline: myReaction === r.key ? `2px solid ${r.color}40` : "none",
                }}
              >
                {r.key === "epic" ? (
                  <SparklesIcon size={14} />
                ) : r.key === "save" ? (
                  <HeartIcon size={14} />
                ) : (
                  <PlaneIcon size={14} />
                )}
                <span>{reactions[r.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 md:px-8 mb-4">
        {(["post", "requests", "community"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-full text-[11px] font-bold relative"
            style={{
              background: tab === t ? "#3B41C8" : "white",
              color: tab === t ? "white" : "#64748b",
              boxShadow:
                tab === t
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {t === "post"
              ? "Comments"
              : t === "requests"
                ? "Join"
                : "Explore"}
            {t === "requests" && pending.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-coral text-white text-[9px] font-black flex items-center justify-center">
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── COMMENTS TAB ── */}
      {tab === "post" && (
        <div className="px-5 md:px-8 pb-8">
          {/* Type selector */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-1">
            {(Object.keys(typeLabel) as CommentType[]).map((t) => {
              const TypeIcon = typeLabel[t].Icon
              const selected = commentType === t
              return (
                <button
                  key={t}
                  onClick={() => setCommentType(t)}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] flex items-center gap-1.5 transition-all"
                  style={{
                    background: selected ? "#0D0F2E" : "white",
                    color: selected ? "white" : "#64748b",
                    fontWeight: selected ? 800 : 600,
                    border: selected ? "1px solid #0D0F2E" : "1px solid #EEF0F8",
                    boxShadow: selected
                      ? "0 4px 12px rgba(13,15,46,0.25)"
                      : "0 1px 4px rgba(0,0,0,0.06)",
                  }}
                >
                  <TypeIcon size={13} />
                  {typeLabel[t].label}
                </button>
              )
            })}
          </div>

          {/* Add comment */}
          <div className="flex gap-2 mb-4">
            <img
              src={myAvatar}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              alt=""
            />
            <div
              className="flex-1 flex gap-2 bg-white rounded-2xl px-3 py-2 items-center"
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
                    : "Share advice, opinion or question…"
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

          {/* Comment list */}
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-3"}>
            {comments.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <p className="text-navy font-black text-[14px]">No discussion yet</p>
                <p className="text-slate-400 text-[11px] mt-1">
                  Be the first to share advice or ask a question.
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
                      className="px-2 py-0.5 rounded-full text-[9px] font-black"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[13px] leading-relaxed">
                    {c.text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── JOIN REQUESTS TAB ── */}
      {tab === "requests" && (
        <div className="px-5 md:px-8 pb-8">
          {!isOwner && tripId && (
            <div className="mb-4 p-3 rounded-xl bg-slate-100 text-slate-500 text-[11px] font-semibold">
              Only the trip owner can approve join requests.
            </div>
          )}
          {pending.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <p className="text-navy font-black text-[16px]">No pending requests</p>
              <p className="text-slate-400 text-[12px] mt-1">
                When someone wants to join your trip, they'll appear here
              </p>
            </div>
          )}

          {pending.length > 0 && (
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5" : "flex flex-col gap-3 mb-5"}>
              {pending.map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded-[20px] overflow-hidden"
                  style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
                >
                  <button
                    className="w-full p-4 flex items-center gap-3 text-left"
                    onClick={() =>
                      setExpandedRequest(expandedRequest === req.id ? null : req.id)
                    }
                  >
                    <div className="relative">
                      <img
                        src={
                          req.requester_avatar ||
                          "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop"
                        }
                        className="w-12 h-12 rounded-full object-cover"
                        alt=""
                        style={{ border: "2px solid #3B41C8" }}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-navy font-black text-[15px]">
                        {req.requester_name || "Traveler"}
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        Wants to join{" "}
                        {req.trip_title ? `«${req.trip_title}»` : "your trip"} ·{" "}
                        {formatTime(req.created_at)}
                      </p>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      opacity="0.3"
                      style={{
                        transform: expandedRequest === req.id ? "rotate(90deg)" : "none",
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
                  </button>

                  {expandedRequest === req.id && (
                    <div className="px-4 pb-4">
                      <div className="bg-surface rounded-xl p-3 mb-4">
                        <p className="text-slate-600 text-[12px] leading-relaxed italic">
                          "{req.message || "I'd love to join this trip!"}"
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={busyRequest === req.id}
                          onClick={() => void handleRequest(req.id, false)}
                          className="flex-1 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-50"
                          style={{
                            background: "rgba(239,68,68,0.08)",
                            color: "#ef4444",
                          }}
                        >
                          Decline
                        </button>
                        <button
                          disabled={busyRequest === req.id}
                          onClick={() => void handleRequest(req.id, true)}
                          className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-black disabled:opacity-50"
                          style={{
                            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                            boxShadow: "0 4px 12px rgba(59,65,200,0.3)",
                          }}
                        >
                          {busyRequest === req.id ? "Working…" : "Accept"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Accepted */}
          {acceptedList.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Accepted Travelers
              </p>
              <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
                {acceptedList.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3"
                    style={{
                      boxShadow: "0 2px 8px rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.2)",
                    }}
                  >
                    <img
                      src={
                        req.requester_avatar ||
                        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop"
                      }
                      className="w-10 h-10 rounded-full object-cover"
                      alt=""
                    />
                    <div className="flex-1">
                      <p className="text-navy font-bold text-[13px]">
                        {req.requester_name || "Traveler"}
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        Joining{" "}
                        {req.trip_title ? `«${req.trip_title}»` : ""}
                      </p>
                    </div>
                    <span className="text-green-500 font-black text-[11px]">
                      ✓ Accepted
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── COMMUNITY TAB ── */}
      {tab === "community" && (
        <div className="px-5 md:px-8 pb-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Live trips from travelers
            </p>
            <button
              onClick={() => setShowShareModal(true)}
              className="text-[11px] font-bold text-brand"
            >
              Share yours →
            </button>
          </div>

          {liveCommunityTrips.length === 0 ? (
            <div
              className="bg-white rounded-[22px] px-5 py-8 text-center flex flex-col items-center gap-1"
              style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
            >
              <p className="text-navy font-black text-[14px]">No community trips yet</p>
              <p className="text-slate-400 text-[11px]">
                Make your trip public and it will show up here live.
              </p>
              <button
                onClick={() => setShowShareModal(true)}
                className="mt-3 px-5 py-2.5 rounded-full text-white text-[12px] font-black"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                  boxShadow: "0 6px 16px rgba(59,65,200,0.3)",
                }}
              >
                Share my trip
              </button>
            </div>
          ) : (
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-4"}>
              {liveCommunityTrips.map((trip) => {
                const cities = (trip.destinations || [])
                  .slice()
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map((d) => d.city)
                  .filter(Boolean)
                return (
                  <div
                    key={trip.id}
                    className="bg-white rounded-[22px] overflow-hidden"
                    style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
                  >
                    {/* Tappable hero → detail */}
                    <button className="w-full text-left" onClick={() => openCommunityTrip(trip)}>
                      <div className={isDesktop ? "relative h-[200px]" : "relative h-[130px]"}>
                        <CommunityTripCover
                          coverImageUrl={trip.coverImageUrl}
                          city={cities[0]}
                          title={trip.title}
                          className="w-full h-full object-cover"
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            background:
                              "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 55%)",
                          }}
                        />
                        <div className="absolute bottom-3 left-4">
                          <p className="text-white font-black text-[15px]">
                            {trip.title}
                          </p>
                          <p className="text-white/60 text-[10px]">
                            {cities.length > 0
                              ? cities.join(" → ")
                              : trip.travelStyle || "Community trip"}
                          </p>
                        </div>
                        <div
                          className="absolute top-3 left-3 px-2 py-1 rounded-full text-[9px] font-black text-white"
                          style={{
                            background: "rgba(0,0,0,0.45)",
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          See full plan
                        </div>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-3">
                        <img
                          src={
                            trip.ownerId && user?.id && String(trip.ownerId) === user.id
                              ? myAvatar
                              : trip.authorAvatar ||
                                "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop"
                          }
                          className="w-8 h-8 rounded-full object-cover"
                          alt=""
                        />
                        <div className="flex-1">
                          <p className="text-navy font-bold text-[12px]">
                            {trip.authorName || "Traveler"}
                          </p>
                          <p className="text-slate-400 text-[10px]">
                            {formatTripDateRange(trip.startDate, trip.endDate) ||
                              `${trip.destinationCount || cities.length} stop${(trip.destinationCount || cities.length) === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <HeartIcon size={12} />
                            {trip.reactionsCount ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <PlaneIcon size={12} />
                            {trip.joinersCount ?? 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <NoteIcon size={12} />
                            {trip.commentsCount ?? 0}
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="px-4 pb-3 flex gap-2">
                      <button
                        onClick={() => openCommunityTrip(trip)}
                        className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                        style={{
                          background: "rgba(59,65,200,0.07)",
                          color: "#3B41C8",
                        }}
                      >
                        Comment
                      </button>
                      <button
                        onClick={() => openCommunityTrip(trip)}
                        className="flex-1 py-2 rounded-xl text-[12px] font-black text-white"
                        style={{
                          background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                        }}
                      >
                        Request to Join
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Share modal */}
      {showShareModal && (
        <div
          className={isDesktop ? "absolute inset-0 flex items-center justify-center p-8" : "absolute inset-0 flex items-end"}
          style={{ zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
        >
          <div className={isDesktop ? "w-full max-w-lg bg-white rounded-[32px] p-6 pb-10" : "w-full bg-white rounded-t-[32px] p-6 pb-10"}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-navy font-black text-[18px]">Share your trip</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-3 mb-5">
              {[
                {
                  title: "Public — Trypo community",
                  sub: "Anyone on Trypo can see, react, comment and request to join",
                  value: true as const,
                },
                {
                  title: "Private — invite only",
                  sub: "Only your crew and invited members can view this trip",
                  value: false as const,
                },
              ].map((opt) => (
                <button
                  key={opt.title}
                  onClick={() => void pickVisibility(opt.value)}
                  className="flex items-start gap-3 p-4 rounded-2xl text-left"
                  style={{
                    background:
                      shared === opt.value
                        ? "rgba(59,65,200,0.07)"
                        : "rgba(241,245,249,1)",
                    outline:
                      shared === opt.value ? "2px solid rgba(59,65,200,0.3)" : "none",
                  }}
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "rgba(59,65,200,0.08)",
                      color: "#3B41C8",
                    }}
                  >
                    {opt.value ? <GlobeIcon size={22} /> : <LockIcon size={22} />}
                  </span>
                  <div>
                    <p className="text-navy font-black text-[14px]">{opt.title}</p>
                    <p className="text-slate-400 text-[12px]">{opt.sub}</p>
                  </div>
                  {shared === opt.value && (
                    <span className="ml-auto text-brand font-black">✓</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void copyLink()}
                className="flex-1 py-4 rounded-2xl text-brand font-black text-[14px]"
                style={{ background: "rgba(59,65,200,0.08)" }}
              >
                Copy Link
              </button>
              <button
                onClick={() => setShowShareModal(false)}
                className="flex-1 py-4 rounded-2xl text-white font-black text-[14px]"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                  boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}