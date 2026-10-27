import type { Screen } from "../App"
import { useSettings } from "../lib/settings"

interface Props {
  current: Screen
  navigate: (s: Screen) => void
}

function HomeIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={active ? color : "none"}
      stroke={color}
      strokeWidth={active ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  )
}

function ExploreIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={active ? 2.3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  )
}

function TripsIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={active ? 2.3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ProfileIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={active ? 2.3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function BottomNav({ current, navigate }: Props) {
  const { t, settings } = useSettings()
  const dark = settings.darkMode
  const active = (ids: Screen[]) => ids.includes(current)
  const activeColor = dark ? "#38BDF8" : "#2563EB"
  const inactiveColor = dark ? "#A3B1D1" : "#94A3B8"
  const tripsActive = active(["trips", "trip-overview", "itinerary"])

  return (
    <nav
      className="px-5 pt-2"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div
        className="relative mx-auto flex w-full max-w-[420px] items-center justify-between rounded-[32px] border px-3 py-2"
        style={{
          background: dark ? "rgba(17, 22, 48, 0.86)" : "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderColor: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.8)",
          boxShadow: dark
            ? "0 18px 40px rgba(0, 0, 0, 0.5)"
            : "0 18px 40px rgba(15, 23, 42, 0.16)",
        }}
      >
        <NavItem
          label={t("home")}
          isActive={active(["home"])}
          onClick={() => navigate("home")}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
        >
          <HomeIcon active={active(["home"])} color={active(["home"]) ? activeColor : inactiveColor} />
        </NavItem>

        <NavItem
          label={t("explore")}
          isActive={active(["explore"])}
          onClick={() => navigate("explore")}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
        >
          <ExploreIcon active={active(["explore"])} color={active(["explore"]) ? activeColor : inactiveColor} />
        </NavItem>

        <div className="relative -top-5 flex flex-col items-center">
          <button
            type="button"
            onClick={() => navigate("create-trip")}
            aria-label="Create new trip"
            className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 52%, #22d3ee 100%)",
              boxShadow: "0 8px 24px -4px rgba(6, 182, 212, 0.45)",
              border: `3.5px solid ${dark ? "#0B0E22" : "#ffffff"}`,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <NavItem
          label={t("trips")}
          isActive={tripsActive}
          onClick={() => navigate("trips")}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
        >
          <TripsIcon active={tripsActive} color={tripsActive ? activeColor : inactiveColor} />
        </NavItem>

        <NavItem
          label={t("profile")}
          isActive={active(["profile"])}
          onClick={() => navigate("profile")}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
        >
          <ProfileIcon active={active(["profile"])} color={active(["profile"]) ? activeColor : inactiveColor} />
        </NavItem>
      </div>
    </nav>
  )
}

function NavItem({
  label,
  onClick,
  isActive,
  children,
  activeColor,
  inactiveColor,
}: {
  label: string
  onClick: () => void
  isActive: boolean
  children: React.ReactNode
  activeColor: string
  inactiveColor: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex w-14 flex-col items-center justify-center py-1"
      onClick={onClick}
    >
      {children}
      <span
        className="mt-1 text-[10px] tracking-tight"
        style={{ color: isActive ? activeColor : inactiveColor, fontWeight: isActive ? 700 : 500 }}
      >
        {label}
      </span>
      <span
        className="mt-0.5 h-1.5 w-1.5 rounded-full"
        style={{ background: isActive ? activeColor : "transparent" }}
      />
    </button>
  )
}
