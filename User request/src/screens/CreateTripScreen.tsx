import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { getSuggestedCitiesForCountry, searchDestinations } from "../lib/travelApi"
import { resolveKnownCoords } from "../lib/geocode"
import { createTrip } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const travelStyles = [
  { icon: "🎒", label: "Backpacking" },
  { icon: "🏝", label: "Relax" },
  { icon: "🏙", label: "City Explorer" },
  { icon: "🥾", label: "Adventure" },
  { icon: "💎", label: "Luxury" },
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

    // Remember GPS when the user taps a geocoded suggestion.
    const tapped = destinationSuggestions.find(
      (s) => s.city.toLowerCase() === nextValue.toLowerCase(),
    )
    if (tapped && Number.isFinite(Number(tapped.lat)) && Number.isFinite(Number(tapped.lng))) {
      setCoordCache((prev) => ({
        ...prev,
        [tapped.city.trim().toLowerCase()]: {
          lat: Number(tapped.lat),
          lng: Number(tapped.lng),
          country: tapped.country,
        },
      }))
    }

    const exactCountryMatches = await getSuggestedCitiesForCountry(nextValue)
    const proposedCities = exactCountryMatches.length > 0 ? exactCountryMatches : [nextValue]

    setDestinations((existing) => {
      const merged = [...existing]
      proposedCities.forEach((city) => {
        if (!merged.includes(city)) merged.push(city)
      })
      return merged
    })
    setDestInput("")
    setDestinationSuggestions([])
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
          const [first] = await searchDestinations(city)
          if (first && Number.isFinite(Number(first.lat)) && Number.isFinite(Number(first.lng))) {
            return { city, lat: Number(first.lat), lng: Number(first.lng), country: first.country }
          }
        } catch {
          /* offline — map will resolve it later */
        }
        return { city }
      }),
    )
  }

  const create = async () => {
    let currentDestinations = [...destinations]
    if (destInput.trim() && !currentDestinations.includes(destInput.trim())) {
      currentDestinations.push(destInput.trim())
      setDestinations(currentDestinations)
    }

    if (!title.trim() || !currentDestinations.length) {
      setError("Veuillez renseigner un titre et au moins une destination.")
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError("La date de fin ne peut pas être antérieure à la date de début.")
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
        (typeof cause === "string" ? cause : "Impossible de créer le voyage. Veuillez réessayer."),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-6">
        <button
          onClick={() => goBack("home")}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
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
            Where are we going?
          </h1>
          <p className="text-slate-400 text-[12px]">Create your new Trypo</p>
        </div>
      </div>

      <div className="px-5 md:px-8 flex flex-col gap-5 pb-8 w-full md:max-w-2xl md:mx-auto">
        {/* Trip name */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
            Trip Name
          </label>
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
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
            Destinations
          </label>
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
                placeholder="Type a country or city…"
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

        {/* Dates */}
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
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
            Budget (optional)
          </label>
          <div
            className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-2"
            style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
          >
            <span className="text-slate-400 font-bold text-[15px]">€</span>
            <input
              type="number"
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full text-navy font-bold text-[15px] outline-none bg-transparent"
              placeholder="e.g. 1500"
            />
          </div>
        </div>

        {/* Travel style */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
            Travel Style
          </label>
          <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-5 gap-2 pb-1" : "flex gap-2 overflow-x-auto pb-1"}>
            {travelStyles.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setStyle(i)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl transition-all"
                style={{
                  background: i === style ? "#3B41C8" : "white",
                  boxShadow:
                    i === style
                      ? "0 6px 16px rgba(59,65,200,0.3)"
                      : "0 2px 8px rgba(59,65,200,0.06)",
                }}
              >
                <span className="text-xl">{s.icon}</span>
                <span
                  className={`text-[11px] font-bold ${
                    i === style ? "text-white" : "text-slate-500 dark:text-slate-300"
                  }`}
                >
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Traveling with */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
            Traveling With
          </label>
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
        <div
          className="bg-white rounded-2xl p-4"
          style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Route Preview
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

        {/* CTA */}
        <button
          onClick={create}
          disabled={submitting}
          className="w-full py-4 rounded-2xl text-white font-black text-[16px]"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 12px 32px rgba(59,65,200,0.35)",
          }}
        >
          {submitting ? "Creating your Trypo…" : "Create My Trypo ✨"}
        </button>
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
