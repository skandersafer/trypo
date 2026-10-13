import { useState } from "react"
import type { Screen } from "../App"
import { ToolIcon } from "./icons"

interface Props {
  current: Screen
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  children: React.ReactNode
}

const GROUPS: Array<{ key: string; label: string; screens: Screen[]; target: Screen }> = [
  { key: "overview", label: "Overview", screens: ["trip-overview"], target: "trip-overview" },
  { key: "plan", label: "Plan", screens: ["itinerary", "map", "weather"], target: "itinerary" },
  { key: "book", label: "Book", screens: ["find-stay", "stay-details", "transport", "bookings", "booking-detail"], target: "find-stay" },
  { key: "budget", label: "Budget", screens: ["budget", "split-bills", "currency"], target: "budget" },
  { key: "more", label: "More", screens: ["packing-list", "crew-tracker", "collaborative", "trip-memories", "hidden-gems", "vibe-match"], target: "packing-list" },
]

const MORE_TOOLS: Array<{ label: string; hint: string; target: Screen }> = [
  { label: "Packing list", hint: "What to bring", target: "packing-list" },
  { label: "Crew tracker", hint: "Live positions", target: "crew-tracker" },
  { label: "Crew & sharing", hint: "Invite & roles", target: "collaborative" },
  { label: "Memories", hint: "Photos & journal", target: "trip-memories" },
  { label: "Hidden gems", hint: "Local secrets", target: "hidden-gems" },
  { label: "Vibe match", hint: "Travel style", target: "vibe-match" },
  { label: "Weather", hint: "Forecast per stop", target: "weather" },
  { label: "Currency", hint: "Converter & rates", target: "currency" },
  { label: "Split bills", hint: "Shared costs", target: "split-bills" },
]

export const TRIP_SCREENS: Screen[] = Array.from(
  new Set(GROUPS.flatMap((g) => g.screens)),
)

export function tripGroupOf(screen: Screen): string {
  return GROUPS.find((g) => g.screens.includes(screen))?.key ?? "overview"
}

export default function TripDetailShell({ current, navigate, goBack, children }: Props) {
  const [showMore, setShowMore] = useState(false)
  const active = tripGroupOf(current)

  const goTab = (key: string) => {
    if (key === "more") {
      setShowMore(true)
      return
    }
    const g = GROUPS.find((x) => x.key === key)
    if (g && g.target !== current) navigate(g.target)
  }

  return (
    <div className="min-h-full">
      {/* Sticky trip nav — one place for all trip tools */}
      <div className="sticky top-0 z-40 bg-surface/95" style={{ backdropFilter: "blur(12px)" }}>
        <div className="px-5 md:px-8 pt-12 pb-2 flex items-center gap-2">
          <button
            onClick={() => goBack("trips")}
            aria-label="Back to trips"
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center trypo-card flex-shrink-0"
            style={{ borderRadius: 99 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#0D0F2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13 5 8l5-5" />
            </svg>
          </button>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 py-1">
            {GROUPS.map((g) => {
              const isActive = active === g.key
              return (
                <button
                  key={g.key}
                  onClick={() => goTab(g.key)}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] transition-all"
                  style={{
                    background: isActive ? "#0D0F2E" : "#FFFFFF",
                    color: isActive ? "#FFFFFF" : "#64748B",
                    fontWeight: isActive ? 800 : 600,
                    border: isActive ? "1px solid #0D0F2E" : "1px solid #EEF0F8",
                  }}
                >
                  {g.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div>{children}</div>

      {/* More sheet — secondary tools live here, not on Home */}
      {showMore && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          style={{ background: "rgba(13,15,46,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowMore(false)}
        >
          <div
            className="w-full bg-white rounded-t-[28px] p-5 pb-8 safe-pb"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#E2E8F0" }} />
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-navy font-black text-[17px]">Trip tools</h3>
              <button onClick={() => setShowMore(false)} className="text-[13px] font-bold text-brand">
                Done
              </button>
            </div>
            <p className="text-[12px] mb-4" style={{ color: "#94A3B8" }}>
              Everything else for this trip — pick one.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {MORE_TOOLS.map((t) => (
                <button
                  key={t.target}
                  onClick={() => {
                    setShowMore(false)
                    if (t.target !== current) navigate(t.target)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left trypo-card active:scale-[0.99] transition-transform"
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-brand flex-shrink-0"
                    style={{ background: "rgba(59,65,200,0.07)" }}
                  >
                    <ToolIcon name={t.label} size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-navy font-bold text-[14px]">{t.label}</span>
                    <span className="block text-[12px]" style={{ color: "#94A3B8" }}>{t.hint}</span>
                  </span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3.5 9.5 7 5 10.5" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
