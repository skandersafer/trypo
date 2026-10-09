import { useState, useRef, useEffect } from "react"
import type { Screen } from "../App"
import { searchDestinations } from "../lib/travelApi"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Result = {
  title: string
  sub: string
  emoji: string
  category: string
  screen: Screen
  color: string
}

const allResults: Result[] = [
  {
    title: "Tunisia",
    sub: "Tunis, Sousse, Sfax",
    emoji: "🇹🇳",
    category: "Destination",
    screen: "map",
    color: "#3B41C8",
  },
  {
    title: "Morocco",
    sub: "Casablanca · Marrakech · Rabat",
    emoji: "🇲🇦",
    category: "Destination",
    screen: "explore",
    color: "#3B41C8",
  },
  {
    title: "Egypt",
    sub: "Cairo · Alexandria · Luxor",
    emoji: "🇪🇬",
    category: "Destination",
    screen: "explore",
    color: "#3B41C8",
  },
]

const trending: Array<{ title: string; emoji: string; screen: Screen }> = [
  { title: "Tunisia", emoji: "🇹🇳", screen: "map" },
  { title: "Morocco", emoji: "🇲🇦", screen: "explore" },
  { title: "Egypt", emoji: "🇪🇬", screen: "explore" },
  { title: "Algeria", emoji: "🇩🇿", screen: "explore" },
]

const recent: Array<{ title: string; emoji: string; screen: Screen }> = [
  { title: "Tunisia Escape", emoji: "🇹🇳", screen: "map" },
  { title: "Morocco coast route", emoji: "🇲🇦", screen: "explore" },
]

const categoryOrder = ["Destination", "Trip", "Stay", "Activity", "Tool"]
const categoryColor: Record<string, string> = {
  Destination: "#3B41C8",
  Trip: "#FF6347",
  Stay: "#06C4D4",
  Activity: "#7C3AED",
  Tool: "#10b981",
}

