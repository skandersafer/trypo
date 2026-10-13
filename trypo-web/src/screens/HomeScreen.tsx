import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { useAuth, useMyAvatar } from "../lib/auth"
import {
  getActiveTripId,
  getCommunityTripPlan,
  getMyTrips,
  getTripDetails,
  setActiveTripId,
} from "../lib/trips"
import { useMyNotifications, useMyTripsRealtime, useCommunityFeed } from "../lib/communityLive"
import { setCommunityTripSelection } from "../lib/community"
import CommunityTripCover, { formatTripDateRange } from "../components/CommunityTripCover"
import { HeartIcon } from "../components/icons"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

export default function HomeScreen({ navigate }: Props) {
  const { user } = useAuth()
  const [myTrips, setMyTrips] = useState<Array<any>>([])
  const [activeTrip, setActiveTrip] = useState<any>(null)
  const { unread: unreadNotifs } = useMyNotifications()
  const { trips: communityFeed } = useCommunityFeed()

  const loadData = async () => {
    try {
      const liveTrips = await getMyTrips()
      const mapped = (liveTrips || []).map((trip: any) => {
        const destinations = [...(trip.trip_destinations ?? [])].sort(
          (a: any, b: any) => a.position - b.position,
        )
        return {
          id: trip.id,
          name: trip.title,
          destinations,
          route:
            destinations.map((d: any) => d.city).join(" → ") || "No destinations yet",
          dates:
            [trip.start_date, trip.end_date].filter(Boolean).join(" – ") ||
            "Dates to be set",
          dests: destinations.length,
          progress: trip.planning_progress || 0,
          image:
            trip.cover_image_url ||
            "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=500&fit=crop&auto=format",
        }
      })
      setMyTrips(mapped)
      const details = await getTripDetails()
      setActiveTrip(details ?? null)
    } catch {
      /* offline — keep cached UI */
    }
  }

  useEffect(() => {
    void loadData()
    const onChange = () => void loadData()
    window.addEventListener("trypo:db_changed", onChange)
    return () => window.removeEventListener("trypo:db_changed", onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useMyTripsRealtime(loadData)

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler"
  const myAvatar = useMyAvatar()
  const isDesktop = useIsDesktop()
  const currentActiveId = getActiveTripId()
  const upcomingTrip =
    myTrips.find((t) => t.id === currentActiveId) ||
    (activeTrip
      ? {
          id: activeTrip.id,
          name: activeTrip.title,
          destinations: activeTrip.trip_destinations ?? [],
          route:
            (activeTrip.trip_destinations ?? []).map((d: any) => d.city).join(" → ") ||
            "No destinations yet",
          dates:
            [activeTrip.start_date, activeTrip.end_date].filter(Boolean).join(" – ") ||
            "Dates to be set",
          dests: (activeTrip.trip_destinations ?? []).length,
          progress: activeTrip.planning_progress || 0,
          image:
            activeTrip.cover_image_url ||
            "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=500&fit=crop&auto=format",
        }
      : null) ||
    (myTrips.length > 0 ? myTrips[0] : null)

  const openTrip = (id?: string) => {
    if (id) setActiveTripId(id)
    navigate("trip-overview")
  }

  return (
    <div className="min-h-full bg-surface pb-6">
      <div className="pt-12" />

      {/* Header — single row */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium" style={{ color: "#94A3B8" }}>
            {greeting()}
          </p>
          <h1 className="text-[24px] md:text-[30px] font-black text-navy leading-tight truncate">
            Hey, {userName}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate("search")}
            aria-label="Search"
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center trypo-card"
            style={{ borderRadius: 99 }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#0D0F2E" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 3.5 3.5" />
            </svg>
          </button>
          <button
            onClick={() => navigate("notifications")}
            aria-label="Notifications"
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center trypo-card relative"
            style={{ borderRadius: 99 }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#0D0F2E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5v3L2.5 13.5h15L15.5 11V8A5.5 5.5 0 0 0 10 2.5Z" />
              <path d="M8 16.5a2 2 0 0 0 4 0" />
            </svg>
            {unreadNotifs > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-coral border-2 border-white" />
            )}
          </button>
          <button onClick={() => navigate("profile")} aria-label="Profile" className="w-10 h-10 rounded-full overflow-hidden trypo-card" style={{ borderRadius: 99 }}>
            <img src={myAvatar} alt={userName} className="w-full h-full object-cover" />
          </button>
        </div>
      </div>

      {/* AI entry — one search field, not a banner */}
      <div className="px-5 md:px-8 mb-6">
        <button
          onClick={() => navigate("chatbot")}
          className="w-full trypo-input flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform"
        >
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[15px] font-black flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
          >
            AI
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-navy font-bold text-[14px]">Where to next?</span>
            <span className="block text-[12px] truncate" style={{ color: "#94A3B8" }}>
              Ask Tripo to plan it — dates, stays, budget
            </span>
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </button>
      </div>

      {/* Next trip — only hero */}
      <div className="px-5 md:px-8 mb-7">
        <div className="flex items-center justify-between mb-3">
          <p className="trypo-section-label">Next trip</p>
          {upcomingTrip && (
            <button onClick={() => navigate("trips")} className="text-[12px] font-bold text-brand">
              See all
            </button>
          )}
        </div>
        {upcomingTrip ? (
          <button
            onClick={() => openTrip(upcomingTrip.id)}
            className="w-full rounded-[24px] overflow-hidden relative text-left trypo-card"
            style={{ height: isDesktop ? 300 : 210, padding: 0, border: "none" }}
          >
            <img src={upcomingTrip.image} alt={upcomingTrip.name} className="w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(13,15,46,0.88) 0%, rgba(13,15,46,0.15) 60%, transparent 100%)" }}
            />
            <div className="absolute top-3 right-3">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white" style={{ background: "rgba(13,15,46,0.55)", backdropFilter: "blur(8px)" }}>
                {upcomingTrip.dates}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-white font-black text-[18px] leading-tight truncate">{upcomingTrip.name}</h3>
              <p className="text-white/65 text-[12px] truncate mt-0.5">{upcomingTrip.route}</p>
              <div className="mt-2.5">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-white/60 text-[11px]">Planning progress</span>
                  <span className="text-white font-bold text-[11px]">{upcomingTrip.progress}%</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${upcomingTrip.progress}%`, background: "linear-gradient(90deg, #3B41C8, #06C4D4)" }} />
                </div>
              </div>
            </div>
          </button>
        ) : (
          <div className="w-full trypo-card p-6 text-center">
            <h3 className="text-navy font-black text-[16px] mb-1">No upcoming trip</h3>
            <p className="text-[12px] mb-4" style={{ color: "#94A3B8" }}>
              Tell Tripo where you want to go.
            </p>
            <button onClick={() => navigate("create-trip")} className="trypo-cta px-6 py-3 text-[14px]">
              Plan a new trip
            </button>
          </div>
        )}
      </div>

      {/* My trips — clean grid */}
      <div className="mb-2">
        <div className="px-5 md:px-8 flex items-center justify-between mb-3">
          <p className="trypo-section-label">My trips</p>
          {myTrips.length > 0 && (
            <button onClick={() => navigate("trips")} className="text-[12px] font-bold text-brand">
              See all
            </button>
          )}
        </div>
        {myTrips.length > 0 ? (
          <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-4 gap-4 px-5 md:px-8" : "flex gap-3 px-5 overflow-x-auto no-scrollbar pb-1"}>
            {myTrips.map((trip) => (
              <button
                key={trip.id ?? trip.name}
                onClick={() => openTrip(trip.id)}
                className="flex-shrink-0 rounded-[20px] overflow-hidden relative text-left trypo-card"
                style={isDesktop ? { width: "100%", height: 220, padding: 0, border: "none" } : { width: 160, height: 200, padding: 0, border: "none" }}
              >
                <img src={trip.image} alt={trip.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(13,15,46,0.8) 0%, transparent 60%)" }} />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-bold text-[13px] leading-tight truncate">{trip.name}</p>
                  <p className="text-white/60 text-[11px] truncate mt-0.5">{trip.dates}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-5 md:px-8">
            <button
              onClick={() => navigate("create-trip")}
              className="w-full py-5 rounded-[20px] bg-white text-center font-bold text-[13px] border border-dashed"
              style={{ borderColor: "#CBD5E1", color: "#64748B" }}
            >
              + Create your first trip
            </button>
          </div>
        )}
        <p className="px-5 md:px-8 mt-4 text-[11px]" style={{ color: "#94A3B8" }}>
          Budget, bookings and trip tools live inside each trip — open a trip to find them.
        </p>
      </div>

      {/* Community — shared trips from other travelers */}
      {communityFeed.length > 0 && (
        <div className="mt-6 mb-2">
          <div className="px-5 md:px-8 flex items-center justify-between mb-3">
            <p className="trypo-section-label">Community trips</p>
            <button onClick={() => navigate("trip-social")} className="text-[12px] font-bold text-brand">
              See all
            </button>
          </div>
          <div className={isDesktop ? "grid grid-cols-3 gap-4 px-5 md:px-8" : "flex gap-3 px-5 overflow-x-auto no-scrollbar pb-1"}>
            {communityFeed.slice(0, 6).map((trip: any) => {
              const cities = (trip.destinations || []).filter((d: any) => d.city).map((d: any) => d.city)
              return (
                <button
                  key={trip.id}
                  onClick={() => {
                    const plan = { destinations: trip.destinations, itinerary: [] }
                    setCommunityTripSelection({ meta: trip, plan })
                    navigate("community-trip-detail")
                    void getCommunityTripPlan(trip.id).then((livePlan: any) => {
                      setCommunityTripSelection({ meta: trip, plan: livePlan })
                    })
                  }}
                  className="flex-shrink-0 rounded-[20px] overflow-hidden text-left trypo-card"
                  style={isDesktop ? { width: "100%", padding: 0 } : { width: 180, padding: 0 }}
                >
                  <div className="relative" style={{ height: 110 }}>
                    <CommunityTripCover
                      coverImageUrl={trip.coverImageUrl}
                      city={cities[0]}
                      title={trip.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(13,15,46,0.8) 0%, transparent 60%)" }} />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white font-bold text-[13px] leading-tight truncate">{trip.title}</p>
                      <p className="text-white/60 text-[11px] truncate mt-0.5">
                        {formatTripDateRange(trip.startDate, trip.endDate) || cities.slice(0, 2).join(" → ") || "Community trip"}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white px-3 py-2.5 flex items-center gap-2">
                    <img
                      src={trip.authorAvatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format"}
                      alt={trip.authorName || "Traveler"}
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                    />
                    <p className="flex-1 min-w-0 text-navy font-bold text-[12px] truncate">
                      {trip.authorName || "Traveler"}
                    </p>
                    <span className="flex items-center gap-1 text-navy font-bold text-[11px] flex-shrink-0">
                      <HeartIcon size={12} />
                      {trip.reactionsCount ?? 0}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
