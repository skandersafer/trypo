import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { searchDestinations } from "../lib/travelApi"
import { resolveKnownCoords } from "../lib/geocode"
import { createTrip } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const travelStyles = [
  { label: "Backpacking" },
  { label: "Relax" },
  { label: "City" },
  { label: "Adventure" },
  { label: "Luxury" },
]

const travelingWith = ["Solo", "Couple", "Friends", "Family"]

export default function CreateTripScreen({ navigate, goBack }: Props) {
  const { configured, user } = useAuth()
  const isDesktop = useIsDesktop()
  const [title, setTitle] = useState("")
  const [destinations, setDestinations] = useState<string[]>([])
  const [destInput, setDestInput] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [style, setStyle] = useState(0)
  const [companion, setCompanion] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [budget, setBudget] = useState("")
  const [destinationSuggestions, setDestinationSuggestions] = useState<Array<{ city: string; country: string; lat?: number; lng?: number }>>([])
  // Real GPS per city name, captured from suggestion taps (searchDestinations
  // already geocodes — we keep it so the map pins the exact city).
  const [coordCache, setCoordCache] = useState<Record<string, { lat: number; lng: number; country: string }>>({})

  useEffect(() => {
    const value = destInput.trim()
    if (!value) {
      setDestinationSuggestions([])
      return
    }

    let isMounted = true

    async function loadSuggestions() {
      const matches = await searchDestinations(value)
      if (!isMounted) return
      setDestinationSuggestions(matches.slice(0, 5))
    }

    loadSuggestions()
    return () => {
      isMounted = false
    }
  }, [destInput])

  const addDestination = async (value?: string) => {
    const nextValue = (value || destInput).trim()
    if (!nextValue) return

    // Destinations can ONLY come from the map/search suggestions — no
    // free-typed text. The tapped suggestion carries GPS; a typed value must
    // match a suggestion exactly, otherwise we refuse it.
    const tapped = destinationSuggestions.find(
      (s) => s.city.toLowerCase() === nextValue.toLowerCase(),
    )
    if (!tapped) {
      setError("Pick a destination from the suggestions — typed names alone can't be added.")
      return
    }
    if (Number.isFinite(Number(tapped.lat)) && Number.isFinite(Number(tapped.lng))) {
      setCoordCache((prev) => ({
        ...prev,
        [tapped.city.trim().toLowerCase()]: {
          lat: Number(tapped.lat),
          lng: Number(tapped.lng),
          country: tapped.country,
        },
      }))
    }

    const city = tapped.city
    setDestinations((existing) => {
      if (existing.some((d) => d.toLowerCase() === city.toLowerCase())) return existing
      return [...existing, city]
    })
    setDestInput("")
    setDestinationSuggestions([])
    setError(null)
  }

  /** Resolve real GPS for every destination before saving the trip. */
  const resolveDestinationDetails = async (cities: string[]) => {
    return Promise.all(
      cities.map(async (city) => {
        const key = city.trim().toLowerCase()
        const cached = coordCache[key]
        if (cached) return { city, ...cached }
        // 1. Built-in list first: instant + handles French spellings
        // ("Barcelone" -> Barcelona) with zero network dependency, and each
        // city resolves independently so stop #2 is never stop #1's pin.
        const known = resolveKnownCoords(city)
        if (known) return { city, lat: known.lat, lng: known.lng, country: known.country }
        try {
          const results = await searchDestinations(city)
          const normCity = city.trim().toLowerCase()
          const exact =
            results.find((r) => String(r.city || "").toLowerCase() === normCity) ||
            results[0]
          if (exact && Number.isFinite(Number(exact.lat)) && Number.isFinite(Number(exact.lng))) {
            return { city, lat: Number(exact.lat), lng: Number(exact.lng), country: exact.country }
          }
        } catch {
          /* offline — map will resolve it later */
        }
        return { city }
      }),
    )
  }

  const create = async () => {
    // Typed-but-unpicked text is never a destination: it must come from a
    // suggestion (same rule as the + button).
    let currentDestinations = [...destinations]
    if (destInput.trim()) {
      const match = destinationSuggestions.find(
        (s) => s.city.toLowerCase() === destInput.trim().toLowerCase(),
      )
      if (!match) {
        setError("Pick a destination from the suggestions — typed names alone can't be added.")
        return
      }
      if (!currentDestinations.some((d) => d.toLowerCase() === match.city.toLowerCase())) {
        currentDestinations.push(match.city)
        setDestinations(currentDestinations)
      }
      setDestInput("")
      setDestinationSuggestions([])
    }

    if (!title.trim() || !currentDestinations.length) {
      setError("Add a title and at least one destination.")
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError("End date can't be before start date.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const destinationDetails = await resolveDestinationDetails(currentDestinations)
      const budgetValue = parseFloat(budget)
      const newTripId = await createTrip({
        ownerId: user?.id,
        title: title.trim(),
        destinations: currentDestinations,
        destinationDetails,
        travelStyle: travelStyles[style].label,
        companionType: travelingWith[
          companion
        ].toLowerCase() as "solo" | "couple" | "friends" | "family",
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        totalBudget: Number.isFinite(budgetValue) && budgetValue > 0 ? Math.round(budgetValue) : undefined,
      })
      navigate("trips")
    } catch (cause: any) {
      console.error("Failed to create trip:", cause)
      setError(
        cause?.message ||
        (typeof cause === "string" ? cause : "Couldn't create the trip. Try again."),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-2">
        <button
          onClick={() => goBack("home")}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center trypo-card"
          style={{ borderRadius: 99 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="#0D0F2E"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div>
          <h1 className="text-[22px] font-black text-navy">
            New trip
          </h1>
          <p className="text-[12px]" style={{ color: "#94A3B8" }}>Where, when, how — 30 seconds</p>
        </div>
      </div>

      <div className="px-5 md:px-8 flex flex-col gap-5 pb-8 w-full md:max-w-2xl md:mx-auto">
        {/* Step 1 */}
        <div>
          <p className="trypo-section-label mb-2">1 · Trip name</p>
          <div
            className="bg-white rounded-2xl px-4 py-3.5"
            style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
          >
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full text-navy font-bold text-[15px] outline-none bg-transparent"
              placeholder="e.g. Tunisia Escape"
            />
          </div>
        </div>

        {/* Destinations */}
        <div>
          <p className="trypo-section-label mb-2">
            2 · Destinations
          </p>
          <div
            className="bg-white rounded-2xl p-4"
            style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
          >
            <div className="flex flex-wrap gap-2 mb-3">
              {destinations.map((d, i) => (
                <div
                  key={d}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                  style={{ background: "rgba(59,65,200,0.08)" }}
                >
                  <span className="text-brand font-semibold text-[13px]">
                    {d}
                  </span>
                  <button
                    onClick={() =>
                      setDestinations((ds) => ds.filter((_, idx) => idx !== i))
                    }
                    className="text-brand/50 font-bold text-[14px] leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={destInput}
                onChange={(e) => setDestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void addDestination()
                  }
                }}
                className="flex-1 text-[13px] text-navy outline-none"
                placeholder="Search a city, then tap a suggestion…"
              />
              <button
                onClick={() => void addDestination()}
                className="w-7 h-7 rounded-full bg-brand flex items-center justify-center flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 2v10M2 7h10"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {destinationSuggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {destinationSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.city}-${suggestion.country}`}
                    type="button"
                    onClick={() => void addDestination(suggestion.city)}
                    className="rounded-full px-2.5 py-1.5 text-[11px] font-bold"
                    style={{
                      background: "rgba(59,65,200,0.08)",
                      color: "#3B41C8",
                    }}
                  >
                    {suggestion.city} · {suggestion.country}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dates + budget */}
        <div>
          <p className="trypo-section-label mb-2">3 · Dates & budget</p>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              Start Date
            </label>
            <div
              className="bg-white rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <rect
                  x="1"
                  y="2.5"
                  width="12"
                  height="10"
                  rx="1"
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                />
                <path
                  d="M4 1v3M10 1v3M1 6.5h12"
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-navy font-semibold text-[13px] bg-transparent outline-none cursor-pointer"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              End Date
            </label>
            <div
              className="bg-white rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <rect
                  x="1"
                  y="2.5"
                  width="12"
                  height="10"
                  rx="1"
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                />
                <path
                  d="M4 1v3M10 1v3M1 6.5h12"
                  stroke="#94a3b8"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-navy font-semibold text-[13px] bg-transparent outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="mt-3">
          <label className="text-[12px] font-bold text-navy mb-2 block">
            Budget (optional)
          </label>
          <div
            className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-2"
            style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
          >
            <span className="text-slate-400 font-bold text-[15px]">€</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-full text-navy font-bold text-[15px] outline-none bg-transparent"
              placeholder="e.g. 1500"
            />
          </div>
        </div>
        </div>

        {/* Travel style */}
        <div>
          <p className="trypo-section-label mb-2">
            4 · Travel style
          </p>
          <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-5 gap-2 pb-1" : "flex gap-2 overflow-x-auto no-scrollbar pb-1"}>
            {travelStyles.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setStyle(i)}
                className="flex-shrink-0 px-4 py-3 rounded-2xl transition-all text-[12px] font-bold"
                style={{
                  background: i === style ? "#0D0F2E" : "white",
                  color: i === style ? "white" : "#64748B",
                  boxShadow:
                    i === style
                      ? "0 6px 16px rgba(13,15,46,0.25)"
                      : "0 2px 8px rgba(59,65,200,0.06)",
                  border: i === style ? "1px solid #0D0F2E" : "1px solid #EEF0F8",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Traveling with */}
        <div>
          <p className="trypo-section-label mb-2">
            5 · Who's going
          </p>
          <div className="flex gap-2">
            {travelingWith.map((c, i) => (
              <button
                key={c}
                onClick={() => setCompanion(i)}
                className={`flex-1 py-3 rounded-2xl text-[12px] font-bold transition-all ${
                  i === companion ? "text-white" : "text-slate-500 dark:text-slate-300"
                }`}
                style={{
                  background: i === companion ? "#3B41C8" : "white",
                  boxShadow:
                    i === companion
                      ? "0 6px 16px rgba(59,65,200,0.3)"
                      : "0 2px 8px rgba(59,65,200,0.06)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Route preview */}
        {destinations.length > 0 && (
        <div className="trypo-card p-4">
          <p className="trypo-section-label mb-3">
            Route
          </p>
          <div className="flex items-center gap-0 overflow-x-auto">
            {destinations.map((d, i) => (
              <div key={d} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px]"
                    style={{
                      background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[10px] font-semibold text-navy/70 mt-1 max-w-[60px] text-center">
                    {d}
                  </span>
                </div>
                {i < destinations.length - 1 && (
                  <div className="flex-shrink-0 mx-1 mb-4">
                    <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
                      <path
                        d="M0 4h16M12 1l4 3-4 3"
                        stroke="#06C4D4"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* CTA */}
        <button
          onClick={() => void create()}
          disabled={submitting}
          className="trypo-cta w-full py-4 text-[16px] disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create trip"}
        </button>
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