export default function SearchScreen({ navigate, goBack }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const value = query.trim()
    if (!value) {
      setResults([])
      setLoadingResults(false)
      return
    }

    let active = true
    setLoadingResults(true)

    async function loadResults() {
      try {
        const matches = await searchDestinations(value)
        if (!active) return
        const mapped = [...allResults, ...matches.map((item) => ({
          title: item.city,
          sub: `${item.country} · ${item.note}`,
          emoji:
            item.country === "Tunisia"
              ? "🇹🇳"
              : item.country === "Morocco"
                ? "🇲🇦"
                : item.country === "Egypt"
                  ? "🇪🇬"
                  : item.country === "Algeria"
                    ? "🇩🇿"
                    : "🌍",
          category: "Destination",
          screen: "map" as Screen,
          color: categoryColor.Destination,
        }))]
          .filter(
            (r, index, arr) =>
              arr.findIndex((entry) => entry.title === r.title) === index &&
              (r.title.toLowerCase().includes(value.toLowerCase()) ||
                r.sub.toLowerCase().includes(value.toLowerCase()) ||
                r.category.toLowerCase().includes(value.toLowerCase())),
          )
        setResults(mapped)
      } catch {
        if (!active) return
        setResults([...allResults].filter((r) => r.title.toLowerCase().includes(value.toLowerCase())))
      } finally {
        if (active) {
          setLoadingResults(false)
        }
      }
    }

    void loadResults()
    return () => {
      active = false
    }
  }, [query])

  const grouped = categoryOrder.reduce<Record<string, Result[]>>((acc, cat) => {
    const items = results.filter((r) => r.category === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Search bar */}
      <div className="px-5 md:px-8 mb-5">
        <div
          className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5"
          style={{ boxShadow: "0 4px 20px rgba(59,65,200,0.12)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle
              cx="7.5"
              cy="7.5"
              r="5.5"
              stroke="#3B41C8"
              strokeWidth="1.8"
            />
            <path
              d="M12 12l3.5 3.5"
              stroke="#3B41C8"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Destinations, stays, activities…"
            className="flex-1 text-[15px] font-semibold text-navy outline-none bg-transparent placeholder:text-slate-300"
          />
          {query.length > 0 ? (
            <button
              onClick={() => setQuery("")}
              className="text-slate-300 text-xl leading-none"
            >
              ×
            </button>
          ) : (
            <button
              onClick={() => goBack("home")}
              className="text-[13px] font-bold"
              style={{ color: "#3B41C8" }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {query.length > 0 && (
        <div className="px-5 md:px-8 pb-5">
          {loadingResults ? (
            <div className="rounded-2xl bg-white px-4 py-3 text-[12px] font-semibold text-slate-500">
              Searching live destinations…
            </div>
          ) : results.length > 0 ? (
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
              {results.map((r) => (
                <button
                  key={`${r.title}-${r.sub}`}
                  onClick={() => navigate(r.screen)}
                  className="flex items-center gap-3 py-3 px-4 bg-white rounded-2xl text-left"
                  style={{ boxShadow: "0 1px 6px rgba(59,65,200,0.07)" }}
                >
                  <span className="text-xl">{r.emoji}</span>
                  <div className="flex-1">
                    <p className="text-navy text-[13px] font-bold">{r.title}</p>
                    <p className="text-slate-400 text-[11px]">{r.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white px-4 py-6 text-center text-[12px] text-slate-500">
              No destination found for “{query}”.
            </div>
          )}
        </div>
      )}

      {/* Empty state — trending + recent */}
      {query.length === 0 && (
        <div className="px-5 md:px-8">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Recent searches
          </p>
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2 mb-5" : "flex flex-col gap-1 mb-5"}>
            {recent.map((r) => (
              <button
                key={r.title}
                onClick={() => navigate(r.screen)}
                className="flex items-center gap-3 py-2.5 px-4 bg-white rounded-2xl text-left"
                style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
              >
                <span className="text-slate-300 text-sm">🕐</span>
                <span className="text-navy text-[13px] font-semibold flex-1">
                  {r.title}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  opacity="0.3"
                >
                  <path
                    d="M4 2l4 4-4 4"
                    stroke="#0D0F2E"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ))}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Trending in Tunisia
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
            {trending.map((t) => (
              <button
                key={t.title}
                onClick={() => navigate(t.screen)}
                className="flex items-center gap-2.5 py-3 px-4 bg-white rounded-2xl text-left"
                style={{ boxShadow: "0 1px 6px rgba(59,65,200,0.07)" }}
              >
                <span className="text-xl">{t.emoji}</span>
                <span className="text-navy text-[12px] font-bold">
                  {t.title}
                </span>
              </button>
            ))}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Browse by category
          </p>
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2 pb-8" : "flex flex-col gap-2 pb-8"}>
            {[
              {
                label: "Destinations",
                emoji: "🌍",
                screen: "explore" as Screen,
                sub: "100+ destinations",
              },
              {
                label: "Stays",
                emoji: "🏨",
                screen: "find-stay" as Screen,
                sub: "Hostels, hotels & more",
              },
              {
                label: "Activities",
                emoji: "🎯",
                screen: "itinerary" as Screen,
                sub: "Things to do",
              },
              {
                label: "My Trips",
                emoji: "🗺",
                screen: "trips" as Screen,
                sub: "3 active trips",
              },
              {
                label: "Hidden Gems",
                emoji: "💎",
                screen: "hidden-gems" as Screen,
                sub: "Local secrets",
              },
            ].map((cat) => (
              <button
                key={cat.label}
                onClick={() => navigate(cat.screen)}
                className="flex items-center gap-3 py-3 px-4 bg-white rounded-2xl text-left"
                style={{ boxShadow: "0 1px 6px rgba(59,65,200,0.06)" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(59,65,200,0.07)" }}
                >
                  {cat.emoji}
                </div>
                <div>
                  <p className="text-navy font-bold text-[13px]">{cat.label}</p>
                  <p className="text-slate-400 text-[11px]">{cat.sub}</p>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="ml-auto"
                  opacity="0.25"
                >
                  <path
                    d="M5 3l4 4-4 4"
                    stroke="#0D0F2E"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {query.length > 0 && results.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center px-5 md:px-8">
          <span className="text-5xl mb-4">🔍</span>
          <p className="text-navy font-black text-[17px] mb-1">
            No results for "{query}"
          </p>
          <p className="text-slate-400 text-[13px]">
            Try destinations, stays, or activities
          </p>
        </div>
      )}

      {query.length > 0 && results.length > 0 && (
        <div className="px-5 md:px-8 pb-8">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-col gap-5">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black text-white"
                    style={{ background: categoryColor[cat] }}
                  >
                    {cat}
                  </span>
                </div>
                <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-1.5" : "flex flex-col gap-1.5"}>
                  {items.map((r) => (
                    <button
                      key={r.title}
                      onClick={() => navigate(r.screen)}
                      className="flex items-center gap-3 py-3 px-4 bg-white rounded-2xl text-left"
                      style={{ boxShadow: "0 1px 6px rgba(59,65,200,0.06)" }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{ background: `${r.color}12` }}
                      >
                        {r.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-navy font-bold text-[13px]">
                          {r.title}
                        </p>
                        <p className="text-slate-400 text-[11px] truncate">
                          {r.sub}
                        </p>
                      </div>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        opacity="0.25"
                      >
                        <path
                          d="M4 2l4 4-4 4"
                          stroke="#0D0F2E"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
