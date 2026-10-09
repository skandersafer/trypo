import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { getActiveTripId, getMyTrips, getTripDetails, addItineraryItem } from "../lib/trips"
import { getHiddenGemsForCity, type HiddenGemPoi } from "../lib/travelApi"
import { CURATED_HIDDEN_GEMS } from "../lib/hiddenGemsData"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type VibeId = "foodie" | "adventurous" | "chill" | "cultural" | "social" | "nature"

type Vibe = {
  id: VibeId
  emoji: string
  label: string
  sub: string
  color: string
  gradient: string
  categories: ("food" | "bar" | "culture" | "nature" | "activity")[]
}

const VIBES: Vibe[] = [
  {
    id: "foodie",
    emoji: "🍜",
    label: "Foodie",
    sub: "Eat everything local",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
    categories: ["food", "bar"],
  },
  {
    id: "adventurous",
    emoji: "🧗",
    label: "Adventurous",
    sub: "Wild thrills & heights",
    color: "#FF6347",
    gradient: "linear-gradient(135deg, #FF6347, #ff9a3c)",
    categories: ["activity", "nature"],
  },
  {
    id: "chill",
    emoji: "🌊",
    label: "Chill",
    sub: "Slow mornings & views",
    color: "#06C4D4",
    gradient: "linear-gradient(135deg, #06C4D4, #0891b2)",
    categories: ["nature", "bar"],
  },
  {
    id: "cultural",
    emoji: "🛕",
    label: "Cultural",
    sub: "History, art & architecture",
    color: "#7C3AED",
    gradient: "linear-gradient(135deg, #7C3AED, #5b21b6)",
    categories: ["culture"],
  },
  {
    id: "social",
    emoji: "🎉",
    label: "Social",
    sub: "Meet people & party",
    color: "#3B41C8",
    gradient: "linear-gradient(135deg, #3B41C8, #06C4D4)",
    categories: ["bar", "activity"],
  },
  {
    id: "nature",
    emoji: "🌿",
    label: "Nature",
    sub: "Parks, coast & quiet",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #10b981, #047857)",
    categories: ["nature"],
  },
]

interface MatchedPlace {
  id: string
  title: string
  city: string
  country?: string
  category: "food" | "bar" | "culture" | "nature" | "activity"
  emoji: string
  tip: string
  whyVibe: string
  source: string
  sourceIcon: string
  sourceBadgeColor: string
  image: string
  matchScore: number
  mapsUrl: string
  tags: string[]
}

const PLACE_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop&auto=format"

function classifyLivePlace(title: string, text: string): { category: "food" | "bar" | "culture" | "nature" | "activity"; emoji: string } {
  const hay = `${title} ${text}`.toLowerCase()
  const has = (...words: string[]) => words.some((w) => hay.includes(w))
  if (
    has(
      "restaurant", "cuisine", "dish", "bakery", "cafe", "food", "market hall", "street food",
      "yakitori", "brik", "tapas", "trattoria", "osteria", "pizzeria", "gelato", "bistro",
      "ramen", "coffee", "pastry", "breakfast", "dining", "patisserie", "taqueria", "pasta",
      "eatery", "noodle", "diner", "gastronomy", "gourmet", "tavern", "wine & dine", "bouillabaisse",
      "panisse", "waffle", "stroopwafel", "herring"
    )
  ) {
    return { category: "food", emoji: "🍜" }
  }
  if (
    has(
      "bar", "pub", "brewery", "nightlife", "cocktail", "wine bar", "speakeasy", "lounge",
      "spirits", "rooftop", "beer", "club", "disco", "drinks", "jazz bar", "taproom", "pastis"
    )
  ) {
    return { category: "bar", emoji: "🍸" }
  }
  if (
    has(
      "park", "garden", "beach", "cave", "waterfall", "nature", "mountain", "lake", "island",
      "cove", "forest", "spring", "ravine", "viewpoint", "botanical", "cliff", "river",
      "trail", "reserve", "hills", "valley", "panoramic", "lookout", "sanctuary", "promenade",
      "calanque", "fjord"
    )
  ) {
    return { category: "nature", emoji: "🌿" }
  }
  if (
    has(
      "museum", "mosque", "church", "temple", "castle", "historic", "monument", "medina",
      "old town", "heritage", "palace", "fort", "shrine", "archaeolog", "gallery", "theatre",
      "theater", "library", "ruins", "basilica", "cathedral", "abbey", "cloister", "piazza",
      "square", "fountain", "ancient", "monastery", "tower", "bridge", "charité"
    )
  ) {
    return { category: "culture", emoji: "🛕" }
  }
  return { category: "activity", emoji: "🎯" }
}

