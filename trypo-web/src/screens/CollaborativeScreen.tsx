import { useState, useEffect } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import {
  getTripDetails,
  getTripMembers,
  inviteTripMember,
  updateMemberRole,
  removeMember,
  leaveTrip,
  getTripInviteCode,
  type DbTripMember,
} from "../lib/trips"
import JoinTripModal from "../components/JoinTripModal"
import ShareSheet from "../components/ShareSheet"
import { setTripVisibility } from "../lib/communityLive"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Vote = Record<string, Record<string, boolean>>

export default function CollaborativeScreen({ navigate, goBack }: Props) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const [trip, setTrip] = useState<any>(null)
  const [members, setMembers] = useState<DbTripMember[]>([])
  const [inviteCode, setInviteCode] = useState<string>("...")
  const [votes, setVotes] = useState<Vote>({})
  const [inviteInput, setInviteInput] = useState("")
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor")
  const [inviteSent, setInviteSent] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [loading, setLoading] = useState(true)

  // Share-to-Community state
  const [communityPublic, setCommunityPublic] = useState(false)
  const [communityBusy, setCommunityBusy] = useState(false)
  const [communityError, setCommunityError] = useState<string | null>(null)

  // Modals for Kick and Leave actions
  const [memberToKick, setMemberToKick] = useState<DbTripMember | null>(null)
  const [kicking, setKicking] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Me"
  const currentEmail = user?.email?.toLowerCase().trim()
  const currentId = user?.id

  const loadData = async () => {
    try {
      setLoading(true)
      const tripData = await getTripDetails()
      if (tripData) {
        setTrip(tripData)
        setCommunityPublic((tripData as any)?.visibility === "public")
        const mems = await getTripMembers(tripData.id)
        setMembers(mems)
        const code = await getTripInviteCode(tripData.id)
        setInviteCode(code)
      }
    } catch (e) {
      console.warn("Failed to load collaborative data", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()

    const handleDbChange = () => {
      void loadData()
    }
    window.addEventListener("trypo:db_changed", handleDbChange)
    return () => window.removeEventListener("trypo:db_changed", handleDbChange)
  }, [])

  // Identify current user's role in this trip
  const currentMember = members.find((m) => {
    if (currentId && m.user_id && m.user_id === currentId) return true
    if (currentEmail && m.email && m.email.toLowerCase().trim() === currentEmail) return true
    return false
  })

  const isOwner = trip?.owner_id
    ? (currentId ? trip.owner_id === currentId : false)
    : (currentMember ? currentMember.role === "owner" : (members.length > 0 && members[0].role === "owner" && members.length === 1))

  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const inputVal = inviteInput.trim()
    if (!inputVal || !trip?.id) return

    const isEmail = inputVal.includes("@")
    const code = inviteCode || trip.invite_code || (await getTripInviteCode(trip.id))

    try {
      await inviteTripMember({
        tripId: trip.id,
        name: isEmail ? undefined : inputVal,
        email: isEmail ? inputVal : undefined,
        role: inviteRole,
      })
      setInviteInput("")
      setInviteSent(true)

      if (isEmail) {
        const subject = encodeURIComponent(`Invitation à rejoindre le voyage : ${trip.title}`)
        const roleLabel = inviteRole === "editor" ? "Éditeur (Peut modifier le planning)" : "Lecteur (Consultation seule)"
        const body = encodeURIComponent(
          `Bonjour !\n\nJe t'invite à rejoindre mon voyage "${trip.title}" sur Trypo avec les accès ${roleLabel}.\n\n🎟️ Code d'invitation : ${code}\n🔗 Lien d'accès direct : https://trypo-app.vercel.app/join/${code}\n\nOuvre l'application Trypo et clique sur "+ Join Code" pour entrer le code.\n\nÀ très vite !`
        )
        window.open(`mailto:${encodeURIComponent(inputVal)}?subject=${subject}&body=${body}`, "_blank")
        setInviteFeedback(`✓ Invitation préparée et email envoyé à ${inputVal} ! (Code: ${code})`)
      } else {
        setInviteFeedback(`✓ Membre "${inputVal}" ajouté à l'équipe !`)
      }

      setTimeout(() => {
        setInviteSent(false)
        setInviteFeedback(null)
      }, 5000)

      void loadData()
    } catch (err) {
      console.warn("Invite failed", err)
    }
  }

  const handleRoleToggle = async (member: DbTripMember) => {
    if (!isOwner || member.role === "owner" || !trip?.id) return
    const nextRole: "editor" | "viewer" = member.role === "editor" ? "viewer" : "editor"
    await updateMemberRole(trip.id, member.id, nextRole)
    void loadData()
  }

  const handleToggleCommunity = async () => {
    if (!trip?.id || communityBusy) return
    setCommunityBusy(true)
    setCommunityError(null)
    try {
      const res = await setTripVisibility(trip.id, !communityPublic)
      if (res.ok) {
        setCommunityPublic(!communityPublic)
        void loadData()
      } else {
        setCommunityError(res.error || "Could not update visibility.")
      }
    } catch {
      setCommunityError("Could not update visibility.")
    } finally {
      setCommunityBusy(false)
    }
  }

  const handleKickMemberConfirmed = async () => {
    if (!memberToKick || !trip?.id) return
    try {
      setKicking(true)
      await removeMember(trip.id, memberToKick.id)
      setMemberToKick(null)
      void loadData()
    } catch (e) {
      console.warn("Failed to kick member", e)
    } finally {
      setKicking(false)
    }
  }

  const handleLeaveTripConfirmed = async () => {
    if (!trip?.id) return
    try {
      setLeaving(true)
      setLeaveError(null)
      const leaveMsg = await leaveTrip(trip.id)
      if (leaveMsg) {
        setLeaveError(leaveMsg)
        return
      }
      setShowLeaveModal(false)
      navigate("trips")
    } catch (e) {
      console.warn("Failed to leave trip", e)
      setLeaveError("Une erreur est survenue pendant le départ du voyage.")
    } finally {
      setLeaving(false)
    }
  }

  // Polls/Activities from trip itinerary items
  const itineraryItems = trip?.itinerary_items || []
  const pollActivities: Array<{ id: string; name: string; location: string; votes: number; total: number }> =
    itineraryItems.length > 0
      ? itineraryItems.slice(0, 4).map((it: any, i: number) => ({
          id: it.id || `act-${i}`,
          name: it.title,
          location: it.location_name || trip.title,
          votes: 2 + (i % 2),
          total: Math.max(3, members.length),
        }))
      : [
          { id: "act-1", name: "Sunset Camel Ride & Dinner", location: "Sidi Bou Saïd", votes: 3, total: 3 },
          { id: "act-2", name: "Guided Medina Secret Tour", location: "Tunis", votes: 2, total: 3 },
        ]

  const myVote = (actId: string) => votes[actId]?.[userName] ?? false
  const toggleVote = (actId: string) =>
    setVotes((v) => ({
      ...v,
      [actId]: { ...v[actId], [userName]: !v[actId]?.[userName] },
    }))

  return (
    <div className="min-h-full w-full max-w-full overflow-x-hidden bg-surface pb-10">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack("trip-overview")}
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 cursor-pointer active:scale-95 transition-transform"
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
          <div className="min-w-0">
            <h1 className={isDesktop ? "text-[20px] font-black text-navy" : "text-[20px] font-black text-navy truncate"}>Trip Crew</h1>
            <p className={isDesktop ? "text-slate-400 text-[12px]" : "text-slate-400 text-[12px] truncate"}>
              {trip?.title || "My Trip"} · {members.length} membre{members.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded-full bg-brand text-[11px] font-black text-white flex items-center gap-1 shadow-sm active:scale-95 transition-transform cursor-pointer"
          >
            <span>🚀</span> Share
          </button>
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-2.5 py-1.5 rounded-full bg-white text-[11px] font-bold text-navy/70 flex items-center gap-1 border border-slate-200 shadow-sm active:scale-95 transition-transform cursor-pointer"
          >
            <span>➕</span> Join
          </button>
        </div>
      </div>

      {/* Quick Crew Tools */}
      <div className="px-5 md:px-8 mb-5 flex gap-2">
        <button
          onClick={() => navigate("crew-tracker")}
          className="flex-1 flex items-center gap-2.5 py-3 px-3.5 rounded-2xl text-left bg-white transition-transform active:scale-95 cursor-pointer"
          style={{
            border: "1px solid rgba(255,99,71,0.2)",
            boxShadow: "0 2px 8px rgba(255,99,71,0.06)",
          }}
        >
          <span className="text-2xl">📍</span>
          <div>
            <p className="text-[12px] font-black text-navy">Find Crew</p>
            <p className="text-[10px] text-slate-400">Live GPS tracker</p>
          </div>
        </button>
        <button
          onClick={() => navigate("split-bills")}
          className="flex-1 flex items-center gap-2.5 py-3 px-3.5 rounded-2xl text-left bg-white transition-transform active:scale-95 cursor-pointer"
          style={{
            border: "1px solid rgba(6,196,212,0.2)",
            boxShadow: "0 2px 8px rgba(6,196,212,0.06)",
          }}
        >
          <span className="text-2xl">💸</span>
          <div>
            <p className="text-[12px] font-black text-navy">Split Bills</p>
            <p className="text-[10px] text-slate-400">Shared budgets</p>
          </div>
        </button>
      </div>

      {/* Guest Leave Trip Action Notice */}
      {!isOwner && currentMember && (
        <div className="px-5 md:px-8 mb-5">
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-red-600 text-sm">🚪</span>
                <p className="text-red-950 font-black text-[13px]">
                  Vous participez en tant qu'invité ({currentMember?.role === "editor" ? "Éditeur" : "Lecteur"})
                </p>
              </div>
              <p className="text-red-700/80 text-[11px]">
                Vous pouvez quitter ce voyage à tout moment pour le retirer de votre compte.
              </p>
            </div>
            <button
              onClick={() => setShowLeaveModal(true)}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-[11px] shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <span>Quitter ce voyage</span>
            </button>
          </div>
        </div>
      )}

      {/* Invite Member Section (Only for Owner or Editors) */}
      <div className="px-5 md:px-8 mb-5">
        <div
          className="bg-white rounded-[24px] p-4.5"
          style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.07)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Invite a Friend
          </p>

          <form onSubmit={handleSendInvite} className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                placeholder="Friend's email or name..."
                className="flex-1 text-[13px] text-navy outline-none bg-surface rounded-xl px-3.5 py-2.5 border border-slate-200 placeholder:text-slate-300 font-medium"
              />
              <button
                type="submit"
                disabled={!inviteInput.trim()}
                className="flex-shrink-0 px-4 py-2.5 rounded-xl text-[12px] font-black text-white cursor-pointer disabled:opacity-40 transition-all"
                style={{
                  background: inviteSent
                    ? "#059669"
                    : "linear-gradient(135deg, #3B41C8, #06C4D4)",
                }}
              >
                {inviteSent ? "✓ Invited!" : "Invite +"}
              </button>
            </div>

            {/* Role Permission Selector */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-bold text-slate-500">
                Granted permission:
              </span>
              <div className="flex items-center gap-1.5 p-1 bg-surface rounded-xl border border-slate-100">
                <button
                  type="button"
                  onClick={() => setInviteRole("editor")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    inviteRole === "editor"
                      ? "bg-brand text-white shadow-sm"
                      : "text-slate-500 hover:text-navy"
                  }`}
                >
                  ✏️ Can Edit
                </button>
                <button
                  type="button"
                  onClick={() => setInviteRole("viewer")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    inviteRole === "viewer"
                      ? "bg-brand text-white shadow-sm"
                      : "text-slate-500 hover:text-navy"
                  }`}
                >
                  👁️ Can View
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              {inviteRole === "editor"
                ? "✏️ Editors can add/edit destinations, activities, stays, and packing list."
                : "👁️ Viewers can browse and view all trip details in read-only mode."}
            </p>

            {inviteFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold flex items-center gap-2 animate-in fade-in">
                <span>✉️</span>
                <span>{inviteFeedback}</span>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Members List with Role Switch */}
      <div className="px-5 md:px-8 mb-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Crew Members ({members.length})
          </p>
          <span className="text-[10px] text-slate-400">
            {isOwner ? "Tap role to switch · ✕ to expel" : "Trip Members"}
          </span>
        </div>

        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-2.5"}>
          {members.map((m) => {
            const isMemberOwner = m.role === "owner"
            const isEditor = m.role === "editor"
            const isSelf = (currentId && m.user_id === currentId) || (currentEmail && m.email && m.email.toLowerCase() === currentEmail)

            return (
              <div
                key={m.id || m.name}
                className="bg-white rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-sm border border-slate-100"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative flex-shrink-0">
                    <img
                      src={
                        m.avatar ||
                        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
                      }
                      alt={m.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-100"
                    />
                    <div
                      className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                      style={{
                        background:
                          m.status === "joined" ? "#10b981" : "#f59e0b",
                      }}
                      title={m.status === "joined" ? "Joined" : "Pending invite"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-navy font-black text-[13px] truncate">
                        {m.name} {isSelf && <span className="text-[10px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded-full">(Moi)</span>}
                      </p>
                      {isMemberOwner && <span className="text-[12px]" title="Organisateur">👑</span>}
                    </div>
                    <p className="text-slate-400 text-[10px] truncate">
                      {m.email || (m.status === "joined" ? "Membre actif" : "Invitation envoyée")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Role Display / Switch Button */}
                  {isMemberOwner ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                      👑 Organisateur
                    </span>
                  ) : isOwner ? (
                    <button
                      onClick={() => handleRoleToggle(m)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black border transition-all cursor-pointer active:scale-95 flex items-center gap-1 ${
                        isEditor
                          ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      }`}
                      title="Changer entre Éditeur et Lecteur"
                    >
                      <span>{isEditor ? "✏️ Éditeur" : "👁️ Lecteur"}</span>
                      <span className="text-[8px] opacity-60">⇄</span>
                    </button>
                  ) : (
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        isEditor
                          ? "bg-teal-50 text-teal-700 border-teal-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {isEditor ? "✏️ Éditeur" : "👁️ Lecteur"}
                    </span>
                  )}

                  {/* Expel / Remove Button (Only for Trip Owner to kick invited members) */}
                  {isOwner && !isMemberOwner && (
                    <button
                      onClick={() => setMemberToKick(m)}
                      className="w-7 h-7 rounded-full bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-400 flex items-center justify-center text-[12px] font-bold cursor-pointer transition-colors"
                      title="Expulser ce membre"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Activity Polls */}
      <div className="px-5 md:px-8 mb-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Vote on Activities
        </p>
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-2.5"}>
          {pollActivities.map((act) => {
            const voted = myVote(act.id)
            const voteCount = act.votes + (voted ? 1 : 0)
            const pct = Math.round((voteCount / act.total) * 100)
            return (
              <div
                key={act.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-navy font-black text-[13px] truncate">
                      {act.name}
                    </p>
                    <p className="text-slate-400 text-[10px] truncate">
                      📍 {act.location}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleVote(act.id)}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer active:scale-95"
                    style={{
                      background: voted
                        ? "rgba(59,65,200,0.1)"
                        : "rgba(148,163,184,0.1)",
                      color: voted ? "#3B41C8" : "#94a3b8",
                    }}
                  >
                    {voted ? "✓ Voted" : "Vote"}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, #3B41C8, #06C4D4)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-black text-brand">
                    {voteCount}/{act.total} ({pct}%)
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Confirmation Modal: Expel / Kick Member (Organizer only) */}
      {memberToKick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[28px] max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-2xl mb-3.5 border border-red-100">
              ⚠️
            </div>
            <h3 className="text-[17px] font-black text-navy mb-1.5">Expulser ce membre ?</h3>
            <p className="text-slate-500 text-[13px] leading-relaxed mb-6">
              Voulez-vous retirer <strong className="text-navy">{memberToKick.name}</strong> du voyage <strong className="text-navy">« {trip?.title || "ce voyage"} »</strong> ? Cette personne perdra immédiatement son accès au voyage.
            </p>
            <div className="flex w-full gap-2.5">
              <button
                onClick={() => setMemberToKick(null)}
                disabled={kicking}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-[13px] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleKickMemberConfirmed}
                disabled={kicking}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {kicking ? "Expulsion..." : "Oui, expulser"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Leave Trip (Guest only) */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-[28px] max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-2xl mb-3.5 border border-orange-100">
              🚪
            </div>
            <h3 className="text-[17px] font-black text-navy mb-1.5">Quitter ce voyage ?</h3>
            <p className="text-slate-500 text-[13px] leading-relaxed mb-6">
              Êtes-vous sûr de vouloir quitter le voyage <strong className="text-navy">« {trip?.title || "ce voyage"} »</strong> ? Il n'apparaîtra plus dans votre liste de voyages.
            </p>
            {leaveError && (
              <div className="mb-6 w-full p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
                ⚠️ {leaveError}
              </div>
            )}
            <div className="flex w-full gap-2.5">
              <button
                onClick={() => setShowLeaveModal(false)}
                disabled={leaving}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-[13px] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleLeaveTripConfirmed}
                disabled={leaving}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {leaving ? "En cours..." : "Oui, quitter"}
              </button>
            </div>
          </div>
        </div>
      )}

      <JoinTripModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        navigate={navigate}
        onJoined={loadData}
      />

      {showShare && (
        <ShareSheet
          title={trip?.title || "My Trip"}
          subtitle={`${members.length} member${members.length > 1 ? "s" : ""} · Collaborative Trip`}
          link={`https://trypo-app.vercel.app/trip/${trip?.id || "trip"}`}
          code={inviteCode}
          onClose={() => setShowShare(false)}
          communityPublic={communityPublic}
          communityBusy={communityBusy}
          communityError={communityError}
          onToggleCommunity={handleToggleCommunity}
          onOpenCommunity={() => {
            setShowShare(false)
            navigate("trip-social")
          }}
        />
      )}
    </div>
  )
}

