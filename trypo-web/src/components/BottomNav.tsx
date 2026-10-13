import type { Screen } from "../App"
import { useSettings } from "../lib/settings"

interface Props {
  current: Screen
  navigate: (s: Screen) => void
}

function HomeIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9 21v-6h6v6" />
    </svg>
  )
}

function ExploreIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" fill={color} stroke="none" />
    </svg>
  )
}

function TripsIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M8 2.5v4M16 2.5v4M3 10.5h18" />
    </svg>
  )
}

function ProfileIcon({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5" />
    </svg>
  )
}

export default function BottomNav({ current, navigate }: Props) {
  const { t, settings } = useSettings()
  const active = (ids: Screen[]) => ids.includes(current)
  const activeColor = settings.darkMode ? "#38BDF8" : "#3B41C8"
  const inactiveColor = settings.darkMode ? "#A3B1D1" : "#94a3b8"

  return (
    <nav
      className="bg-white flex items-stretch"
      style={{
        minHeight: 72,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        borderTop: settings.darkMode ? "1px solid rgba(255,255,255,0.09)" : "1px solid #EEF0F8",
        boxShadow: settings.darkMode
          ? "0 -8px 24px rgba(0,0,0,0.4)"
          : "0 -8px 24px rgba(13,15,46,0.06)",
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

      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={() => navigate("create-trip")}
          aria-label="New trip"
          className="flex items-center justify-center active:scale-95 transition-transform"
          style={{
            width: 56,
            height: 56,
            marginTop: -18,
            borderRadius: 20,
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 12px 28px rgba(59,65,200,0.4)",
            border: "4px solid #F7F8FC",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 4v14M4 11h14" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <NavItem
        label={t("trips")}
        isActive={active(["trips", "trip-overview", "itinerary"])}
        onClick={() => navigate("trips")}
        activeColor={activeColor}
        inactiveColor={inactiveColor}
      >
        <TripsIcon active={active(["trips", "trip-overview", "itinerary"])} color={active(["trips", "trip-overview", "itinerary"]) ? activeColor : inactiveColor} />
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
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2"
      onClick={onClick}
    >
      {children}
      <span
        className="text-[10px]"
        style={{ color: isActive ? activeColor : inactiveColor, fontWeight: isActive ? 800 : 600 }}
      >
        {label}
      </span>
      <span
        style={{
          width: 16,
          height: 3,
          borderRadius: 99,
          background: isActive ? activeColor : "transparent",
        }}
      />
    </button>
  )
}