function generateWhyVibe(vibeId: VibeId, category: string, title: string, city: string): string {
  switch (vibeId) {
    case "foodie":
      return `Authentic local culinary spot in ${city} away from tourist traps.`
    case "adventurous":
      return `Thrilling offbeat experience and unique exploration in ${city}.`
    case "chill":
      return `Tranquil, peaceful atmosphere for slow mornings and quiet views in ${city}.`
    case "cultural":
      return `Deep historical heritage and centuries of artistic intrigue in ${city}.`
    case "social":
      return `Buzzy local gathering point, great drinks, and vibrant nightlife in ${city}.`
    case "nature":
      return `Lush green escape with scenic panoramic nature right in ${city}.`
    default:
      return `Perfect match for your trip mood in ${city}.`
  }
}

export default function VibeMatchScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [selectedVibe, setSelectedVibe] = useState<Vibe>(() => {
    try {
      const stored = localStorage.getItem("trypo_vibe_match_selected_vibe") || localStorage.getItem("trypo_hidden_gems_vibe")
      const found = VIBES.find((v) => v.id === stored)
      return found || VIBES[0] // default to Foodie
    } catch {
      return VIBES[0]
    }
  })

  const [activeTripId, setActiveTripIdState] = useState<string | null>(null)
  const [tripName, setTripName] = useState<string | null>(null)
  const [tripCities, setTripCities] = useState<string[]>([])
  const [selectedCity, setSelectedCity] = useState<string>("")
  const [loadingTrip, setLoadingTrip] = useState(true)

  const [matches, setMatches] = useState<MatchedPlace[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Date-picker modal state for "Add to Trip"
  const [datePlace, setDatePlace] = useState<MatchedPlace | null>(null)
  const [visitDate, setVisitDate] = useState("")
  const [tripStart, setTripStart] = useState("")
  const [tripEnd, setTripEnd] = useState("")
  const [dateSaving, setDateSaving] = useState(false)

  // 1. Load active trip & extract destination cities
  useEffect(() => {
    let active = true
    async function loadTrip() {
      try {
        const storedTripId =
          typeof window !== "undefined" ? localStorage.getItem("trypo_active_trip_id") : null
        const activeId = storedTripId || getActiveTripId()
        setActiveTripIdState(activeId)

        let tripData = activeId ? await getTripDetails(activeId) : await getTripDetails()
        if (!tripData) {
          const list = await getMyTrips()
          tripData = (activeId ? list.find((t) => t.id === activeId) : null) || list[0] || null
        }

        const seen = new Set<string>()
        const cities: string[] = []

        if (tripData) {
          // A. trip_destinations
          const rawDestinations: any[] = [...(tripData?.trip_destinations ?? [])].sort(
            (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
          )
          for (const d of rawDestinations) {
            const c = String(d?.city || "").trim()
            if (c && !seen.has(c.toLowerCase())) {
              seen.add(c.toLowerCase())
              cities.push(c)
            }
          }

          // B. destinations array
          if (cities.length === 0 && Array.isArray((tripData as any)?.destinations)) {
            for (const d of (tripData as any).destinations) {
              const c = String(typeof d === "string" ? d : d?.city || "").trim()
              if (c && !seen.has(c.toLowerCase())) {
                seen.add(c.toLowerCase())
                cities.push(c)
              }
            }
          }

          // C. title fallback e.g. "Trip to Marseille" or "Amsterdam & Marseille"
          if (cities.length === 0 && tripData?.title) {
            const clean = tripData.title.replace(/^(Trip to|Voyage à|Voyage a|Trip)\s+/i, "")
            const parts = clean.split(/[,&→·/\-]+/).map((s) => s.trim()).filter(Boolean)
            for (const p of parts) {
              if (p.length > 2 && !seen.has(p.toLowerCase())) {
                seen.add(p.toLowerCase())
                cities.push(p)
              }
            }
          }
        }

        // D. Fallback to localStorage destinations cache if set by TripOverviewScreen
        if (typeof window !== "undefined") {
          try {
            const cachedDest = localStorage.getItem("trypo_vibe_match_destinations")
            if (cachedDest) {
              const parsed = JSON.parse(cachedDest)
              if (Array.isArray(parsed)) {
                for (const c of parsed) {
                  const sc = String(c).trim()
                  if (sc && !seen.has(sc.toLowerCase())) {
                    seen.add(sc.toLowerCase())
                    cities.push(sc)
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
        }

        // Check target city passed from TripOverviewScreen
        const targetCity =
          typeof window !== "undefined"
            ? localStorage.getItem("trypo_vibe_match_target_city")
            : null

        if (!active) return

        setTripCities(cities)
        setTripName(tripData?.title || (cities.length > 0 ? cities.join(" · ") : null))
        setTripStart((tripData?.start_date || "").slice(0, 10))
        setTripEnd((tripData?.end_date || "").slice(0, 10))

        // Determine active city: prioritize targetCity, then first trip stop
        if (targetCity) {
          const matched = cities.find((c) => c.toLowerCase() === targetCity.toLowerCase())
          if (matched) {
            setSelectedCity(matched)
          } else {
            setSelectedCity(targetCity)
            if (!cities.some((c) => c.toLowerCase() === targetCity.toLowerCase())) {
              setTripCities([targetCity, ...cities])
            }
          }
        } else if (cities.length > 0) {
          setSelectedCity(cities[0])
        } else {
          setSelectedCity("Marseille")
        }
      } catch (err) {
        console.warn("Failed to load trip for VibeMatchScreen:", err)
      } finally {
        if (active) setLoadingTrip(false)
      }
    }

    void loadTrip()
    return () => {
      active = false
    }
  }, [])

  // 2. Load matching vibe places whenever selectedCity or selectedVibe changes
  useEffect(() => {
    let active = true
    if (!selectedCity) return

    setLoadingMatches(true)

    async function loadMatches() {
      try {
        const normCity = selectedCity.trim().toLowerCase()

        // A. Curated matches from CURATED_HIDDEN_GEMS
        const curatedInCity = CURATED_HIDDEN_GEMS.filter(
          (g) =>
            g.city.toLowerCase() === normCity ||
            normCity.includes(g.city.toLowerCase()) ||
            g.city.toLowerCase().includes(normCity),
        )

        // B. Fetch live spots via getHiddenGemsForCity
        const livePois: HiddenGemPoi[] = await getHiddenGemsForCity(selectedCity, undefined, 14)

        if (!active) return

        const collected: MatchedPlace[] = []
        const seenTitles = new Set<string>()

        // Curated entries
        for (const c of curatedInCity) {
          const cleanKey = c.title.trim().toLowerCase()
          if (seenTitles.has(cleanKey)) continue
          seenTitles.add(cleanKey)

          collected.push({
            id: c.id,
            title: c.title,
            city: c.city,
            country: c.country,
            category: c.category,
            emoji: c.emoji,
            tip: c.tip,
            whyVibe: generateWhyVibe(selectedVibe.id, c.category, c.title, c.city),
            source: c.source,
            sourceIcon: c.sourceIcon,
            sourceBadgeColor: c.sourceBadgeColor,
            image: c.image || PLACE_FALLBACK_IMAGE,
            matchScore: 98,
            mapsUrl:
              c.mapsUrl ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.title}, ${c.city}`)}`,
            tags: c.tags,
          })
        }

        // Live entries
        for (const p of livePois) {
          const cleanKey = p.title.trim().toLowerCase()
          if (seenTitles.has(cleanKey)) continue
          seenTitles.add(cleanKey)

          const cls = classifyLivePlace(p.title, `${p.description} ${p.extract}`)
          const sourceName = p.source || "Local Scout"
          const sourceIcon = p.sourceIcon || "✨"
          const sourceBadgeColor =
            p.sourceBadgeColor || "bg-amber-50 text-amber-700 border-amber-200"

          collected.push({
            id: p.id,
            title: p.title,
            city: p.city,
            category: (p.category as any) || cls.category,
            emoji: p.emoji || cls.emoji,
            tip: p.extract || p.description,
            whyVibe: generateWhyVibe(selectedVibe.id, (p.category as any) || cls.category, p.title, p.city),
            source: sourceName,
            sourceIcon,
            sourceBadgeColor,
            image: p.image || PLACE_FALLBACK_IMAGE,
            matchScore: 94,
            mapsUrl:
              p.mapsUrl ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.title}, ${p.city}`)}`,
            tags: p.tags || [sourceName, cls.category, p.city],
          })
        }

        // Score and partition by vibe match
        const exactMatches: MatchedPlace[] = []
        const secondaryMatches: MatchedPlace[] = []

        const vibeCatSet = new Set(selectedVibe.categories)

        for (const place of collected) {
          if (vibeCatSet.has(place.category)) {
            exactMatches.push(place)
          } else {
            secondaryMatches.push(place)
          }
        }

        // Assign high match percentages
        const scores = [98, 96, 94, 91, 89, 87, 85, 82, 80]
        const finalResults = [...exactMatches, ...secondaryMatches].map((p, idx) => ({
          ...p,
          matchScore: scores[Math.min(idx, scores.length - 1)],
          whyVibe: generateWhyVibe(selectedVibe.id, p.category, p.title, selectedCity),
        }))

        setMatches(finalResults)
      } catch (err) {
        console.warn("Failed to load vibe matches for city:", err)
      } finally {
        if (active) setLoadingMatches(false)
      }
    }

    void loadMatches()
    return () => {
      active = false
    }
  }, [selectedCity, selectedVibe])

  // Handle switching destination stop
  const handleSelectCity = (city: string) => {
    setSelectedCity(city)
    try {
      localStorage.setItem("trypo_vibe_match_target_city", city)
    } catch {
      /* ignore */
    }
  }

  // Handle switching vibe
  const handleSelectVibe = (vibe: Vibe) => {
    setSelectedVibe(vibe)
    try {
      localStorage.setItem("trypo_vibe_match_selected_vibe", vibe.id)
    } catch {
      /* ignore */
    }
  }

  // Open the date picker, then confirm to add the place to the itinerary
  // on the chosen day.
  const openDatePicker = (place: MatchedPlace) => {
    setDatePlace(place)
    setVisitDate(tripStart || new Date().toISOString().slice(0, 10))
  }

  // Handle adding a matched place to trip itinerary
  const handleAddToItinerary = async (place: MatchedPlace, day?: string) => {
    try {
      const tripId = activeTripId || getActiveTripId()
      if (tripId) {
        const startsAt = day ? new Date(`${day}T12:00:00`).toISOString() : null
        await addItineraryItem({
          tripId,
          trip_id: tripId,
          title: `${place.emoji} ${place.title}`,
          details: place.tip || place.whyVibe,
          item_type: "activity",
          location_name: `${place.title}, ${place.city}`,
          starts_at: startsAt,
          ends_at: startsAt,
          cost: 0,
        })
      }
      setAddedIds((prev) => new Set([...prev, place.id]))
      setToastMessage(`Added "${place.title}" to your itinerary! ✨`)
      setTimeout(() => setToastMessage(null), 3200)
    } catch {
      setToastMessage(`Saved to your trip itinerary!`)
      setTimeout(() => setToastMessage(null), 3200)
    }
  }

  const confirmDateAdd = async () => {
    if (!datePlace || !visitDate) return
    setDateSaving(true)
    try {
      await handleAddToItinerary(datePlace, visitDate)
      setDatePlace(null)
    } finally {
      setDateSaving(false)
    }
  }

  return (
    <div
      className="min-h-full pb-16"
      style={{
        background: "linear-gradient(175deg, #090B24 0%, #0E1545 40%, #08102B 100%)",
      }}
    >
      <div className="pt-12" />

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-14 left-4 right-4 z-50 animate-bounce">
          <div className="bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between border border-emerald-400/40">
            <span>{toastMessage}</span>
            <span className="text-emerald-200 text-xs">✓</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-4">
        <button
          onClick={() => goBack("trip-overview")}
          className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-black text-[20px] md:text-[26px] flex items-center gap-2">
            <span>Vibe Match</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-amber-300 font-bold">
              ✨
            </span>
          </h1>
          <p className={isDesktop ? "text-white/50 text-[12px] max-w-none" : "text-white/50 text-[12px] truncate"}>
            {tripName ? `Matching picks for: ${tripName}` : "Match your mood to your destination"}
          </p>
        </div>
      </div>

      {/* Destination Stop Selector */}
      <div className="px-5 md:px-8 mb-5">
        <div
          className="rounded-2xl p-3.5 border backdrop-blur-md"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            borderColor: "rgba(255, 255, 255, 0.12)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1">
              <span>📍</span>
              <span>Trip Destination</span>
            </span>
            <span className="text-[10px] text-white/40">
              {tripCities.length > 1 ? "Tap to switch destination stop" : "Selected stop"}
            </span>
          </div>

          {/* Destination Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {tripCities.length > 0 ? (
              tripCities.map((city) => {
                const isSelected = selectedCity.toLowerCase() === city.toLowerCase()
                return (
                  <button
                    key={city}
                    onClick={() => handleSelectCity(city)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                    style={{
                      background: isSelected
                        ? "linear-gradient(135deg, #06C4D4, #3B41C8)"
                        : "rgba(255, 255, 255, 0.08)",
                      color: isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.7)",
                      border: isSelected
                        ? "1px solid rgba(255, 255, 255, 0.4)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      boxShadow: isSelected ? "0 4px 15px rgba(6, 196, 212, 0.35)" : "none",
                    }}
                  >
                    <span>📍</span>
                    <span>{city}</span>
                    {isSelected && <span className="text-[10px] opacity-80">✓</span>}
                  </button>
                )
              })
            ) : (
              <div className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white/80 bg-white/10">
                📍 {selectedCity}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vibe Selection Section */}
      <div className="px-5 md:px-8 mb-6">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-white font-black text-[14px]">
            Choose Your Vibe
          </p>
          <span className="text-[11px] text-white/40">
            Tap to change vibe
          </span>
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5">
          {VIBES.map((vibe) => {
            const isSelected = selectedVibe.id === vibe.id
            return (
              <button
                key={vibe.id}
                onClick={() => handleSelectVibe(vibe)}
                className="rounded-2xl p-2.5 flex flex-col items-center text-center cursor-pointer transition-all relative overflow-hidden"
                style={{
                  background: isSelected
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(255, 255, 255, 0.05)",
                  border: isSelected
                    ? `1.5px solid ${vibe.color}`
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: isSelected
                    ? `0 0 20px ${vibe.color}40, inset 0 0 12px ${vibe.color}20`
                    : "none",
                  transform: isSelected ? "scale(1.03)" : "scale(1)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-1.5 transition-transform"
                  style={{
                    background: isSelected ? vibe.gradient : `${vibe.color}25`,
                    boxShadow: isSelected ? `0 2px 10px ${vibe.color}50` : "none",
                  }}
                >
                  {vibe.emoji}
                </div>
                <p className="text-white font-bold text-[12px] leading-tight">
                  {vibe.label}
                </p>
                <p className="text-white/40 text-[9px] mt-0.5 line-clamp-1">
                  {vibe.sub}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Matched Places Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-3">
        <div>
          <h2 className="text-white font-black text-[16px] flex items-center gap-2">
            <span>{selectedVibe.emoji}</span>
            <span>{selectedVibe.label} in {selectedCity}</span>
          </h2>
          <p className="text-white/50 text-[11px]">
            {loadingMatches
              ? `Curating ${selectedVibe.label.toLowerCase()} spots in ${selectedCity}…`
              : `${matches.length} matched places in ${selectedCity}`}
          </p>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loadingMatches && (
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8" : "px-5 space-y-4"}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="rounded-3xl p-4 animate-pulse"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="w-full h-40 bg-white/10 rounded-2xl mb-3" />
              <div className="h-5 bg-white/20 rounded w-2/3 mb-2" />
              <div className="h-3 bg-white/10 rounded w-full mb-1" />
              <div className="h-3 bg-white/10 rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {/* Matched Cards */}
      {!loadingMatches && matches.length > 0 && (
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8" : "px-5 space-y-4"}>
          {matches.map((place) => {
            const isAdded = addedIds.has(place.id)
            return (
              <div
                key={place.id}
                className="rounded-3xl overflow-hidden backdrop-blur-md transition-transform"
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                }}
              >
                {/* Photo & Top Badges */}
                <div className={isDesktop ? "relative h-56 w-full bg-slate-800 overflow-hidden" : "relative h-44 w-full bg-slate-800 overflow-hidden"}>
                  <img
                    src={place.image}
                    alt={place.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = PLACE_FALLBACK_IMAGE
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0E1545] via-transparent to-black/40" />

                  {/* Vibe Match Score Pill */}
                  <div
                    className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-black text-white shadow-lg flex items-center gap-1.5"
                    style={{
                      background: selectedVibe.gradient,
                      boxShadow: `0 2px 12px ${selectedVibe.color}60`,
                    }}
                  >
                    <span>{selectedVibe.emoji}</span>
                    <span>{place.matchScore}% Match</span>
                  </div>

                  {/* Source Badge */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-black/60 backdrop-blur-md text-white/90 border border-white/20 flex items-center gap-1">
                    <span>{place.sourceIcon}</span>
                    <span>{place.source}</span>
                  </div>

                  {/* Bottom Image Overlay Details */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="text-white/70 text-[11px] font-bold flex items-center gap-1">
                        <span>📍</span>
                        <span>{place.city}</span>
                      </p>
                      <h3 className={isDesktop ? "text-white font-black text-[17px] leading-tight drop-shadow-md" : "text-white font-black text-[17px] leading-tight truncate drop-shadow-md"}>
                        {place.title}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  {/* Why this vibe fits */}
                  <div
                    className="rounded-xl p-2.5 mb-3 flex items-start gap-2.5"
                    style={{
                      background: `${selectedVibe.color}15`,
                      border: `1px solid ${selectedVibe.color}30`,
                    }}
                  >
                    <span className="text-sm mt-0.5">{selectedVibe.emoji}</span>
                    <p className="text-[11px] font-semibold text-white/90 leading-relaxed">
                      <span className="font-bold text-white">Why it matches: </span>
                      {place.whyVibe}
                    </p>
                  </div>

                  {/* Tip / Description */}
                  <p className="text-white/70 text-[12px] leading-relaxed mb-3 line-clamp-3">
                    {place.tip}
                  </p>

                  {/* Tags */}
                  {place.tags && place.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {place.tags.slice(0, 3).map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium text-white/60 bg-white/5 border border-white/10"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                    <a
                      href={place.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 rounded-xl text-xs font-bold text-white/80 bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      <span>📍 Google Maps</span>
                      <span className="text-[10px]">↗</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => openDatePicker(place)}
                      disabled={isAdded}
                      className="py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                      style={{
                        background: isAdded
                          ? "rgba(16, 185, 129, 0.25)"
                          : selectedVibe.gradient,
                        color: isAdded ? "#10b981" : "#ffffff",
                        border: isAdded
                          ? "1px solid #10b981"
                          : "none",
                        boxShadow: isAdded
                          ? "none"
                          : `0 4px 15px ${selectedVibe.color}40`,
                      }}
                    >
                      <span>{isAdded ? "✓ Added" : "+ Add to Trip"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Fallback if 0 spots found */}
      {!loadingMatches && matches.length === 0 && (
        <div className="px-5 md:px-8 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl mx-auto mb-3">
            {selectedVibe.emoji}
          </div>
          <p className="text-white font-bold text-[16px] mb-1">
            Looking for {selectedVibe.label.toLowerCase()} spots in {selectedCity}…
          </p>
          <p className="text-white/50 text-[12px] max-w-xs mx-auto mb-4">
            Try switching to another vibe or select another destination stop above.
          </p>
        </div>
      )}

      {/* Footer Info */}
      <div className="px-5 md:px-8 mt-6 text-center">
        <p className="text-white/30 text-[11px]">
          ✨ Tap another vibe or change your destination stop above to explore different moods for your trip.
        </p>
      </div>

      {/* Pick-a-day modal for Add to Trip */}
      {datePlace && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
          style={{ backdropFilter: "blur(6px)" }}
          onClick={() => setDatePlace(null)}
        >
          <div
            className="w-full max-w-[360px] rounded-[28px] p-5"
            style={{ background: "#0e1545", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-black text-[16px]">Add to trip 📅</h3>
              <button onClick={() => setDatePlace(null)} className="text-white/40 text-2xl leading-none">
                ×
              </button>
            </div>
            <p className="text-white/50 text-[12px] mb-4">
              {datePlace.emoji} {datePlace.title} · {datePlace.city}
            </p>
            <label className="text-white/40 text-[11px] font-bold uppercase tracking-widest mb-2 block">
              Which day?
            </label>
            <input
              type="date"
              value={visitDate}
              min={tripStart || undefined}
              max={tripEnd || undefined}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full px-3.5 py-3 rounded-xl text-[14px] font-bold text-white outline-none"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", colorScheme: "dark" }}
            />
            {tripStart && tripEnd && (
              <p className="text-white/30 text-[11px] mt-2">
                Trip: {tripStart} → {tripEnd}
              </p>
            )}
            <button
              disabled={dateSaving || !visitDate}
              onClick={confirmDateAdd}
              className="w-full py-3.5 rounded-2xl text-white font-black text-[14px] mt-4 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
            >
              {dateSaving ? "Adding…" : `Add on ${visitDate || "…"} ✨`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
