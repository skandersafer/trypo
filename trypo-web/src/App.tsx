import { useState, useEffect, useRef } from "react"
import SplashScreen from "./screens/SplashScreen"
import OnboardingScreen from "./screens/OnboardingScreen"
import HomeScreen from "./screens/HomeScreen"
import ExploreScreen from "./screens/ExploreScreen"
import CreateTripScreen from "./screens/CreateTripScreen"
import TripsListScreen from "./screens/TripsListScreen"
import TripOverviewScreen from "./screens/TripOverviewScreen"
import ItineraryScreen from "./screens/ItineraryScreen"
import FindStayScreen from "./screens/FindStayScreen"
import StayDetailsScreen from "./screens/StayDetailsScreen"
import TransportScreen from "./screens/TransportScreen"
import MapScreen from "./screens/MapScreen"
import BookingsScreen from "./screens/BookingsScreen"
import BookingDetailScreen from "./screens/BookingDetailScreen"
import BudgetScreen from "./screens/BudgetScreen"
import ProfileScreen from "./screens/ProfileScreen"
import EditProfileScreen from "./screens/EditProfileScreen"
import WorldMapScreen from "./screens/WorldMapScreen"
import SavedPlacesScreen from "./screens/SavedPlacesScreen"
import NotificationsScreen from "./screens/NotificationsScreen"
import SettingsScreen from "./screens/SettingsScreen"
import LogoutScreen from "./screens/LogoutScreen"
import PackingListScreen from "./screens/PackingListScreen"
import CurrencyScreen from "./screens/CurrencyScreen"
import WeatherScreen from "./screens/WeatherScreen"
import CollaborativeScreen from "./screens/CollaborativeScreen"
import VibeMatchScreen from "./screens/VibeMatchScreen"
import HiddenGemsScreen from "./screens/HiddenGemsScreen"
import SplitBillsScreen from "./screens/SplitBillsScreen"
import CrewTrackerScreen from "./screens/CrewTrackerScreen"
import SearchScreen from "./screens/SearchScreen"
import TripSocialScreen from "./screens/TripSocialScreen"
import CommunityTripDetailScreen from "./screens/CommunityTripDetailScreen"
import ChatbotScreen from "./screens/ChatbotScreen"
import TripMemoriesScreen from "./screens/TripMemoriesScreen"
import BottomNav from "./components/BottomNav"
import TripDetailShell, { TRIP_SCREENS } from "./components/TripDetailShell"
import AuthScreen from "./screens/AuthScreen"
import { useAuth, useMyAvatar } from "./lib/auth"
import { useLiveTripSync } from "./lib/liveTripSync"
import { useSettings } from "./lib/settings"
import { parseDeepLink, stashPendingJoinCode, type DeepRoute } from "./lib/deepLink"
import { getCommunityTrips, setActiveTripId } from "./lib/trips"
import { setCommunityTripSelection } from "./lib/community"

export type Screen = "splash" | "auth" | "onboarding" | "home" | "explore" | "create-trip" | "trips" | "trip-overview" | "itinerary" | "find-stay" | "stay-details" | "transport" | "map" | "bookings" | "booking-detail" | "budget" | "profile" | "edit-profile" | "world-map" | "saved-places" | "notifications" | "settings" | "logout" | "packing-list" | "currency" | "weather" | "collaborative" | "vibe-match" | "hidden-gems" | "split-bills" | "crew-tracker" | "search" | "trip-social" | "community-trip-detail" | "chatbot" | "trip-memories"

export type BookingType = "flight" | "stay" | "transport" | "activity"

