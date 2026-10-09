import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { searchHotels } from "../lib/travelApi"
import { getTripDetails, getSavedPlaces, toggleSavedPlace } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  openBooking?: (type: "flight" | "stay" | "transport" | "activity") => void
}

type Stay = {
  name: string
  rating: number
  location: string
  priceNum: number
  price: string
  category: "hostel" | "hotel" | "private"
  tags: string[]
  image: string
  vibe: string
  distance: string
}

const defaultStays: Stay[] = [
  {
    name: "Le Jardin Tunis",
    rating: 4.8,
    location: "Medina",
    priceNum: 28,
    price: "$28",
    category: "hostel",
    tags: ["🔥 Local vibe", "🧭 Great location", "☕ Café"],
    image:
      "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=500&h=350&fit=crop&auto=format",
    vibe: "Boutique stay",
    distance: "0.4 km",
  },
  {
    name: "Dar Sousse Maison",
    rating: 4.6,
    location: "Corniche",
    priceNum: 32,
    price: "$32",
    category: "hostel",
    tags: ["🌊 Sea view", "🛋 Lounge", "🚶 Walkable"],
    image:
      "https://images.unsplash.com/photo-1601224335112-b74158e231ec?w=500&h=350&fit=crop&auto=format",
    vibe: "Coastal hostel",
    distance: "1.1 km",
  },
  {
    name: "Hotel El Mouradia",
    rating: 4.5,
    location: "Tunis Center",
    priceNum: 92,
    price: "$92",
    category: "hotel",
    tags: ["🏊 Pool", "🌆 City view", "🍳 Breakfast"],
    image:
      "https://images.unsplash.com/photo-1778394859799-67341e3ee958?w=500&h=350&fit=crop&auto=format",
    vibe: "4-Star Hotel",
    distance: "2.0 km",
  },
  {
    name: "Riad Sfax Bleu",
    rating: 4.7,
    location: "Old Town",
    priceNum: 26,
    price: "$26",
    category: "hostel",
    tags: ["🌿 Calm", "🎵 Live music", "🚲 Bike friendly"],
    image:
      "https://images.unsplash.com/photo-1576475706812-822620fc23ba?w=500&h=350&fit=crop&auto=format",
    vibe: "Historic stay",
    distance: "3.2 km",
  },
  {
    name: "Private Suite Sousse",
    rating: 4.9,
    location: "Hammam Sousse",
    priceNum: 41,
    price: "$41",
    category: "private",
    tags: ["🏠 Private", "🧹 Clean", "🌐 Fast WiFi"],
    image:
      "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=500&h=350&fit=crop&auto=format",
    vibe: "Private apartment",
    distance: "4.1 km",
  },
  {
    name: "Tunis Backpack House",
    rating: 4.5,
    location: "Bab El Khadra",
    priceNum: 19,
    price: "$19",
    category: "hostel",
    tags: ["🔥 Budget", "🌙 Social", "☕ Terrace"],
    image:
      "https://images.unsplash.com/photo-1549872178-96db16a53ca8?w=500&h=350&fit=crop&auto=format",
    vibe: "Budget stay",
    distance: "1.9 km",
  },
]

type FilterKey = "all" | "hostel" | "hotel" | "private" | "budget" | "top"
type SortKey = "recommended" | "price" | "rating"

const filters: { label: string; key: FilterKey }[] = [
  { label: "All", key: "all" },
  { label: "🏨 Hostel", key: "hostel" },
  { label: "🏩 Hotel", key: "hotel" },
  { label: "🏠 Private", key: "private" },
  { label: "💸 Budget", key: "budget" },
  { label: "⭐ Top Rated", key: "top" },
]

