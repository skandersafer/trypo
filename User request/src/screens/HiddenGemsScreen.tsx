import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { getHiddenGemsForCity, type HiddenGemPoi } from "../lib/travelApi"
import { getActiveTripId, getMyTrips, getTripDetails } from "../lib/trips"
import { CURATED_HIDDEN_GEMS } from "../lib/hiddenGemsData"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

export type Gem = {
  id: string
  title: string
  location: string
  city: string
  category: string
  emoji: string
  tip: string
  submittedBy: string
  source?: string
  sourceIcon?: string
  sourceBadgeColor?: string
  flag: string
  votes: number
  image: string
  tags: string[]
  voted: boolean
  mapsUrl?: string
  distanceKm?: number
  live?: boolean
}

type FilterKey = "all" | "food" | "bar" | "culture" | "nature" | "activity"

/** Vibe-first picker: one tap maps a mood to gem categories. */
const VIBES: { id: string; emoji: string; label: string; categories: FilterKey[] }[] = [
  { id: "adventurous", emoji: "🧗", label: "Adventurous", categories: ["activity", "nature"] },
  { id: "chill", emoji: "🌊", label: "Chill", categories: ["nature", "bar"] },
  { id: "cultural", emoji: "🛕", label: "Cultural", categories: ["culture"] },
  { id: "social", emoji: "🎉", label: "Social", categories: ["bar", "activity"] },
  { id: "foodie", emoji: "🍜", label: "Foodie", categories: ["food", "bar"] },
  { id: "nature", emoji: "🌿", label: "Nature", categories: ["nature"] },
]

const VIBE_STORAGE_KEY = "trypo_hidden_gems_vibe"

function categoriesForVibe(vibeId: string | null): FilterKey[] {
  if (!vibeId) return []
  return VIBES.find((v) => v.id === vibeId)?.categories ?? []
}

const GEM_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop&auto=format"

/** Guess a filter category + emoji from a place's words (for live gems). */
function classifyLiveGem(title: string, text: string): { category: string; emoji: string } {
  const hay = `${title} ${text}`.toLowerCase()
  const has = (...words: string[]) => words.some((w) => hay.includes(w))
  if (
    has(
      "restaurant", "cuisine", "dish", "bakery", "cafe", "food", "market hall", "street food",
      "yakitori", "brik", "tapas", "trattoria", "osteria", "pizzeria", "gelato", "bistro",
      "ramen", "coffee", "pastry", "breakfast", "dining", "patisserie", "taqueria", "pasta",
      "eatery", "noodle", "diner", "gastronomy", "gourmet", "tavern", "wine & dine"
    )
  ) {
    return { category: "food", emoji: "🍜" }
  }
  if (
    has(
      "bar", "pub", "brewery", "nightlife", "cocktail", "wine bar", "speakeasy", "lounge",
      "spirits", "rooftop", "beer", "club", "disco", "drinks", "jazz bar", "taproom"
    )
  ) {
    return { category: "bar", emoji: "🍸" }
  }
  if (
    has(
      "park", "garden", "beach", "cave", "waterfall", "nature", "mountain", "lake", "island",
      "cove", "forest", "spring", "ravine", "viewpoint", "botanical", "cliff", "river",
      "trail", "reserve", "hills", "valley", "panoramic", "lookout", "sanctuary", "promenade"
    )
  ) {
    return { category: "nature", emoji: "🌿" }
  }
  if (
    has(
      "museum", "mosque", "church", "temple", "castle", "historic", "monument", "medina",
      "old town", "heritage", "palace", "fort", "shrine", "archaeolog", "gallery", "theatre",
      "theater", "library", "ruins", "basilica", "cathedral", "abbey", "cloister", "piazza",
      "square", "fountain", "ancient", "monastery", "tower", "bridge"
    )
  ) {
    return { category: "culture", emoji: "🛕" }
  }
  return { category: "activity", emoji: "🎯" }
}

