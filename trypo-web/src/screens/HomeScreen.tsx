import { useEffect, useState, type CSSProperties } from "react"
import type { Screen } from "../App"
import { useAuth, useMyAvatar } from "../lib/auth"
import {
  getCommunityTripPlan,
  getMyTrips,
  setActiveTripId,
} from "../lib/trips"
import { useMyNotifications, useMyTripsRealtime, useCommunityFeed } from "../lib/communityLive"
import { setCommunityTripSelection } from "../lib/community"
import CommunityTripCover from "../components/CommunityTripCover"
import { HeartIcon } from "../components/icons"
import { useIsDesktop } from "../lib/useIsDesktop"
import { useSettings } from "../lib/settings"

interface Props {
  navigate: (s: Screen) => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function parseDay(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "14 – 20 Sep 2026", "28 Sep – 4 Oct 2026" or "21 Dec 2026 – 14 Jan 2027". */
function compactTripRange(start?: string | null, end?: string | null): string {
  const s = parseDay(start)
  const e = parseDay(end)
  if (!s && !e) return "Dates to be set"
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
  if (s && !e) return s.toLocaleDateString("en-GB", opts)
  if (!s && e) return e.toLocaleDateString("en-GB", opts)
  if (!s || !e) return "Dates to be set"
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  const sm = s.toLocaleDateString("en-GB", { month: "short" })
  const em = e.toLocaleDateString("en-GB", { month: "short" })
  if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${sm} ${s.getFullYear()}`
  if (sameYear) return `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${s.getFullYear()}`
  return `${s.getDate()} ${sm} ${s.getFullYear()} – ${e.getDate()} ${em} ${e.getFullYear()}`
}

function tripLength(start?: string | null, end?: string | null): number | null {
  const s = parseDay(start)
  const e = parseDay(end)
  if (!s || !e) return null
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  return days > 0 ? days : null
}

export default function HomeScreen({ navigate }: Props) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const dark = settings.darkMode
  const [myTrips, setMyTrips] = useState<Array<any>>([])
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
          startDate: trip.start_date ? String(trip.start_date).slice(0, 10) : null,
          endDate: trip.end_date ? String(trip.end_date).slice(0, 10) : null,
          dests: destinations.length,
          progress: trip.planning_progress || 0,
          image:
            trip.cover_image_url ||
            "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=500&fit=crop&auto=format",
        }
      })
      setMyTrips(mapped)
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
  const firstName = userName.trim().split(/\s+/)[0] || "Traveler"
  const myAvatar = useMyAvatar()
  const isDesktop = useIsDesktop()

  // Nearest trip as of today: ongoing first, then the closest future start,
  // then dateless trips, then the most recently ended one. Never a stale
  // last-opened or list-order pick.
  const pickNearestTrip = (list: Array<any>): any | null => {
    if (list.length === 0) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const day = (v: string | null): number | null => {
      const d = parseDay(v)
      return d ? d.getTime() : null
    }
    const now = today.getTime()
    const ongoing = list
      .filter((t) => {
        const s = day(t.startDate)
        const e = day(t.endDate)
        return s !== null && s <= now && (e === null || e >= now)
      })
      .sort((a, b) => day(a.startDate)! - day(b.startDate)!)[0]
    if (ongoing) return ongoing
    const upcoming = list
      .filter((t) => {
        const s = day(t.startDate)
        return s !== null && s > now
      })
      .sort((a, b) => day(a.startDate)! - day(b.startDate)!)[0]
    if (upcoming) return upcoming
    const dateless = list.find((t) => day(t.startDate) === null)
    if (dateless) return dateless
    const past = list
      .filter((t) => {
        const e = day(t.endDate)
        return e !== null && e < now
      })
      .sort((a, b) => day(b.endDate)! - day(a.endDate)!)[0]
    return past || list[0]
  }
  const upcomingTrip = pickNearestTrip(myTrips)
  const upcomingDays = upcomingTrip
    ? tripLength(upcomingTrip.startDate, upcomingTrip.endDate)
    : null

  const upcomingBadge = (() => {
    if (!upcomingTrip?.startDate) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = parseDay(upcomingTrip.startDate)
    if (!start) return null
    const end = parseDay(upcomingTrip.endDate)
    if (start.getTime() <= today.getTime() && (!end || end.getTime() >= today.getTime())) {
      return end
        ? `Ongoing · ends ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "Ongoing"
    }
    const diff = Math.round((start.getTime() - today.getTime()) / 86400000)
    if (diff <= 0) return null
    return diff === 1 ? "Starts tomorrow" : `In ${diff} days`
  })()

  const openTrip = (id?: string) => {
    if (id) setActiveTripId(id)
    navigate("trip-overview")
  }

  const openCommunityTrip = (trip: any) => {
    const plan = { destinations: trip.destinations, itinerary: [] }
    setCommunityTripSelection({ meta: trip, plan })
    navigate("community-trip-detail")
    void getCommunityTripPlan(trip.id).then((livePlan: any) => {
      setCommunityTripSelection({ meta: trip, plan: livePlan })
    })
  }

  const actionButtonStyle: CSSProperties = {
    background: dark ? "#161B38" : "#ffffff",
    border: `1px solid ${dark ? "rgba(255,255,255,0.09)" : "rgba(226,232,240,0.75)"}`,
    borderRadius: 999,
    boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,0.05)",
  }
  const subtleCard = dark ? "none" : "0 4px 20px -2px rgba(15,23,42,0.05)"
  const cardBorder = dark ? "rgba(255,255,255,0.09)" : "rgba(226,232,240,0.7)"

  return (
    <div className="min-h-full bg-surface pb-6">
      <div className="pt-12" />

      <div className="mx-auto w-full max-w-[1100px]">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-3 md:px-8">
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                {greeting()}
              </p>
            </div>
            <h1 className="flex items-center gap-1.5 truncate text-[24px] font-extrabold tracking-tight text-navy md:text-[30px]">
              Hey, {firstName}
              <span className="inline-block transition-transform duration-200 hover:rotate-12">👋</span>
            </h1>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate("search")}
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center text-slate-600 transition-all duration-150 hover:bg-slate-50 active:scale-95"
              style={actionButtonStyle}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => navigate("notifications")}
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center text-slate-600 transition-all duration-150 hover:bg-slate-50 active:scale-95"
              style={actionButtonStyle}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadNotifs > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("profile")}
              aria-label="Profile"
              className="h-10 w-10 rounded-full p-[2px] transition-transform active:scale-95"
              style={{ background: "linear-gradient(135deg, #3b82f6, #818cf8, #22d3ee)" }}
            >
              <img
                src={myAvatar}
                alt={userName}
                className="h-full w-full rounded-full border border-white object-cover"
              />
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-6 px-5 pt-2 md:px-8">
          {/* AI planner */}
          <section>
            <button
              type="button"
              onClick={() => navigate("chatbot")}
              className="group flex w-full items-center justify-between gap-3 rounded-3xl border p-4 text-left transition-all duration-200 active:scale-[0.99]"
              style={{
                background: dark
                  ? "linear-gradient(135deg, #161B38 0%, rgba(30,41,80,0.55) 100%)"
                  : "linear-gradient(135deg, #ffffff 0%, rgba(239,246,255,0.55) 100%)",
                borderColor: dark ? "rgba(255,255,255,0.09)" : "rgba(219,234,254,0.9)",
                boxShadow: subtleCard,
              }}
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div
                  className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white"
                  style={{
                    background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 52%, #22d3ee 100%)",
                    boxShadow: "0 10px 30px -5px rgba(79,70,229,0.3)",
                  }}
                >
                  <span className="flex items-center text-sm font-black tracking-tight">
                    AI
                    <svg className="ml-0.5 h-3 w-3 animate-pulse text-cyan-200" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                    </svg>
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold tracking-tight text-navy transition-colors group-hover:text-brand">
                      Where to next?
                    </h3>
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                      style={{
                        background: dark ? "rgba(37,99,235,0.2)" : "#dbeafe",
                        color: dark ? "#93c5fd" : "#1d4ed8",
                      }}
                    >
                      NEW
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                    Ask Tripo to plan it — dates, stays, budget
                  </p>
                </div>
              </div>

              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-blue-50 group-hover:text-brand">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </button>
          </section>

          {/* Next trip */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Next Trip
              </h2>
              {upcomingTrip && (
                <button
                  type="button"
                  onClick={() => navigate("trips")}
                  className="group flex items-center gap-0.5 text-xs font-semibold text-brand"
                >
                  See all
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>

            {upcomingTrip ? (
              <button
                type="button"
                onClick={() => openTrip(upcomingTrip.id)}
                className="group relative w-full overflow-hidden rounded-[28px] text-left shadow-lg"
                style={{
                  height: isDesktop ? 300 : 228,
                  border: `1px solid ${cardBorder}`,
                  boxShadow: dark
                    ? "0 10px 30px rgba(0,0,0,0.35)"
                    : "0 10px 30px -12px rgba(15,23,42,0.35)",
                }}
              >
                <img
                  src={upcomingTrip.image}
                  alt={upcomingTrip.name}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, #020617 0%, rgba(15,23,42,0.62) 55%, rgba(15,23,42,0) 100%)",
                  }}
                />

                <div className="pointer-events-none absolute left-4 right-4 top-4 flex items-start justify-between gap-2">
                  <span className="inline-flex max-w-[60%] items-center rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white/90 backdrop-blur-md">
                    <span className="truncate">
                      {compactTripRange(upcomingTrip.startDate, upcomingTrip.endDate)}
                    </span>
                  </span>
                  {upcomingBadge && (
                    <span
                      className="inline-flex flex-shrink-0 animate-pulse items-center rounded-full border border-cyan-300/40 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white"
                      style={{
                        background: "linear-gradient(90deg, #06b6d4, #3b82f6)",
                        boxShadow: "0 8px 24px -4px rgba(6,182,212,0.45)",
                      }}
                    >
                      {upcomingBadge}
                    </span>
                  )}
                </div>

                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-xl font-extrabold tracking-tight drop-shadow-sm">
                      {upcomingTrip.name}
                    </h3>
                    {upcomingDays && (
                      <span className="flex-shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium text-slate-100 backdrop-blur-md">
                        {upcomingDays} Days
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 font-medium text-slate-200/90">
                    <svg className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.657 16.657 13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" />
                      <path d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
                    </svg>
                    <p className="truncate text-[11px]">{upcomingTrip.route}</p>
                  </div>

                  <div className="mt-3 border-t border-white/15 pt-2.5">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-slate-300">Planning progress</span>
                      <span className="font-bold text-cyan-300">{upcomingTrip.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20 backdrop-blur-sm">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, upcomingTrip.progress || 0))}%`,
                          background: "linear-gradient(90deg, #22d3ee, #60a5fa)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            ) : (
              <div
                className="flex w-full flex-col items-center justify-center rounded-[28px] border border-dashed px-6 text-center"
                style={{
                  height: isDesktop ? 300 : 228,
                  borderColor: dark ? "rgba(255,255,255,0.16)" : "#cbd5e1",
                  background: dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)",
                }}
              >
                <div
                  className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                  style={{ background: "linear-gradient(135deg, #2563eb, #22d3ee)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z" />
                  </svg>
                </div>
                <h3 className="text-[15px] font-black text-navy">No upcoming trip</h3>
                <p className="mt-1 text-[11px] text-slate-500">Tell Tripo where you want to go.</p>
                <button
                  type="button"
                  onClick={() => navigate("create-trip")}
                  className="mt-3 rounded-xl px-4 py-2 text-xs font-black text-white"
                  style={{
                    background: "linear-gradient(135deg, #2563eb, #06b6d4)",
                    boxShadow: "0 8px 20px -6px rgba(37,99,235,0.5)",
                  }}
                >
                  Plan a new trip
                </button>
              </div>
            )}
          </section>

          {/* My trips */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  My Trips
                </h2>
                {myTrips.length > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    {myTrips.length}
                  </span>
                )}
              </div>
              {myTrips.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate("trips")}
                  className="group flex items-center gap-0.5 text-xs font-semibold text-brand"
                >
                  See all
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>

            {myTrips.length > 0 ? (
              <div
                className={
                  isDesktop
                    ? "grid grid-cols-3 gap-3 xl:grid-cols-4"
                    : "-mx-1 flex gap-3.5 overflow-x-auto px-1 pb-1 pt-1 no-scrollbar"
                }
              >
                {myTrips.map((trip) => (
                  <button
                    key={trip.id ?? trip.name}
                    type="button"
                    onClick={() => openTrip(trip.id)}
                    className={`group relative overflow-hidden rounded-[24px] text-left ${
                      isDesktop ? "w-full" : "h-[190px] w-[136px] flex-none"
                    }`}
                    style={{
                      height: isDesktop ? 220 : 190,
                      border: `1px solid ${cardBorder}`,
                      boxShadow: dark ? "none" : "0 4px 16px rgba(15,23,42,0.06)",
                    }}
                  >
                    <img
                      src={trip.image}
                      alt={trip.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to top, #020617 0%, rgba(15,23,42,0.4) 55%, transparent 100%)",
                      }}
                    />
                    {trip.dests > 0 && (
                      <span className="absolute left-2.5 top-2.5 inline-flex items-center rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-md">
                        {trip.dests} {trip.dests === 1 ? "stop" : "stops"}
                      </span>
                    )}
                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <h4 className="truncate text-sm font-bold capitalize leading-tight tracking-tight">
                        {trip.name}
                      </h4>
                      <p className="mt-0.5 truncate text-[10px] font-medium text-slate-300">
                        {compactTripRange(trip.startDate, trip.endDate)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("create-trip")}
                className="w-full rounded-[20px] border border-dashed bg-white py-5 text-center text-[13px] font-bold text-slate-500"
                style={{ borderColor: dark ? "rgba(255,255,255,0.18)" : "#cbd5e1" }}
              >
                + Create your first trip
              </button>
            )}

            <div
              className="mt-3.5 flex items-start gap-2.5 rounded-2xl border p-3"
              style={{
                background: dark ? "#161B38" : "#ffffff",
                borderColor: cardBorder,
                boxShadow: dark ? "none" : "0 2px 10px rgba(15,23,42,0.03)",
              }}
            >
              <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-slate-500">
                Budget, bookings and trip tools live inside each trip — tap any card to open its
                itinerary.
              </p>
            </div>
          </section>

          {/* Community trips */}
          {communityFeed.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Community Trips
                  </h2>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    {communityFeed.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("trip-social")}
                  className="group flex items-center gap-0.5 text-xs font-semibold text-brand"
                >
                  See all
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>

              <div
                className={
                  isDesktop
                    ? "grid grid-cols-3 gap-3 xl:grid-cols-4"
                    : "-mx-1 flex gap-3.5 overflow-x-auto px-1 pb-1 pt-1 no-scrollbar"
                }
              >
                {communityFeed
                  .slice(0, isDesktop ? 8 : 6)
                  .map((trip: any) => {
                    const cities = (trip.destinations || [])
                      .filter((d: any) => d.city)
                      .map((d: any) => d.city)
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => openCommunityTrip(trip)}
                        className={`group flex flex-col overflow-hidden rounded-[24px] text-left ${
                          isDesktop ? "w-full" : "w-[150px] flex-none"
                        }`}
                        style={{
                          background: dark ? "#161B38" : "#ffffff",
                          border: `1px solid ${cardBorder}`,
                          boxShadow: dark ? "none" : "0 4px 16px rgba(15,23,42,0.06)",
                        }}
                      >
                        <div className="relative h-[100px] w-full overflow-hidden">
                          <CommunityTripCover
                            coverImageUrl={trip.coverImageUrl}
                            city={cities[0]}
                            title={trip.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div
                            className="absolute inset-0"
                            style={{
                              background:
                                "linear-gradient(to top, rgba(2,6,23,0.4) 0%, transparent 70%)",
                            }}
                          />
                        </div>

                        <div className="flex flex-1 flex-col justify-between p-2.5">
                          <div className="min-w-0">
                            <h4 className="truncate text-xs font-bold tracking-tight text-navy">
                              {trip.title}
                            </h4>
                            <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                              {compactTripRange(trip.startDate, trip.endDate)}
                            </p>
                          </div>

                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {trip.authorAvatar ? (
                                <img
                                  src={trip.authorAvatar}
                                  alt={trip.authorName || "Traveler"}
                                  className="h-4 w-4 flex-shrink-0 rounded-full object-cover"
                                />
                              ) : (
                                <span
                                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase text-white"
                                  style={{
                                    background: "linear-gradient(135deg, #2563eb, #22d3ee)",
                                  }}
                                >
                                  {(trip.authorName || "T").trim().charAt(0)}
                                </span>
                              )}
                              <span className="truncate text-[10px] font-medium text-slate-600">
                                {trip.authorName || "Traveler"}
                              </span>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1">
                              <HeartIcon size={12} filled className="text-rose-500" />
                              <span className="text-[10px] font-semibold text-slate-500">
                                {trip.reactionsCount ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