export default function FindStayScreen({ navigate, openBooking, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all")
  const [sort, setSort] = useState<SortKey>("recommended")
  const [search, setSearch] = useState("")
  const [routeCities, setRouteCities] = useState<string[]>([])
  const [selectedCity, setSelectedCity] = useState("")
  const [stays, setStays] = useState<Stay[]>(defaultStays)
  const [loading, setLoading] = useState(true)
  const [savedStayNames, setSavedStayNames] = useState<Set<string>>(new Set())

  // Sync saved stays from persistent store
  useEffect(() => {
    let active = true
    const syncSaved = async () => {
      try {
        const places = await getSavedPlaces()
        if (!active) return
        const names = new Set(
          (places || [])
            .filter((p: any) => {
              const c = String(p.category || "").toLowerCase()
              return c.includes("stay") || c.includes("hotel") || c.includes("hostel")
            })
            .map((p: any) => (p.name || p.title || "").trim().toLowerCase()),
        )
        setSavedStayNames(names)
      } catch {
        /* ignore */
      }
    }
    void syncSaved()
    window.addEventListener("trypo:db_changed", syncSaved)
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", syncSaved)
    }
  }, [])

  const activeCity = search.trim() || selectedCity || routeCities[0] || "Tunis"

  const handleToggleSaveStay = async (e: React.MouseEvent, stay: Stay) => {
    e.stopPropagation()
    const norm = stay.name.trim().toLowerCase()
    setSavedStayNames((prev) => {
      const next = new Set(prev)
      if (next.has(norm)) next.delete(norm)
      else next.add(norm)
      return next
    })

    try {
      await toggleSavedPlace({
        name: stay.name,
        address: stay.location,
        city: activeCity,
        country: "Tunisia",
        category: "stays",
        rating: stay.rating,
        image_url: stay.image,
        notes: `${stay.price} · ${stay.vibe}`,
      })
    } catch (err) {
      console.warn("Failed to toggle stay saved state:", err)
    }
  }

  // Derive the destination chips from the active trip's route so the screen
  // reflects the user's real plan instead of hardcoded demo cities.
  useEffect(() => {
    let active = true
    getTripDetails()
      .then((trip) => {
        if (!active) return
        const cities = (trip?.trip_destinations || [])
          .slice()
          .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
          .map((d: any) => d.city)
          .filter((c: string) => c && c.trim())
        const uniqueCities = [...new Set(cities)] as string[]
        setRouteCities(uniqueCities)
        if (uniqueCities.length > 0) setSelectedCity(uniqueCities[0])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadStays() {
      try {
        setLoading(true)
        const offers = await searchHotels({ city: activeCity, maxResults: 6 })
        if (!active) return

        if (offers.length > 0) {
          const mapped = offers.map((offer) => ({
            name: offer.name,
            rating: offer.rating ?? 4.6,
            location: offer.city,
            priceNum: offer.price,
            price: `$${offer.price}`,
            category:
              offer.name.toLowerCase().includes("suite")
                ? "private"
                : offer.price <= 70
                  ? "hostel"
                  : "hotel",
            tags: [
              offer.distanceKm ? `📍 ${offer.distanceKm} km away` : "🌍 Great location",
              "⭐ Travel-ready",
              offer.rating ? `🏆 ${offer.rating.toFixed(1)}` : "✨ Popular",
            ],
            image:
              offer.image ??
              "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop&auto=format",
            vibe: offer.city,
            distance: offer.distanceKm ? `${offer.distanceKm} km` : "1.2 km",
          }))
          setStays(mapped)
          setLoading(false)
          return
        }
      } catch (error) {
        console.warn("Hotel search failed:", error)
      }

      if (active) {
        setStays(defaultStays)
        setLoading(false)
      }
    }

    void loadStays()
    return () => {
      active = false
    }
  }, [activeCity])

  const filtered = stays
    .filter((s) => {
      if (activeFilter === "hostel") return s.category === "hostel"
      if (activeFilter === "hotel") return s.category === "hotel"
      if (activeFilter === "private") return s.category === "private"
      if (activeFilter === "budget") return s.priceNum <= 25
      if (activeFilter === "top") return s.rating >= 4.7
      return true
    })
    .filter(
      (s) =>
        search === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.location.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "price") return a.priceNum - b.priceNum
      if (sort === "rating") return b.rating - a.rating
      return 0
    })

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => goBack("home")}
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center cursor-pointer flex-shrink-0"
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
          <div className="min-w-0">
            <h1 className={isDesktop ? "text-[20px] md:text-[26px] font-black text-navy max-w-none" : "text-[20px] font-black text-navy truncate"}>
              Find Your Perfect Stay
            </h1>
            <p className={isDesktop ? "text-slate-400 text-[12px] max-w-none" : "text-slate-400 text-[12px] truncate"}>
              {activeCity} · Jun 5–8 · 3 nights
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("saved-places")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-[12px] font-bold text-brand cursor-pointer flex-shrink-0"
          style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.08)" }}
        >
          <span className="text-red-500">❤️</span>
          <span>Saved ({savedStayNames.size})</span>
        </button>
      </div>

      {/* Search */}
      <div className="px-5 md:px-8 mb-3">
        <div
          className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3"
          style={{ boxShadow: "0 2px 12px rgba(59,65,200,0.08)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle
              cx="6.5"
              cy="6.5"
              r="5"
              stroke="#94a3b8"
              strokeWidth="1.6"
            />
            <path
              d="M11 11l3 3"
              stroke="#94a3b8"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stays or city…"
            className="flex-1 text-[14px] text-navy outline-none bg-transparent placeholder:text-slate-300"
          />
          {search !== "" && (
            <button
              onClick={() => setSearch("")}
              className="text-slate-300 text-xl leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 mb-4 flex gap-2 overflow-x-auto pb-1">
        {(routeCities.length > 0
          ? routeCities
          : ["Tunis", "Sousse", "Sfax"]
        ).map((city) => (
          <button
            key={city}
            onClick={() => {
              setSelectedCity(city)
              setSearch("")
            }}
            className="flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all"
            style={{
              background: selectedCity === city || (routeCities.length === 0 && !selectedCity && city === "Tunis") ? "#3B41C8" : "white",
              color: selectedCity === city || (routeCities.length === 0 && !selectedCity && city === "Tunis") ? "white" : "#64748b",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {city}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-5 md:px-8 mb-3 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-bold transition-all"
            style={{
              background: f.key === activeFilter ? "#3B41C8" : "white",
              color: f.key === activeFilter ? "white" : "#64748b",
              boxShadow:
                f.key === activeFilter
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Sort + count */}
      <div className="px-5 md:px-8 mb-4 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-slate-400">
          {loading
            ? "Loading live stays…"
            : `${filtered.length} stay${filtered.length !== 1 ? "s" : ""} found`}
        </span>
        <div className="flex gap-1">
          {(["recommended", "price", "rating"] as SortKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className="px-3 py-1 rounded-full text-[11px] font-bold capitalize transition-all"
              style={{
                background: sort === s ? "#0D0F2E" : "white",
                color: sort === s ? "white" : "#94a3b8",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              {s === "recommended"
                ? "Best"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-6" : "px-5 flex flex-col gap-4 pb-6"}>
        {loading && (
          <div className="rounded-[22px] bg-white px-4 py-6 text-center text-[12px] text-slate-500">
            Looking up live hotel options in Tunisia…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-3">🔍</span>
            <p className="text-navy font-black text-[16px] mb-1">
              No stays found
            </p>
            <p className="text-slate-400 text-[13px]">
              Try adjusting your filters
            </p>
          </div>
        )}

        {filtered.map((stay) => {
          const isSaved = savedStayNames.has(stay.name.trim().toLowerCase())
          return (
            <div
              key={stay.name}
              onClick={() => {
                if (typeof window !== "undefined") {
                  localStorage.setItem(
                    "trypo_selected_stay",
                    JSON.stringify({
                      name: stay.name,
                      location: stay.location,
                      price: stay.price,
                      rating: stay.rating,
                      image: stay.image,
                      city: activeCity,
                      vibe: stay.vibe,
                    }),
                  )
                }
                navigate("stay-details")
              }}
              className="w-full rounded-[22px] overflow-hidden bg-white text-left cursor-pointer transition-transform active:scale-[0.99]"
              style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.1)" }}
            >
              <div className={isDesktop ? "relative h-[200px] bg-slate-200" : "relative h-[150px] bg-slate-200"}>
                <img
                  src={stay.image}
                  alt={stay.name}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 60%)",
                  }}
                />
                <div className="absolute top-3 right-12">
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white"
                    style={{
                      background: "rgba(0,0,0,0.45)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {stay.vibe}
                  </span>
                </div>
                {/* Heart save button */}
                <button
                  type="button"
                  onClick={(e) => handleToggleSaveStay(e, stay)}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90"
                  style={{
                    background: "rgba(0,0,0,0.45)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 16 16"
                    fill={isSaved ? "#FF6347" : "none"}
                    stroke={isSaved ? "#FF6347" : "white"}
                    strokeWidth="1.6"
                  >
                    <path d="M8 14s-6-3.8-6-8a4 4 0 018 0 4 4 0 018 0c0 4.2-6 8-6 8" />
                  </svg>
                </button>
                <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90">
                  <span className="text-amber-400 text-[10px]">★</span>
                  <span className="text-navy font-black text-[11px]">
                    {stay.rating}
                  </span>
                </div>
              <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end">
                <p className="text-white/80 text-[11px]">
                  📍 {stay.distance} from center
                </p>
              </div>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-navy font-black text-[15px]">
                    {stay.name}
                  </h3>
                  <p className="text-slate-400 text-[12px]">
                    📍 {stay.location}
                  </p>
                </div>
                <div className="text-right ml-2">
                  <p className="text-navy font-black text-[17px]">
                    {stay.price}
                  </p>
                  <p className="text-slate-400 text-[10px]">per night</p>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {stay.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                    style={{
                      background: "rgba(59,65,200,0.07)",
                      color: "#3B41C8",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  // Remember WHICH hotel was tapped so the booking screen
                  // shows it (with dates) instead of a generic demo stay.
                  try {
                    localStorage.setItem(
                      "trypo_selected_stay",
                      JSON.stringify({
                        name: stay.name,
                        location: stay.location,
                        city: activeCity,
                        price: stay.price,
                        priceNum: stay.priceNum,
                        rating: stay.rating,
                        image: stay.image,
                        vibe: stay.vibe,
                      }),
                    )
                  } catch {
                    /* ignore */
                  }
                  openBooking?.("stay")
                }}
                className="w-full py-2.5 rounded-xl text-white font-bold text-[13px]"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                }}
              >
                Book now
              </button>
            </div>
          </div>
        )})}
      </div>
    </div>
  )
}