export default function HiddenGemsScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [liveGems, setLiveGems] = useState<Gem[]>([])
  const [tripCities, setTripCities] = useState<string[]>([])
  const [tripName, setTripName] = useState<string | null>(null)
  const [loadingGems, setLoadingGems] = useState(true)
  const [activeVibe, setActiveVibe] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VIBE_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [activeCity, setActiveCity] = useState<string>("All Stops")
  const [expanded, setExpanded] = useState<string | null>(null)

  // Load the active trip's destinations and fetch multi-source hidden gems
  useEffect(() => {
    let active = true
    setLoadingGems(true)

    async function loadTripGems() {
      try {
        const activeId = getActiveTripId()
        let tripData = activeId ? await getTripDetails(activeId) : await getTripDetails()

        if (!tripData) {
          const list = await getMyTrips()
          tripData = (activeId ? list.find((t) => t.id === activeId) : null) || list[0] || null
        }

        const seen = new Set<string>()
        const cities: { city: string; country: string }[] = []

        if (tripData) {
          // 1. trip_destinations
          const rawDestinations: any[] = [...(tripData?.trip_destinations ?? [])].sort(
            (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
          )
          for (const d of rawDestinations) {
            const c = String(d?.city || "").trim()
            if (c && !seen.has(c.toLowerCase())) {
              seen.add(c.toLowerCase())
              cities.push({ city: c, country: String(d?.country || "") })
            }
          }

          // 2. destinations array
          if (cities.length === 0 && Array.isArray((tripData as any)?.destinations)) {
            for (const d of (tripData as any).destinations) {
              const c = String(typeof d === "string" ? d : d?.city || "").trim()
              if (c && !seen.has(c.toLowerCase())) {
                seen.add(c.toLowerCase())
                cities.push({ city: c, country: typeof d === "object" ? String(d?.country || "") : "" })
              }
            }
          }

          // 3. title fallback if trip is named "Trip to Rome" or "Paris & Amsterdam"
          if (cities.length === 0 && tripData?.title) {
            const clean = tripData.title.replace(/^(Trip to|Voyage à|Voyage a|Trip)\s+/i, "")
            const parts = clean.split(/[,&→·/\-]+/).map((s) => s.trim()).filter(Boolean)
            for (const p of parts) {
              if (p.length > 2 && !seen.has(p.toLowerCase())) {
                seen.add(p.toLowerCase())
                cities.push({ city: p, country: "" })
              }
            }
          }
        }

        if (!active) return

        const extractedCityNames = cities.map((c) => c.city)
        setTripCities(extractedCityNames)
        setTripName(tripData?.title || (extractedCityNames.length > 0 ? extractedCityNames.join(" · ") : null))

        // Check if user clicked a specific destination earlier
        const targetCity =
          typeof window !== "undefined"
            ? localStorage.getItem("trypo_hidden_gems_target_city") ||
              localStorage.getItem("trypo_vibe_match_target_city")
            : null
        if (targetCity) {
          const matched = extractedCityNames.find((c) => c.toLowerCase() === targetCity.toLowerCase())
          if (matched) {
            setActiveCity(matched)
          } else {
            extractedCityNames.unshift(targetCity)
            cities.unshift({ city: targetCity, country: "" })
            setActiveCity(targetCity)
            setTripCities([...extractedCityNames])
          }
        } else if (extractedCityNames.length === 1) {
          setActiveCity(extractedCityNames[0])
        } else {
          setActiveCity("All Stops")
        }

        // Determine which cities to fetch: the trip's destinations or fallback popular cities
        const queryCities = cities.length > 0 ? cities : [
          { city: "Paris", country: "France" },
          { city: "Rome", country: "Italy" },
          { city: "Tokyo", country: "Japan" },
          { city: "Tunis", country: "Tunisia" },
        ]

        // Fetch multi-source hidden gems for each city in parallel
        const perCity = await Promise.all(
          queryCities.map((c) => getHiddenGemsForCity(c.city, c.country || undefined, 12)),
        )

        if (!active) return

        const mapped: Gem[] = perCity.flat().map((g: HiddenGemPoi) => {
          const cls = classifyLiveGem(g.title, `${g.description} ${g.extract}`)
          const sourceName = g.source || "Local Scout"
          const sourceIcon = g.sourceIcon || "✨"
          const sourceBadgeColor = g.sourceBadgeColor || "bg-amber-50 text-amber-700 border-amber-200"

          return {
            id: g.id,
            title: g.title,
            location: g.distanceKm > 0 ? `${g.distanceKm} km away` : g.city,
            city: g.city,
            category: g.category || cls.category,
            emoji: g.emoji || cls.emoji,
            tip: g.extract,
            submittedBy: g.submittedBy || sourceName,
            source: sourceName,
            sourceIcon,
            sourceBadgeColor,
            flag: sourceIcon,
            votes: g.votes || Math.floor(Math.random() * 120) + 180,
            image: g.image || GEM_FALLBACK_IMAGE,
            tags: g.tags && g.tags.length > 0 ? g.tags : [
              sourceName,
              cls.category.charAt(0).toUpperCase() + cls.category.slice(1),
              g.city,
              ...(g.distanceKm > 0 ? [`${g.distanceKm} km away`] : []),
            ],
            voted: false,
            mapsUrl: g.mapsUrl,
            distanceKm: g.distanceKm,
            live: true,
          }
        })

        // Also add any matching curated gems from CURATED_HIDDEN_GEMS that might have been offline
        const curatedExtras = CURATED_HIDDEN_GEMS.filter((c) =>
          extractedCityNames.some((city) => city.toLowerCase() === c.city.toLowerCase()),
        ).map((c) => ({
          id: c.id,
          title: c.title,
          location: c.city,
          city: c.city,
          category: c.category,
          emoji: c.emoji,
          tip: c.tip,
          submittedBy: c.submittedBy,
          source: c.source,
          sourceIcon: c.sourceIcon,
          sourceBadgeColor: c.sourceBadgeColor,
          flag: c.sourceIcon,
          votes: c.votes,
          image: c.image,
          tags: c.tags,
          voted: false,
          mapsUrl: c.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.title}, ${c.city}`)}`,
          distanceKm: 0,
          live: true,
        }))

        // Deduplicate by title
        const seenTitles = new Set<string>()
        const allCombined: Gem[] = []
        for (const g of [...curatedExtras, ...mapped]) {
          const key = `${g.city.toLowerCase()}-${g.title.toLowerCase()}`
          if (seenTitles.has(key)) continue
          seenTitles.add(key)
          allCombined.push(g)
        }

        setLiveGems(allCombined)
      } catch (err) {
        console.warn("Failed to load gems for trip destinations:", err)
      } finally {
        if (active) setLoadingGems(false)
      }
    }

    void loadTripGems()

    return () => {
      active = false
    }
  }, [])

  const toggleVote = (id: string) => {
    setLiveGems((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              voted: !g.voted,
              votes: g.voted ? g.votes - 1 : g.votes + 1,
            }
          : g,
      ),
    )
  }

  // City tabs: if inside a trip with stops, show "All Stops" + each stop button
  const cityTabs = tripCities.length > 0
    ? ["All Stops", ...tripCities]
    : ["All Cities", "Paris", "Rome", "Tokyo", "Tunis"]

  const vibeCategories = categoriesForVibe(activeVibe)

  const cityScopedGems = liveGems.filter((g) => {
    // Always scoped to the selected trip destination
    if (activeCity === "All Stops" || activeCity === "All Cities") return true
    return g.city.toLowerCase() === activeCity.toLowerCase()
  })

  // Filter to items matching the selected vibe categories
  const vibeMatchedGems = cityScopedGems.filter((g) => {
    if (!activeVibe || vibeCategories.length === 0) return true
    return vibeCategories.includes(g.category as FilterKey)
  })

  // Fallback: If no strict category matches exist for this city, show all city gems
  // so the user is never left with a blank or empty screen
  const filtered = (vibeMatchedGems.length > 0 ? vibeMatchedGems : cityScopedGems)
    .sort((a, b) => b.votes - a.votes)

  const pickVibe = (id: string) => {
    const next = activeVibe === id ? null : id
    setActiveVibe(next)
    try {
      if (next) localStorage.setItem(VIBE_STORAGE_KEY, next)
      else localStorage.removeItem(VIBE_STORAGE_KEY)
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-4">
        <button
          onClick={() => goBack("trip-overview")}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer transition-transform active:scale-95"
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
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] md:text-[26px] font-black text-navy flex items-center gap-1.5">
            Hidden Gems 💎
          </h1>
          <p className={isDesktop ? "text-slate-400 text-[12px] max-w-none" : "text-slate-400 text-[12px] truncate"}>
            {tripName
              ? `Secret spots for your trip: ${tripName}`
              : "Backpacker secrets, multi-source traveler guides"}
          </p>
        </div>
      </div>

      {/* Active Trip Banner */}
      {tripName && tripCities.length > 0 && (
        <div className="px-5 md:px-8 mb-4">
          <div
            className="rounded-2xl p-3.5 border flex items-center justify-between"
            style={{
              background: "linear-gradient(135deg, rgba(59,65,200,0.06), rgba(6,196,212,0.08))",
              borderColor: "rgba(59,65,200,0.18)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-black text-sm flex-shrink-0 shadow-xs">
                ✈️
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-brand">
                  Active Trip Destination
                </p>
                <h2 className={isDesktop ? "text-navy font-black text-sm max-w-none" : "text-navy font-black text-sm truncate"}>{tripName}</h2>
                <p className={isDesktop ? "text-slate-500 text-[11px] max-w-none" : "text-slate-500 text-[11px] truncate"}>
                  {tripCities.join(" → ")}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-navy bg-white/90 px-2.5 py-1 rounded-full border border-slate-200/80 flex-shrink-0 shadow-2xs">
              {tripCities.length} {tripCities.length === 1 ? "stop" : "stops"}
            </span>
          </div>
        </div>
      )}

      {/* Multi-source trust pill banner */}
      <div className="px-5 md:px-8 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[11px]">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 flex-shrink-0">
            Sources:
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex-shrink-0 flex items-center gap-1">
            🧭 Atlas Obscura
          </span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold flex-shrink-0 flex items-center gap-1">
            ✈️ Wikivoyage
          </span>
          <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-bold flex-shrink-0 flex items-center gap-1">
            📍 OpenStreetMap
          </span>
          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold flex-shrink-0 flex items-center gap-1">
            ✨ Local Scout
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold flex-shrink-0 flex items-center gap-1">
            🏛️ Wikipedia
          </span>
        </div>
      </div>

      {/* City filter tabs — your trip stops */}
      <div className="px-5 md:px-8 mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
          {tripCities.length > 0 ? "Trip Destinations" : "Destination"}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {cityTabs.map((city) => {
            const isSelected = activeCity === city
            return (
              <button
                key={city}
                onClick={() => {
                  setActiveCity(city)
                  if (city !== "All Stops" && city !== "All Cities") {
                    localStorage.setItem("trypo_hidden_gems_target_city", city)
                  } else {
                    localStorage.removeItem("trypo_hidden_gems_target_city")
                  }
                }}
                className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
                style={{
                  background: isSelected ? "#0D0F2E" : "white",
                  color: isSelected ? "white" : "#64748b",
                  boxShadow: isSelected ? "0 4px 12px rgba(13,15,46,0.2)" : "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                <span>{city === "All Stops" || city === "All Cities" ? "🗺️" : "📍"}</span>
                <span>{city}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* How are you feeling? — one tap filters gems for THIS trip's destinations */}
      <div className="px-5 md:px-8 mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
          How are you feeling?
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {VIBES.map((v) => {
            const isSelected = activeVibe === v.id
            return (
              <button
                key={v.id}
                onClick={() => pickVibe(v.id)}
                className="flex-shrink-0 px-3.5 py-2 rounded-2xl text-[12px] font-bold transition-all cursor-pointer flex items-center gap-1.5 border"
                style={{
                  background: isSelected ? "#0D0F2E" : "white",
                  color: isSelected ? "white" : "#0D0F2E",
                  borderColor: isSelected ? "#0D0F2E" : "rgba(59,65,200,0.15)",
                  boxShadow: isSelected
                    ? "0 4px 12px rgba(13,15,46,0.25)"
                    : "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                <span className="text-[15px]">{v.emoji}</span>
                <span>{v.label}</span>
              </button>
            )
          })}
        </div>
        {activeVibe && (
          <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 bg-brand/5 border border-brand/15">
            <p className={isDesktop ? "text-[11px] text-navy font-semibold" : "text-[11px] text-navy font-semibold truncate"}>
              {VIBES.find((v) => v.id === activeVibe)?.emoji} Showing{" "}
              {VIBES.find((v) => v.id === activeVibe)?.label.toLowerCase()} gems
              {tripName ? ` for ${tripName}` : ""} · {filtered.length} spots
            </p>
            <button
              onClick={() => pickVibe(activeVibe)}
              className="ml-2 text-[11px] font-black text-brand flex-shrink-0 cursor-pointer"
            >
              Clear ✕
            </button>
          </div>
        )}
      </div>

      {/* Gems List */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-24" : "px-5 flex flex-col gap-3.5 pb-24"}>
        {loadingGems && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-[22px] overflow-hidden animate-pulse"
                style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
              >
                <div className={isDesktop ? "h-[200px] bg-slate-100" : "h-[140px] bg-slate-100"} />
                <div className="p-4">
                  <div className="h-3.5 rounded-full bg-slate-100 mb-2 w-2/3" />
                  <div className="h-2.5 rounded-full bg-slate-50 w-full mb-1" />
                  <div className="h-2.5 rounded-full bg-slate-50 w-4/5" />
                </div>
              </div>
            ))}
          </>
        )}

        {!loadingGems && filtered.length === 0 && (
          <div className="py-12 bg-white rounded-3xl p-6 text-center border border-dashed border-slate-200">
            <span className="text-4xl mb-3 block">💎</span>
            <h3 className="text-navy font-black text-[16px] mb-1">No hidden gems found</h3>
            <p className="text-slate-400 text-[12px] mb-4">
              {tripCities.length > 0
                ? `No spots match "${activeCity}"${activeVibe ? ` for vibe "${VIBES.find((v) => v.id === activeVibe)?.label}"` : ""}. Try clearing the vibe or choosing another stop.`
                : "Try another city or clear the vibe filter."}
            </p>
            <button
              onClick={() => {
                setActiveCity("All Stops")
                setActiveVibe(null)
                try {
                  localStorage.removeItem(VIBE_STORAGE_KEY)
                } catch {
                  /* ignore */
                }
              }}
              className="px-4 py-2 rounded-xl bg-brand text-white text-[11px] font-bold"
            >
              Reset Filters ✨
            </button>
          </div>
        )}

        {filtered.map((gem) => (
          <div
            key={gem.id}
            className="bg-white rounded-[22px] overflow-hidden group transition-transform duration-200"
            style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
          >
            {/* Image & Badges */}
            <div className={isDesktop ? "relative h-[200px] bg-slate-100" : "relative h-[140px] bg-slate-100"}>
              <img
                src={gem.image}
                alt={gem.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = GEM_FALLBACK_IMAGE
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(13,15,46,0.85) 0%, rgba(13,15,46,0.2) 50%, transparent 100%)",
                }}
              />

              {/* Emoji badge */}
              <div
                className="absolute top-3 left-3 w-8 h-8 rounded-xl flex items-center justify-center text-lg shadow-sm"
                style={{
                  background: "rgba(0,0,0,0.45)",
                  backdropFilter: "blur(8px)",
                }}
              >
                {gem.emoji}
              </div>

              {/* Source badge on card */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black backdrop-blur-md border shadow-xs flex items-center gap-1 ${
                    gem.sourceBadgeColor || "bg-white/90 text-navy border-white/50"
                  }`}
                >
                  <span>{gem.sourceIcon || "💎"}</span>
                  <span>{gem.source || gem.submittedBy}</span>
                </span>
              </div>

              {/* Title & location in bottom overlay */}
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-white font-black text-[15px] leading-snug drop-shadow-xs">
                  {gem.title}
                </p>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-white/80 text-[11px] truncate flex items-center gap-1">
                    <span>📍</span>
                    <span className="font-semibold">{gem.city}</span>
                    {gem.distanceKm && gem.distanceKm > 0 ? (
                      <span className="text-white/60">· {gem.distanceKm} km away</span>
                    ) : null}
                  </p>
                  {gem.mapsUrl && (
                    <a
                      href={gem.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-bold text-white flex-shrink-0 hover:scale-105 transition-transform"
                      style={{
                        background: "rgba(255,255,255,0.25)",
                        backdropFilter: "blur(8px)",
                        padding: "2px 9px",
                        borderRadius: "999px",
                        border: "1px solid rgba(255,255,255,0.4)",
                      }}
                    >
                      Map ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-4">
              {/* Tags */}
              <div className="flex gap-1.5 flex-wrap mb-2.5">
                {gem.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: "rgba(59,65,200,0.07)",
                      color: "#3B41C8",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>

              {/* Tip / Description */}
              <p
                className="text-slate-600 text-[12px] leading-relaxed mb-2.5"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: expanded === gem.id ? 99 : 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                "{gem.tip}"
              </p>
              {gem.tip.length > 110 && (
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === gem.id ? null : gem.id)}
                  className="text-[11px] font-bold mb-3 cursor-pointer hover:underline"
                  style={{ color: "#3B41C8" }}
                >
                  {expanded === gem.id ? "Show less ↑" : "Read full insider tip ↓"}
                </button>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{gem.sourceIcon || "💎"}</span>
                  <span className="text-slate-400 text-[11px]">
                    via{" "}
                    <span className="font-bold text-navy">
                      {gem.submittedBy}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleVote(gem.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all cursor-pointer active:scale-95"
                  style={{
                    background: gem.voted
                      ? "rgba(255,99,71,0.12)"
                      : "rgba(59,65,200,0.07)",
                    color: gem.voted ? "#FF6347" : "#3B41C8",
                  }}
                >
                  <span className="text-[13px]">{gem.voted ? "❤️" : "🤍"}</span>
                  <span className="text-[12px] font-black">{gem.votes}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