/** True inside the Expo native shell, ?embed=1, or a real phone viewport. */
function useFullBleedShell(): boolean {
  const [fullBleed, setFullBleed] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      const w = window as unknown as Record<string, unknown>
      if (w.__TRYPO_NATIVE__ === true) return true
      if (document.documentElement.classList.contains("trypo-native")) return true
      const q = new URLSearchParams(window.location.search)
      if (q.get("embed") === "1" || q.get("native") === "1") return true
      // Aligned with useIsDesktop(768): 521–767px (tablets, landscape
      // phones, narrow windows) must not get a desktop shell with
      // mobile-only screens.
      if (window.innerWidth < 768) return true
    } catch {}
    return false
  })

  useEffect(() => {
    const onResize = () => {
      try {
        const w = window as unknown as Record<string, unknown>
        if (w.__TRYPO_NATIVE__ === true) {
          setFullBleed(true)
          return
        }
        if (document.documentElement.classList.contains("trypo-native")) {
          setFullBleed(true)
          return
        }
        const q = new URLSearchParams(window.location.search)
        if (q.get("embed") === "1" || q.get("native") === "1") {
          setFullBleed(true)
          return
        }
        setFullBleed(window.innerWidth < 768)
      } catch {}
    }
    // The native shell injects __TRYPO_NATIVE__ before first paint, but on a
    // cached bundle the flag can arrive late — re-check shortly after mount.
    const t = window.setTimeout(onResize, 300)
    window.addEventListener("resize", onResize)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return fullBleed
}

/** Sidebar navigation — desktop web only (md+). Mobile + native shell
 * keep the BottomNav. Same destinations, no behavior change. */
function DesktopSidebar({
  current,
  navigate,
  darkMode,
  userName,
  avatar,
}: {
  current: Screen
  navigate: (s: Screen) => void
  darkMode: boolean
  userName: string
  avatar: string
}) {
  const items: Array<{ label: string; path: string; screens: Screen[]; target: Screen }> = [
    { label: "Home", path: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M9 21v-6h6v6", screens: ["home"], target: "home" },
    { label: "Explore", path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5z", screens: ["explore"], target: "explore" },
    { label: "My Trips", path: "M3 4.5h18a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Zm-1 6h20M8 2.5v4M16 2.5v4", screens: ["trips", "trip-overview", "itinerary"], target: "trips" },
    { label: "Community", path: "M12 21c-5 0-8-3.5-8-8a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 4.5-3 8-8 8Zm-4-9h.01M12 12h.01M16 12h.01", screens: ["trip-social", "community-trip-detail"], target: "trip-social" },
    { label: "Tripo AI", path: "M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13", screens: ["chatbot"], target: "chatbot" },
  ]
  const isActive = (screens: Screen[]) => screens.includes(current)
  const profileActive = current === "profile" || current === "edit-profile" || current === "settings"
  return (
    <aside
      className="sticky top-0 hidden h-dvh w-[248px] flex-shrink-0 flex-col md:flex lg:w-[264px]"
      style={{
        background: darkMode ? "#0B0E22" : "#ffffff",
        borderRight: darkMode ? "1px solid rgba(255,255,255,0.09)" : "1px solid #e2e4f0",
      }}
    >
      <button
        onClick={() => navigate("home")}
        className="flex items-center gap-2.5 px-5 pb-6 pt-6 text-left"
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-black text-white"
          style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
        >
          T
        </span>
        <span
          className="text-[19px] font-black tracking-tight"
          style={{ color: darkMode ? "#fff" : "#0D0F2E" }}
        >
          Trypo
        </span>
      </button>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => {
          const active = isActive(item.screens)
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.target)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13.5px] font-bold transition-all"
              style={{
                color: active ? (darkMode ? "#38BDF8" : "#3B41C8") : darkMode ? "#A3B1D1" : "#64748b",
                background: active ? (darkMode ? "rgba(56,189,248,0.12)" : "rgba(59,65,200,0.08)") : "transparent",
              }}
            >
              <span className="flex w-5 justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.path} />
                </svg>
              </span>
              {item.label}
            </button>
          )
        })}
        <button
          onClick={() => navigate("create-trip")}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13.5px] font-black text-white transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 20px rgba(59,65,200,0.35)",
          }}
        >
          <span className="text-[16px] leading-none">+</span> New trip
        </button>
      </nav>
      <div
        className="p-3"
        style={{ borderTop: darkMode ? "1px solid rgba(255,255,255,0.09)" : "1px solid #e2e4f0" }}
      >
        <button
          onClick={() => navigate("profile")}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all"
          style={{ background: profileActive ? (darkMode ? "rgba(56,189,248,0.12)" : "rgba(59,65,200,0.08)") : "transparent" }}
        >
          <img src={avatar} alt={userName} className="h-9 w-9 rounded-full object-cover" />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[13px] font-black"
              style={{ color: darkMode ? "#fff" : "#0D0F2E" }}
            >
              {userName}
            </span>
            <span
              className="block text-[11px] font-medium"
              style={{ color: darkMode ? "#A3B1D1" : "#94a3b8" }}
            >
              View profile
            </span>
          </span>
        </button>
      </div>
    </aside>
  )
}
/** Forward _blank / cross-origin links to the Expo shell in-app browser. */
function useNativeLinkBridge(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a")
      if (!anchor) return
      const href = anchor.getAttribute("href") || ""
      if (!/^https?:\/\//.test(href)) return
      try {
        const target = anchor.getAttribute("target")
        const sameOrigin = new URL(href, window.location.href).origin === window.location.origin
        if (target === "_blank" || !sameOrigin) {
          const rnw = (window as unknown as Record<string, unknown>).ReactNativeWebView as
            | { postMessage?: (msg: string) => void }
            | undefined
          if (rnw?.postMessage) {
            e.preventDefault()
            rnw.postMessage(JSON.stringify({ type: "openExternal", url: href }))
          }
        }
      } catch {}
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [enabled])
}

