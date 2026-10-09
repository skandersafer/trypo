import type { Screen } from "../App"
import { useSettings } from "../lib/settings"

interface Props {
  current: Screen
  navigate: (s: Screen) => void
}

export default function BottomNav({ current, navigate }: Props) {
  const { t, settings } = useSettings()
  const active = (ids: Screen[]) => ids.includes(current)
  // Brand color: electric sky blue (#38BDF8) on dark nav bar for high contrast
  const activeColor = settings.darkMode ? "#38BDF8" : "#3B41C8"
  const inactiveColor = settings.darkMode ? "#A3B1D1" : "#94a3b8"

  return (
    <div
      className="min-h-[72px] bg-white flex items-center"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: settings.darkMode
          ? "0 -1px 0 rgba(255,255,255,0.09), 0 -8px 24px rgba(0,0,0,0.4)"
          : "0 -1px 0 #e2e4f0, 0 -8px 24px rgba(59,65,200,0.06)",
      }}
    >
      <NavItem
        label={t("home")}
        onClick={() => navigate("home")}
        isActive={active(["home"])}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M3 9.5L11 3l8 6.5V19a1 1 0 01-1 1H7a1 1 0 01-1-1v-5h4v5"
            stroke={active(["home"]) ? activeColor : inactiveColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </NavItem>
      <NavItem
        label={t("explore")}
        onClick={() => navigate("explore")}
        isActive={active(["explore"])}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle
            cx="11"
            cy="11"
            r="8.5"
            stroke={active(["explore"]) ? activeColor : inactiveColor}
            strokeWidth="1.8"
          />
          <path
            d="M14.5 7.5L12.5 12.5 7.5 14.5 9.5 9.5 14.5 7.5z"
            fill={active(["explore"]) ? activeColor : inactiveColor}
          />
        </svg>
      </NavItem>

      {/* Center plus button */}
      <button
        className="flex-1 flex items-center justify-center"
        onClick={() => navigate("create-trip")}
      >
        <div
          className="w-[52px] h-[52px] rounded-[18px] flex items-center justify-center -mt-3"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 20px rgba(59,65,200,0.4)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 4v14M4 11h14"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </button>

      <NavItem
        label={t("trips")}
        onClick={() => navigate("trips")}
        isActive={active(["trips", "trip-overview", "itinerary"])}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect
            x="3"
            y="5"
            width="16"
            height="14"
            rx="1.5"
            stroke={
              active(["trips", "trip-overview", "itinerary"])
                ? activeColor
                : inactiveColor
            }
            strokeWidth="1.8"
          />
          <path
            d="M7 3v4M15 3v4M3 11h16"
            stroke={
              active(["trips", "trip-overview", "itinerary"])
                ? activeColor
                : inactiveColor
            }
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </NavItem>
      <NavItem
        label={t("profile")}
        onClick={() => navigate("profile")}
        isActive={active(["profile"])}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle
            cx="11"
            cy="7.5"
            r="3.5"
            stroke={active(["profile"]) ? activeColor : inactiveColor}
            strokeWidth="1.8"
          />
          <path
            d="M3.5 19.5c0-4 3.4-7 7.5-7s7.5 3 7.5 7"
            stroke={active(["profile"]) ? activeColor : inactiveColor}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </NavItem>
    </div>
  )
}

function NavItem({
  label,
  onClick,
  isActive,
  children,
}: {
  label: string
  onClick: () => void
  isActive: boolean
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const labelColor = isActive
    ? settings.darkMode
      ? "#38BDF8"
      : "#3B41C8"
    : settings.darkMode
      ? "#A3B1D1"
      : "#94a3b8"
  return (
    <button
      className="flex-1 flex flex-col items-center justify-center gap-1"
      onClick={onClick}
    >
      {children}
      <span
        className="text-[10px] font-semibold"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </button>
  )
}
