import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import {
  getDestinationStayDays,
  getMyTrips,
  setActiveTripId,
  deleteTrip,
  leaveTrip,
} from "../lib/trips"
import { useMyTripsRealtime } from "../lib/communityLive"
import { useIsDesktop } from "../lib/useIsDesktop"
import JoinTripModal from "../components/JoinTripModal"
import DestinationHubModal, { type DestinationHubTarget } from "../components/DestinationHubModal"

interface Props {
  navigate: (s: Screen) => void
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> =
  {
    upcoming: {
      label: "Upcoming",
      bg: "rgba(255,99,71,0.12)",
      text: "#FF6347",
    },
    planning: { label: "Planning", bg: "rgba(59,65,200,0.1)", text: "#3B41C8" },
    past: { label: "Past", bg: "rgba(148,163,184,0.15)", text: "#64748b" },
    active: { label: "Upcoming", bg: "rgba(255,99,71,0.12)", text: "#FF6347" },
    draft: { label: "Draft", bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
  }

/**
 * Effective filter status derived from trip dates (not the stored
 * `trips.status`, which stays "planning" forever after creation).
 * - end_date before today → past
 * - start_date after today → upcoming
 * - started with end today/future (ongoing) → upcoming
 * - no dates → stored status when usable, else planning
 */
function resolveFilterStatus(trip: any): "upcoming" | "planning" | "past" {
  const toDay = (v: any): Date | null => {
    if (!v) return null
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = toDay(trip?.start_date)
  const end = toDay(trip?.end_date)
  if (end && end < today) return "past"
  if (start && start > today) return "upcoming"
  if (start) return "upcoming"
  const stored = String(trip?.status || "").toLowerCase()
  if (stored === "past") return "past"
  if (stored === "upcoming" || stored === "active") return "upcoming"
  return "planning"
}

const filters = ["All", "Upcoming", "Planning", "Past"]

export default function TripsListScreen({ navigate }: Props) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const [activeFilter, setActiveFilter] = useState(0)
  const [trips, setTrips] = useState<Array<any>>([])
  const [loading, setLoading] = useState(true)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [pendingJoinCode, setPendingJoinCode] = useState<string | undefined>()
  const [tripToDelete, setTripToDelete] = useState<any | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [selectedHubDestination, setSelectedHubDestination] = useState<DestinationHubTarget | null>(null)

  const loadTrips = async () => {
    try {
      setLoading(true)
      const liveTrips = await getMyTrips()
      setTrips(
        (liveTrips || []).map((trip) => {
          const destinations = [...(trip.trip_destinations ?? [])].sort(
            (a, b) => a.position - b.position,
          )
          return {
            id: trip.id,
            name: trip.title,
            ownerId: trip.owner_id ?? null,
            destinations,
            route:
              destinations
                .map((destination) => destination.city)
                .join(" → ") || "No destinations yet",
            dates:
              [trip.start_date, trip.end_date].filter(Boolean).join(" – ") ||
              "Dates to be set",
            days: destinations.reduce((sum, d) => sum + getDestinationStayDays(d), 0),
            dests: destinations.length,
            progress: trip.planning_progress || 0,
            status: resolveFilterStatus(trip),
            image:
              trip.cover_image_url ||
              "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=600&h=400&fit=crop&auto=format",
          }
        }),
      )
    } catch {
      setTrips([])
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!tripToDelete?.id) return
    try {
      setIsDeleting(true)
      setLeaveError(null)
      const isOwnerOfTrip =
        tripToDelete.ownerId != null && tripToDelete.ownerId !== user?.id
          ? false
          : true
      if (isOwnerOfTrip) {
        await deleteTrip(tripToDelete.id)
      } else {
        const leaveMsg = await leaveTrip(tripToDelete.id)
        if (leaveMsg) {
          setLeaveError(leaveMsg)
          setIsDeleting(false)
          return
        }
      }
      // Optimistic removal: never leave a gone trip on screen if the
      // subsequent reload fails or races with realtime.
      setTrips((prev) => prev.filter((t) => t.id !== tripToDelete.id))
      setTripToDelete(null)
      await loadTrips()
    } catch (err) {
      console.error("Delete trip failed:", err)
    } finally {
      setIsDeleting(false)
    }
  }

  const leavingTrip = Boolean(
    tripToDelete?.ownerId && tripToDelete.ownerId !== user?.id,
  )

  useEffect(() => {
    void loadTrips()
    // A deep link (trypo://join/XXX) stashes a code → auto-open the sheet.
    try {
      const pending = localStorage.getItem("trypo_pending_join_code")
      if (pending) {
        localStorage.removeItem("trypo_pending_join_code")
        setPendingJoinCode(pending)
        setShowJoinModal(true)
      }
    } catch {}
    const handleDbChange = () => {
      void loadTrips()
    }
    window.addEventListener("trypo:db_changed", handleDbChange)
    return () => window.removeEventListener("trypo:db_changed", handleDbChange)
  }, [user])

  useMyTripsRealtime(loadTrips)

  const filtered =
    activeFilter === 0
      ? trips
      : trips.filter((t) => t.status === filters[activeFilter].toLowerCase())

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[26px] font-black text-navy">My Trips</h1>
          <p className="text-slate-400 text-[13px]">
            {loading ? "Loading..." : `${trips.length} adventures`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white border border-brand/20 shadow-xs active:scale-95 transition-all"
            style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.08)" }}
          >
            <span className="text-[12px] font-black text-brand">Join Code</span>
          </button>
          <button
            onClick={() => navigate("create-trip")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{
              background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
              boxShadow: "0 4px 14px rgba(59,65,200,0.35)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 3.75v10.5M3.75 9h10.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-5 md:px-8 mb-5 overflow-x-auto pb-1">
        {filters.map((f, i) => (
          <button
            key={f}
            onClick={() => setActiveFilter(i)}
            className="px-4 py-2 rounded-full text-[13px] font-bold transition-all flex-shrink-0"
            style={{
              background: activeFilter === i ? "#0D0F2E" : "#FFFFFF",
              color: activeFilter === i ? "#FFFFFF" : "#64748b",
              boxShadow:
                activeFilter === i
                  ? "0 4px 14px rgba(13,15,46,0.25)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Trips list */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-28" : "px-5 flex flex-col gap-4 pb-28"}>
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <p className="text-slate-400 text-sm font-semibold">
              Loading your trips...
            </p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 bg-white rounded-3xl p-6 text-center shadow-xs border border-dashed border-slate-200">
            <h3 className="text-navy font-black text-lg mb-1">No trips found</h3>
            <p className="text-slate-400 text-xs mb-5">
              Ready to start your next adventure? Create your custom itinerary now.
            </p>
            <button
              onClick={() => navigate("create-trip")}
              className="px-5 py-3 rounded-2xl bg-brand text-white font-bold text-xs"
              style={{
                boxShadow: "0 6px 18px rgba(59,65,200,0.3)",
              }}
            >
              Plan my first trip
            </button>
          </div>
        )}

        {filtered.map((trip) => {
          const s = statusConfig[trip.status] || statusConfig.planning
          const isOwnerOfCard = !trip.ownerId || trip.ownerId === user?.id
          return (
            <div
              key={trip.id || trip.name}
              className="w-full rounded-[22px] overflow-hidden bg-white text-left relative group cursor-pointer"
              style={{ boxShadow: "0 4px 20px rgba(59,65,200,0.1)" }}
              onClick={() => {
                if (trip.id) setActiveTripId(trip.id)
                navigate("trip-overview")
              }}
            >
              {/* Image */}
              <div className="relative h-[130px] md:h-[180px] bg-slate-200">
                <img
                  src={trip.image}
                  alt={trip.name}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 100%)",
                  }}
                />
                <div className="absolute top-3 left-4 flex items-center gap-2">
                  <h3 className="text-white font-black text-[16px]">
                    {trip.name}
                  </h3>
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-black"
                    style={{
                      background: s.bg,
                      color: s.text,
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {s.label}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setTripToDelete(trip)
                    }}
                    className="w-7 h-7 rounded-full bg-black/40 hover:bg-red-500 text-white flex items-center justify-center backdrop-blur-md transition-colors"
                    title={isOwnerOfCard ? "Supprimer ce voyage" : "Leave this trip"}
                  >
                    {isOwnerOfCard ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="absolute bottom-3 left-4 right-4 flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
                  {trip.destinations && trip.destinations.length > 0 ? (
                    trip.destinations.map((d: any, idx: number) => (
                      <span key={d.id || idx} className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedHubDestination({
                              city: d.city,
                              country: d.country,
                              dates: [d.arrival_date, d.departure_date].filter(Boolean).join(" – ") || undefined,
                              startDate: d.arrival_date,
                              endDate: d.departure_date,
                              days: getDestinationStayDays(d),
                            })
                          }}
                          className="px-2 py-0.5 rounded-lg bg-black/40 hover:bg-brand text-white font-bold text-[10px] backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-white/10 hover:border-white/30"
                          title={`Explore booking & hotels in ${d.city}`}
                        >
                          {d.city}
                        </button>
                        {idx < trip.destinations.length - 1 && (
                          <span className="text-white/60 text-[10px]">→</span>
                        )}
                      </span>
                    ))
                  ) : (
                    <p className="text-white/70 text-[11px]">{trip.route}</p>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-3">
                    <span className="text-[12px] font-semibold text-slate-500">
                      {trip.dates}
                    </span>
                  </div>
                  <div className="flex gap-2 text-[11px] text-slate-400">
                    <span>{trip.days}d</span>
                    <span>{trip.dests} stops</span>
                  </div>
                </div>

                {/* Progress */}
                {trip.progress > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Planning
                      </span>
                      <span className="text-[11px] font-black text-brand">
                        {trip.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${trip.progress}%`,
                          background:
                            "linear-gradient(90deg, #3B41C8, #06C4D4)",
                        }}
                      />
                    </div>
                  </div>
                )}

                {trip.progress === 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-brand">
                      Start planning →
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setTripToDelete(trip)
                      }}
                      className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                      {isOwnerOfCard ? "Effacer" : "Leave"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* New trip CTA */}
        <button
          onClick={() => navigate("create-trip")}
          className="w-full py-4 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2"
          style={{
            border: "2px dashed #3B41C8",
            color: "#3B41C8",
            background: "rgba(59,65,200,0.03)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2v12M2 8h12"
              stroke="#3B41C8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Plan a New Trip
        </button>
      </div>

      {/* Delete / Leave Confirmation Modal */}
      {tripToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-5 animate-fadeIn">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center text-2xl mx-auto mb-4">
              {leavingTrip ? "🚪" : "🗑️"}
            </div>
            <h3 className="text-[18px] font-black text-navy text-center mb-1.5">
              {leavingTrip ? "Leave this trip ?" : "Supprimer ce voyage ?"}
            </h3>
            <p className="text-[13px] text-slate-500 text-center leading-relaxed mb-6">
              {leavingTrip ? (
                <>
                  You're a member of{" "}
                  <strong className="text-navy font-bold">
                    « {tripToDelete.name} »
                  </strong>
                  . Leave it? The organizer keeps the trip — you just won't see
                  it in My Trips anymore.
                </>
              ) : (
                <>
                  Êtes-vous sûr de vouloir supprimer définitivement le voyage{" "}
                  <strong className="text-navy font-bold">
                    « {tripToDelete.name} »
                  </strong>{" "}
                  ? Toutes les étapes et réservations associées seront effacées.
                </>
              )}
            </p>
            {leaveError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
                ⚠️ {leaveError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setTripToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[13px] active:scale-95 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-black text-[13px] shadow-lg shadow-red-500/30 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isDeleting
                  ? leavingTrip
                    ? "Leaving..."
                    : "Suppression..."
                  : leavingTrip
                    ? "Leave"
                    : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <JoinTripModal
        isOpen={showJoinModal}
        initialCode={pendingJoinCode}
        onClose={() => {
          setShowJoinModal(false)
          setPendingJoinCode(undefined)
        }}
        navigate={navigate}
        onJoined={loadTrips}
      />

      {/* Destination Hub Modal (Booking, GetYourGuide, Airbnb, Best Hotels, Hidden Gems) */}
      <DestinationHubModal
        destination={selectedHubDestination}
        onClose={() => setSelectedHubDestination(null)}
        onExploreStay={() => navigate("find-stay")}
        onExploreHiddenGems={() => navigate("hidden-gems")}
      />
    </div>
  )
}