const NAV_SCREENS: Screen[] = [
  "home",
  "explore",
  "create-trip",
  "trips",
  "profile",
]

export default function App() {
  const { configured, loading, user, signOut } = useAuth()
  const { settings, t } = useSettings()
  const avatar = useMyAvatar()
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler"
  const fullBleed = useFullBleedShell()
  useNativeLinkBridge(fullBleed)
  const [isBrowserOffline, setIsBrowserOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  )

  useEffect(() => {
    const onOnline = () => setIsBrowserOffline(false)
    const onOffline = () => setIsBrowserOffline(true)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])
  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window !== "undefined") {
      const userRaw = localStorage.getItem("trypo_local_auth_user")
      if (userRaw) return "home"
      const seenOnboarding = localStorage.getItem("trypo_has_seen_onboarding")
      if (seenOnboarding) return "auth"
    }
    return "splash"
  })
  const [bookingType, setBookingType] = useState<BookingType>("flight")

  useLiveTripSync()

  const historyRef = useRef<Screen[]>([])

  // Push-style navigation with a real back stack. Auth entry screens
  // (splash/onboarding/auth) always reset the stack so "back" can never
  // return to them or leak a logged-out screen.
  const navigate = (s: Screen) => {
    setScreen((prev) => {
      if (prev === s) return prev
      if (
        prev === "splash" ||
        prev === "onboarding" ||
        prev === "auth" ||
        s === "splash" ||
        s === "onboarding" ||
        s === "auth"
      ) {
        historyRef.current = []
      } else {
        historyRef.current.push(prev)
        if (historyRef.current.length > 30) historyRef.current.shift()
      }
      return s
    })
  }
  // Root navigation (bottom tabs, login/logout success): replaces the stack.
  const navigateRoot = (s: Screen) => {
    historyRef.current = []
    setScreen(s)
  }
  // True "back": returns to the screen you actually came from. Falls back
  // to the screen's legacy hardcoded destination when the stack is empty
  // (e.g. after a full reload straight onto a deep screen).
  const goBack = (fallback?: Screen) => {
    const prev = historyRef.current.pop()
    if (prev) setScreen(prev)
    else if (fallback) {
      historyRef.current = []
      setScreen(fallback)
    }
  }
  const openBooking = (type: BookingType) => {
    setBookingType(type)
    navigate("booking-detail")
  }

  // ── Deep links (trypo://…, https://trypo-app.vercel.app/…, ?screen=…) ──
  // Handles a cold-start URL plus links arriving while the app runs
  // (native shell re-emits them as `trypo:deep-link` window events).
  const pendingRouteRef = useRef<DeepRoute | null>(null)
  const userRef = useRef(user)
  userRef.current = user

  const applyDeepRoute = (route: DeepRoute | null) => {
    if (!route) return
    // Not signed in yet → park it; the effect below applies it after login
    // (the render gate already shows Auth when there is no user).
    if (!userRef.current) {
      pendingRouteRef.current = route
      return
    }
    switch (route.kind) {
      case "screen":
        navigateRoot(route.screen)
        break
      case "trip":
        try {
          setActiveTripId(route.tripId)
        } catch {}
        navigateRoot("trip-overview")
        break
      case "community-trip": {
        const id = route.tripId
        navigateRoot("community-trip-detail")
        // Hydrate the selection so the detail screen has real data.
        void getCommunityTrips()
          .then((list) => list.find((t) => String(t.id) === String(id)))
          .then((meta) => {
            if (meta) setCommunityTripSelection({ meta, plan: { destinations: meta.destinations, itinerary: [] } })
          })
          .catch(() => {})
        break
      }
      case "join":
        stashPendingJoinCode(route.code)
        navigateRoot("trips")
        break
    }
  }

  useEffect(() => {
    // Cold start: current browser URL (universal link / pasted link).
    // Skip a bare "/" open — only route when there is a real path/query.
    try {
      const u = new URL(window.location.href)
      const hasPath = u.pathname !== "/" || [...u.searchParams.keys()].length > 0
      if (hasPath) {
        const cold = parseDeepLink(window.location.href)
        // Defer one tick so auth state settles first.
        const t = window.setTimeout(() => applyDeepRoute(cold), 600)
        void t
      }
    } catch {}
    const onDeepLink = (e: Event) => {
      const url = (e as CustomEvent).detail?.url as string | undefined
      applyDeepRoute(parseDeepLink(url))
    }
    window.addEventListener("trypo:deep-link", onDeepLink)
    // The native shell may have delivered a cold-start link before we subscribed.
    try {
      const w = window as unknown as Record<string, unknown>
      const pending = w.__TRYPO_PENDING_DEEP_LINK
      if (typeof pending === "string" && pending) {
        w.__TRYPO_PENDING_DEEP_LINK = null
        window.setTimeout(() => applyDeepRoute(parseDeepLink(pending)), 600)
      }
    } catch {}
    return () => window.removeEventListener("trypo:deep-link", onDeepLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply a parked deep link right after sign-in.
  useEffect(() => {
    if (user && pendingRouteRef.current) {
      const route = pendingRouteRef.current
      pendingRouteRef.current = null
      const t = window.setTimeout(() => applyDeepRoute(route), 300)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user !== null])

  const showNav = NAV_SCREENS.includes(screen)
  const inTrip = TRIP_SCREENS.includes(screen)

  const renderContent = () => {
    // If not authenticated and not on public splash/onboarding/auth screens, force Auth
    if (!user && screen !== "splash" && screen !== "onboarding" && screen !== "auth") {
      return <AuthScreen onSuccess={() => navigateRoot("home")} navigate={navigate} />
    }

    switch (screen) {
      case "splash":
        return <SplashScreen navigate={navigate} />
      case "auth":
        return <AuthScreen onSuccess={() => navigateRoot("home")} navigate={navigate} />
      case "onboarding":
        return <OnboardingScreen navigate={navigate} />
      case "home":
        return <HomeScreen navigate={navigate} />
      case "explore":
        return <ExploreScreen navigate={navigate} />
      case "create-trip":
        return <CreateTripScreen navigate={navigate} goBack={goBack} />
      case "trips":
        return <TripsListScreen navigate={navigate} />
      case "trip-overview":
        return <TripOverviewScreen navigate={navigate} goBack={goBack} />
      case "itinerary":
        return <ItineraryScreen navigate={navigate} goBack={goBack} />
      case "find-stay":
        return <FindStayScreen navigate={navigate} openBooking={openBooking} goBack={goBack} />
      case "stay-details":
        return <StayDetailsScreen navigate={navigate} goBack={goBack} />
      case "transport":
        return <TransportScreen navigate={navigate} openBooking={openBooking} goBack={goBack} />
      case "map":
        return <MapScreen navigate={navigate} goBack={goBack} />
      case "bookings":
        return <BookingsScreen navigate={navigate} openBooking={openBooking} goBack={goBack} />
      case "booking-detail":
        return (
          <BookingDetailScreen navigate={navigate} bookingType={bookingType} goBack={goBack} />
        )
      case "budget":
        return <BudgetScreen navigate={navigate} goBack={goBack} />
      case "profile":
        return <ProfileScreen navigate={navigate} />
      case "edit-profile":
        return <EditProfileScreen navigate={navigate} goBack={goBack} />
      case "world-map":
        return <WorldMapScreen navigate={navigate} goBack={goBack} />
      case "saved-places":
        return <SavedPlacesScreen navigate={navigate} goBack={goBack} />
      case "notifications":
        return <NotificationsScreen navigate={navigate} goBack={goBack} />
      case "settings":
        return <SettingsScreen navigate={navigate} goBack={goBack} />
      case "logout":
        return (
          <LogoutScreen
            navigate={navigate}
            goBack={goBack}
            onLogout={async () => {
              await signOut()
              navigateRoot("auth")
            }}
          />
        )
      case "packing-list":
        return <PackingListScreen navigate={navigate} goBack={goBack} />
      case "currency":
        return <CurrencyScreen navigate={navigate} goBack={goBack} />
      case "weather":
        return <WeatherScreen navigate={navigate} goBack={goBack} />
      case "collaborative":
        return <CollaborativeScreen navigate={navigate} goBack={goBack} />
      case "vibe-match":
        return <VibeMatchScreen navigate={navigate} goBack={goBack} />
      case "hidden-gems":
        return <HiddenGemsScreen navigate={navigate} goBack={goBack} />
      case "split-bills":
        return <SplitBillsScreen navigate={navigate} goBack={goBack} />
      case "crew-tracker":
        return <CrewTrackerScreen navigate={navigate} goBack={goBack} />
      case "search":
        return <SearchScreen navigate={navigate} goBack={goBack} />
      case "trip-social":
        return <TripSocialScreen navigate={navigate} goBack={goBack} />
      case "community-trip-detail":
        return <CommunityTripDetailScreen navigate={navigate} goBack={goBack} />
      case "chatbot":
        return <ChatbotScreen navigate={navigate} goBack={goBack} />
      case "trip-memories":
        return <TripMemoriesScreen navigate={navigate} goBack={goBack} />
      default:
        return null
    }
  }

  const renderScreen = () => {
    const content = renderContent()
    if (inTrip) {
      return (
        <TripDetailShell current={screen} navigate={navigate} goBack={goBack}>
          {content}
        </TripDetailShell>
      )
    }
    return content
  }

  return (
    <div
      className={fullBleed ? "h-dvh w-full flex flex-col overflow-hidden" : "min-h-dvh w-full flex flex-col"}
      style={{
        background: "#E9ECF5",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div
        className={`relative flex flex-col bg-surface${settings.darkMode ? " dark" : ""} ${fullBleed ? "overflow-hidden" : "overflow-visible"}`}
        style={
          fullBleed
            ? {
                width: "100%",
                maxWidth: "100%",
                height: "100dvh",
                minHeight: "100%",
                margin: "0 auto",
                borderRadius: 0,
                boxShadow: "none",
                overflow: "hidden",
              }
            : {
                // Desktop web: full-screen layout, no centered column —
                // the app fills the entire viewport width.
                width: "100%",
                maxWidth: "100%",
                minHeight: "100dvh",
                margin: "0 auto",
                borderRadius: 0,
                boxShadow: "none",
              }
        }
      >
        {isBrowserOffline && (
          <div className="z-[60] px-4 py-2 text-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: "#ef4444" }}>
            📡 {t("offlineBanner")}
          </div>
        )}
        {!fullBleed && user && (
          <div className="hidden min-h-dvh w-full flex-row md:flex">
            <DesktopSidebar
              current={screen}
              navigate={navigateRoot}
              darkMode={settings.darkMode}
              userName={userName}
              avatar={avatar}
            />
            <div className="relative min-w-0 flex-1" style={{ overflow: "visible" }}>
              {renderScreen()}
            </div>
          </div>
        )}
        {!fullBleed && !user && (
          <div className="relative min-h-dvh flex-1" style={{ overflow: "visible" }}>
            {renderScreen()}
          </div>
        )}
        {fullBleed && (
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden relative"
          style={{
                  paddingBottom: showNav ? "calc(72px + env(safe-area-inset-bottom, 0px))" : "0",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                }}
        >
          {renderScreen()}
        </div>
        )}
        {showNav && fullBleed && (
          <div className="absolute bottom-0 left-0 right-0 z-50">
            <BottomNav current={screen} navigate={navigateRoot} />
          </div>
        )}
      </div>
    </div>
  )
}
