import { useState, useEffect } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { getSavedPlaces, deleteSavedPlace, addItineraryItem, getTripDetails } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const categories = ["All", "🏨 Stays", "🎯 Activities", "🍜 Food", "📍 Places"]

const catMap: Record<number, string> = {
  1: "stays",
  2: "activities",
  3: "food",
  4: "places",
}

export default function SavedPlacesScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [activeCategory, setActiveCategory] = useState(0)
  const [savedList, setSavedList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

  const loadSaved = async () => {
    try {
      setLoading(true)
      const places = await getSavedPlaces()
      const mapped = (places || []).map((p: any) => ({
        id: p.id,
        name: p.name || p.title || "Saved Place",
        location: p.address || p.location || p.city || "Unknown Location",
        tag: p.category || "Place",
        rating: p.rating || 4.5,
        price: p.notes ? p.notes : "Free",
        image: p.image_url || "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=500&h=350&fit=crop&auto=format",
        savedAt: p.created_at ? new Date(p.created_at).toLocaleDateString() : "recently",
        category: (p.category || "places").toLowerCase(),
      }))
      setSavedList(mapped)
    } catch {
      setSavedList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSaved()
    const onDbChange = () => {
      void loadSaved()
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    return () => window.removeEventListener("trypo:db_changed", onDbChange)
  }, [])

  const handleToggleHeart = async (placeId: string) => {
    await deleteSavedPlace(placeId)
  }

  const handleAddToTrip = async (place: any) => {
    setAddingId(place.id)
    try {
      const trip = await getTripDetails()
      if (trip) {
        await addItineraryItem({
          tripId: trip.id,
          itemType: place.category.includes("stay") || place.category.includes("hotel") ? "stay" : place.category.includes("food") ? "food" : "activity",
          title: place.name,
          details: `Saved Place · ${place.location}`,
          locationName: place.location,
          estimatedCost: 20,
          currency: "EUR",
        })
      }
      setAddedId(place.id)
      setTimeout(() => setAddedId(null), 1500)
    } finally {
      setAddingId(null)
    }
  }

  const filtered =
    activeCategory === 0
      ? savedList
      : savedList.filter((p) => {
          const cat = p.category
          if (activeCategory === 1) {
            return cat.includes("stay") || cat.includes("hotel") || cat.includes("hostel") || cat.includes("resort") || cat.includes("bnb")
          }
          if (activeCategory === 2) {
            return cat.includes("activit") || cat.includes("tour") || cat.includes("attraction")
          }
          if (activeCategory === 3) {
            return cat.includes("food") || cat.includes("restaurant") || cat.includes("caf") || cat.includes("bar")
          }
          if (activeCategory === 4) {
            return cat.includes("place") || cat.includes("destin") || cat.includes("city")
          }
          return cat.includes(catMap[activeCategory]) || catMap[activeCategory].includes(cat)
        })

  const visible = filtered.filter((p) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.tag.toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-5">
        <button
          onClick={() => goBack("profile")}
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
          <h1 className="text-[20px] font-black text-navy">Saved Places</h1>
          <p className="text-slate-400 text-[12px]">
            {visible.length} places saved
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 md:px-8 mb-4">
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved places or stays…"
            className="bg-transparent text-[13px] text-navy placeholder-slate-400 outline-none w-full"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-slate-400 hover:text-navy text-xs px-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 px-5 md:px-8 mb-5 overflow-x-auto pb-1">
        {categories.map((cat, i) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(i)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-bold transition-all"
            style={{
              background: i === activeCategory ? "#3B41C8" : "white",
              color: i === activeCategory ? "white" : "#64748b",
              boxShadow:
                i === activeCategory
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-6" : "px-5 flex flex-col gap-4 pb-6"}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-slate-400 text-sm">Loading saved places...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">💔</span>
            <p className="text-navy font-black text-[18px] mb-1">
              Nothing saved here
            </p>
            <p className="text-slate-400 text-[13px]">
              Go explore and heart places you love
            </p>
          </div>
        ) : (
          visible.map((place) => (
            <div
              key={place.name}
              className="bg-white rounded-[22px] overflow-hidden"
              style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.09)" }}
            >
              <div className="relative bg-slate-200" style={{ height: isDesktop ? "180px" : "140px" }}>
                <img
                  src={place.image}
                  alt={place.name}
                  className="w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)",
                  }}
                />
                {/* Heart button */}
                <button
                  onClick={() => handleToggleHeart(place.id)}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="#FF6347">
                    <path d="M8 14s-6-3.8-6-8a4 4 0 018 0 4 4 0 018 0c0 4.2-6 8-6 8z" />
                  </svg>
                </button>
                {/* Tag */}
                <div className="absolute bottom-3 left-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white"
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {place.tag}
                  </span>
                </div>
                {/* Rating */}
                <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90">
                  <span className="text-amber-400 text-[10px]">★</span>
                  <span className="text-navy font-black text-[10px]">
                    {place.rating}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <h3 className="text-navy font-black text-[15px]">
                      {place.name}
                    </h3>
                    <p className="text-slate-400 text-[12px]">
                      📍 {place.location}
                    </p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="text-navy font-bold text-[13px]">
                      {place.price}
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      Saved {place.savedAt}
                    </p>
                  </div>
                </div>
                <button
                  disabled={addingId === place.id}
                  onClick={() => handleAddToTrip(place)}
                  className="mt-3 w-full py-2.5 rounded-xl font-bold text-[13px] transition-all"
                  style={{
                    background: addedId === place.id ? "#059669" : "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    color: "white",
                  }}
                >
                  {addingId === place.id ? "Adding..." : addedId === place.id ? "✓ Added to Itinerary!" : "Add to Itinerary"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
