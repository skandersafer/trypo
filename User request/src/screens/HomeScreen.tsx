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
import { useCommunityFeed, useMyNotifications, useMyTripsRealtime } from "../lib/communityLive"
import { setCommunityTripSelection } from "../lib/community"
import CommunityTripCover, { formatTripDateRange } from "../components/CommunityTripCover"
import DestinationHubModal, { type DestinationHubTarget } from "../components/DestinationHubModal"
import { useSettings, formatMoney, convertToDisplayCurrency } from "../lib/settings"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
}

export default function HomeScreen({ navigate }: Props) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const displayCurrency = settings.currency
  const [notifSeen, setNotifSeen] = useState(false)
  const [myTrips, setMyTrips] = useState<Array<any>>([])
  const [activeTrip, setActiveTrip] = useState<any>(null)
  const { trips: communityFeed } = useCommunityFeed()
  const { unread: unreadNotifs } = useMyNotifications()
  const [loadingTrips, setLoadingTrips] = useState(false)
  const [budgetInfo, setBudgetInfo] = useState({ total: 1800, spent: 450, remaining: 1350, currency: "EUR" })
  const [selectedHubDestination, setSelectedHubDestination] = useState<DestinationHubTarget | null>(null)

  const loadData = async () => {
    try {
      setLoadingTrips(true)
      const liveTrips = await getMyTrips()
      const mappedTrips = (liveTrips || []).map((trip) => {
        const destinations = [...(trip.trip_destinations ?? [])].sort(
          (a, b) => a.position - b.position,
        )
        return {
          id: trip.id,
          flag: "🌍",
          name: trip.title,
          destinations,
          route:
            destinations
              .map((destination) => destination.city)
              .join(" → ") || "No destinations set",
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
      setMyTrips(mappedTrips)

      const activeTripData = await getTripDetails()
      if (activeTripData) {
        setActiveTrip(activeTripData)
        const total = Number(activeTripData.total_budget) || 1800
        const expenses = activeTripData.expenses || []
        const spent = expenses.reduce(
          (acc, e) => acc + convertToDisplayCurrency(Number(e.amount) || 0, e.currency || activeTripData.currency || "EUR", displayCurrency),
          0,
        )
        setBudgetInfo({
          total,
          spent,
          remaining: Math.max(0, total - spent),
          currency: displayCurrency,
        })
      } else {
        setActiveTrip(null)
        setBudgetInfo({ total: 0, spent: 0, remaining: 0, currency: displayCurrency })
      }
    } catch {
      // Fallback
    } finally {
      setLoadingTrips(false)
    }
  }

  useEffect(() => {
    void loadData()
    const handleDbChange = () => {
      void loadData()
    }
    window.addEventListener("trypo:db_changed", handleDbChange)
    window.addEventListener("trypo:settings_changed", handleDbChange)
    return () => {
      window.removeEventListener("trypo:db_changed", handleDbChange)
      window.removeEventListener("trypo:settings_changed", handleDbChange)
    }
  }, [user, displayCurrency])

  useMyTripsRealtime(loadData)

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Alex"
  const myAvatar = useMyAvatar()
  const isDesktop = useIsDesktop()
  const currentActiveId = getActiveTripId()
  const upcomingTrip = myTrips.find((t) => t.id === currentActiveId) || (activeTrip ? {
    id: activeTrip.id,
    flag: "🌍",
    name: activeTrip.title,
    destinations: activeTrip.trip_destinations ?? [],
    route: (activeTrip.trip_destinations ?? []).map((d: any) => d.city).join(" → ") || "No destinations set",
    dates: [activeTrip.start_date, activeTrip.end_date].filter(Boolean).join(" – ") || "Dates to be set",
    dests: (activeTrip.trip_destinations ?? []).length,
    progress: activeTrip.planning_progress || 0,
    image: activeTrip.cover_image_url || "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=500&fit=crop&auto=format",
  } : null) || (myTrips.length > 0 ? myTrips[0] : null)

  return (
    <div className="min-h-full bg-surface pb-4">
      {/* Status bar area */}
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-6">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-400 mb-0.5">
            Good evening
          </p>
          <h1 className={`text-[24px] md:text-[30px] font-black text-navy leading-tight ${isDesktop ? "max-w-none" : "truncate max-w-[200px]"}`}>
            Hey, {userName} 👋
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("search")}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM14 14l2.5 2.5"
                stroke="#0D0F2E"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            onClick={() => {
              setNotifSeen(true)
              navigate("notifications")
            }}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm relative"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 2a5 5 0 00-5 5v2.5L2.5 11.5h13L14 9.5V7a5 5 0 00-5-5z"
                stroke="#0D0F2E"
                strokeWidth="1.7"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M7 14.5a2 2 0 004 0"
                stroke="#0D0F2E"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            {unreadNotifs > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-coral border-2 border-white"
                title={`${unreadNotifs} unread`}
              />
            )}
          </button>
          <button
            onClick={() => navigate("profile")}
            className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-bold text-base shadow-xs active:scale-95 transition-all cursor-pointer overflow-hidden"
          >
            <img src={myAvatar} alt={userName} className="w-full h-full object-cover" />
          </button>
        </div>
      </div>

      {/* Upcoming Trip card */}
      <div className="px-5 md:px-8 mb-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Upcoming Trip
        </p>
        {upcomingTrip ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (upcomingTrip?.id) setActiveTripId(upcomingTrip.id)
              navigate("trip-overview")
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (upcomingTrip?.id) setActiveTripId(upcomingTrip.id)
                navigate("trip-overview")
              }
            }}
            className="w-full rounded-[24px] overflow-hidden relative text-left cursor-pointer"
            style={{
              height: isDesktop ? "320px" : "200px",
              boxShadow: "0 12px 36px rgba(59,65,200,0.2)",
            }}
          >
            <img
              src={upcomingTrip.image}
              alt={upcomingTrip.name}
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(13,15,46,0.88) 0%, rgba(13,15,46,0.2) 60%, transparent 100%)",
              }}
            />

            {/* Top badge */}
            <div className="absolute top-3 right-3">
              <span
                className="px-3 py-1 rounded-full text-[11px] font-bold text-white"
                style={{
                  background: "rgba(255,99,71,0.9)",
                  backdropFilter: "blur(8px)",
                }}
              >
                {upcomingTrip.dates !== "Dates to be set" ? upcomingTrip.dates : "Upcoming"}
              </span>
            </div>

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-lg">{upcomingTrip.flag}</span>
                    <h3 className="text-white font-black text-[17px]">
                      {upcomingTrip.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
                    {upcomingTrip.destinations && upcomingTrip.destinations.length > 0 ? (
                      upcomingTrip.destinations.map((d: any, idx: number) => (
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
                              })
                            }}
                            className="px-2 py-0.5 rounded-lg bg-white/20 hover:bg-white/35 text-white font-bold text-[10px] backdrop-blur-md transition-all active:scale-95 flex items-center gap-1 cursor-pointer border border-white/20 hover:border-white/40"
                            title={`Explore booking & hotels in ${d.city}`}
                          >
                            <span>📍 {d.city}</span>
                            <span className="text-[9px] opacity-80">↗</span>
                          </button>
                          {idx < upcomingTrip.destinations.length - 1 && (
                            <span className="text-white/50 text-[10px]">→</span>
                          )}
                        </span>
                      ))
                    ) : (
                      <p className="text-white/60 text-[12px]">{upcomingTrip.route}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-white/60 text-[11px]">
                    Planning progress
                  </span>
                  <span className="text-white font-bold text-[11px]">{upcomingTrip.progress}%</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${upcomingTrip.progress}%`,
                      background: "linear-gradient(90deg, #3B41C8, #06C4D4)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="w-full rounded-[24px] bg-white p-6 text-center"
            style={{ boxShadow: "0 8px 24px rgba(59,65,200,0.08)" }}
          >
            <span className="text-3xl mb-2 block">✈️</span>
            <h3 className="text-navy font-bold text-[16px] mb-1">
              No upcoming trip
            </h3>
            <p className="text-slate-400 text-[12px] mb-4">
              Where will your next adventure take you?
            </p>
            <button
              onClick={() => navigate("create-trip")}
              className="px-5 py-2.5 rounded-xl font-bold text-[12px] text-white"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
              }}
            >
              Plan a New Trip ✨
            </button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="px-5 md:px-8 mb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Quick Add
        </p>
        <div className="flex gap-2">
          {[
            { icon: "🏨", label: "Stay", action: "find-stay" as Screen },
            { icon: "✈️", label: "Transport", action: "transport" as Screen },
            { icon: "🎯", label: "Activity", action: "itinerary" as Screen },
            { icon: "🗺", label: "Map", action: "map" as Screen },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => navigate(item.action)}
              className="flex-1 flex flex-col items-center gap-2 py-3 rounded-2xl bg-white border border-slate-100/80 transition-transform active:scale-95 cursor-pointer"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.08)" }}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[11px] font-bold text-navy">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tripo AI banner */}
      <div className="px-5 md:px-8 mb-5">
        <button
          onClick={() => navigate("chatbot")}
          className="w-full rounded-[22px] overflow-hidden flex items-center gap-4 px-4 py-4 relative text-left"
          style={{
            background: "linear-gradient(135deg, #1e2080, #3B41C8)",
            boxShadow: "0 8px 24px rgba(59,65,200,0.35)",
          }}
        >
          <div className="absolute inset-0 opacity-15">
            <div
              className="absolute right-[-20px] top-[-20px] w-36 h-36 rounded-full"
              style={{
                background: "radial-gradient(circle, #06C4D4, transparent)",
              }}
            />
          </div>
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 relative"
            style={{ background: "rgba(255,255,255,0.12)" }}
          >
            🤖
          </div>
          <div className="flex-1 text-left relative">
            <p className="text-white font-black text-[15px]">Ask Tripo AI</p>
            <p className="text-white/55 text-[12px]">
              Plan a trip, get advice, compare destinations…
            </p>
          </div>
          <div className="flex-shrink-0 relative">
            <div
              className="px-3 py-1.5 rounded-full text-[11px] font-black"
              style={{ background: "rgba(6,196,212,0.25)", color: "#06C4D4" }}
            >
              Chat →
            </div>
          </div>
        </button>
      </div>

      {/* My Trips */}
      <div className="mb-4">
        <div className="px-5 md:px-8 flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            My Trips
          </p>
          <button onClick={() => navigate("trips")} className="text-[12px] font-bold text-brand">See all</button>
        </div>
        <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-4 gap-4 px-5 md:px-8 pb-1" : "flex gap-3 px-5 overflow-x-auto pb-1"}>
          {myTrips.length > 0 ? (
            myTrips.map((trip, idx) => (
              <button
                key={trip.name + idx}
                onClick={() => {
                  if (trip.id) setActiveTripId(trip.id)
                  navigate("trip-overview")
                }}
                className="flex-shrink-0 rounded-[20px] overflow-hidden relative text-left"
                style={
                  isDesktop
                    ? { width: "100%", height: "240px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }
                    : {
                        width: "160px",
                        height: "200px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                      }
                }
              >
                <img
                  src={trip.image}
                  alt={trip.name}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)",
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-base">{trip.flag}</span>
                    <span className="text-white font-bold text-[13px] leading-tight truncate">
                      {trip.name}
                    </span>
                  </div>
                  <p className="text-white/60 text-[11px] truncate">{trip.dates}</p>
                  <p className="text-white/50 text-[10px] mt-0.5">
                    {trip.dests} destinations
                  </p>
                </div>
              </button>
            ))
          ) : (
            <button
              onClick={() => navigate("create-trip")}
              className="w-full py-6 rounded-[20px] bg-white text-center font-bold text-slate-500 text-xs border border-dashed border-slate-300"
            >
              + Create a trip
            </button>
          )}
        </div>
      </div>

      {/* Budget summary strip */}
      <div className="px-5 md:px-8 mb-6">
        <button
          onClick={() => navigate("budget")}
          className="w-full rounded-2xl p-4 flex items-center justify-between"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
          }}
        >
          <div>
            <p className="text-white/70 text-[11px] font-medium mb-0.5">
              Trip Budget
            </p>
            <p className="text-white font-black text-[22px]">
              {formatMoney(budgetInfo.remaining, { display: displayCurrency })} left
            </p>
            <p className="text-white/60 text-[11px]">
              of {formatMoney(budgetInfo.total, { display: displayCurrency })} total
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="white"
                  strokeWidth="2"
                  fill="none"
                />
                <path
                  d="M12 7v5l3 3"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="text-white/70 text-[11px] font-semibold">
              View →
            </span>
          </div>
        </button>
      </div>

      {/* Community trips */}
      <div className="mb-6">
        <div className="px-5 md:px-8 flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Trip Community
            </p>
            <p className="text-navy font-black text-[15px]">
              What travelers are planning
            </p>
          </div>
          <button
            onClick={() => navigate("trip-social")}
            className="text-[12px] font-bold text-brand"
          >
            See all →
          </button>
        </div>

        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8" : "flex flex-col gap-3 px-5"}>
          {communityFeed.length === 0 ? (
            <button
              onClick={() => navigate("trip-social")}
              className="w-full rounded-[22px] bg-white px-4 py-5 text-left flex flex-col items-center gap-1"
              style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.1)" }}
            >
              <span className="text-3xl mb-1">🌍</span>
              <p className="text-navy font-black text-[14px]">
                No community trips yet
              </p>
              <p className="text-slate-400 text-[11px]">
                Publish a trip with public visibility to share it here.
              </p>
            </button>
          ) : (
            communityFeed.map((trip) => {
              const tripsOf = (trip.destinations || []).filter((d) => d.city)
              const routeCities = tripsOf
                .slice()
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map((d) => d.city)
              const dateRange = formatTripDateRange(trip.startDate, trip.endDate)
              const stopsCount = trip.destinationCount || routeCities.length
              return (
                <button
                  key={trip.id}
                  onClick={() => {
                    const plan = { destinations: trip.destinations, itinerary: [] }
                    setCommunityTripSelection({ meta: trip, plan })
                    navigate("community-trip-detail")
                    void getCommunityTripPlan(trip.id).then((livePlan) => {
                      setCommunityTripSelection({ meta: trip, plan: livePlan })
                    })
                  }}
                  className="w-full rounded-[22px] overflow-hidden text-left"
                  style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.1)" }}
                >
                  {/* Hero image */}
                  <div className="relative h-[130px]">
                    <CommunityTripCover
                      coverImageUrl={trip.coverImageUrl}
                      city={routeCities[0]}
                      title={trip.title}
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(13,15,46,0.85) 0%, rgba(13,15,46,0.1) 60%, transparent 100%)",
                      }}
                    />

                    {/* Vibe badge */}
                    {trip.travelStyle && (
                      <div className="absolute top-3 left-3">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-black text-white"
                          style={{ background: "#3B41C8cc" }}
                        >
                          {trip.travelStyle}
                        </span>
                      </div>
                    )}

                    {/* Title */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-base">🌍</span>
                        <p className="text-white font-black text-[14px]">
                          {trip.title}
                        </p>
                      </div>
                      {(dateRange || stopsCount > 0) && (
                        <p className="text-white/60 text-[11px]">
                          {dateRange ? `${dateRange} · ` : ""}
                          {stopsCount} stop{stopsCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-white px-4 py-3 flex items-center gap-3">
                    <img
                      src={
                        trip.ownerId && user?.id && String(trip.ownerId) === user.id
                          ? myAvatar
                          : trip.authorAvatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format"
                      }
                      alt={trip.authorName || "Traveler"}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-navy font-bold text-[12px]">
                        {trip.authorName || "Traveler"}
                      </p>
                      <p className="text-slate-400 text-[11px] truncate">
                        {routeCities.length > 0
                          ? routeCities.join(" → ")
                          : trip.summary || "Community trip"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px]">🔥</span>
                      <span className="text-navy font-black text-[12px]">{trip.reactionsCount ?? 0}</span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

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
