import { useEffect, useMemo, useState } from "react"
import type { Screen } from "../App"
import {
  activitySearchUrl,
  bookingSearchUrl,
  destinationCatalog,
  getDestinationGuide,
  type DestinationGuide,
} from "../lib/travelApi"
import { getPublishedDestinations, getSavedPlaces, toggleSavedPlace, type PublicDestination } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  onOpenDestination?: (slug: string) => void
}

const categories = [
  { label: "Trending", key: "trending" },
  { label: "Beaches", key: "beach" },
  { label: "Cities", key: "city" },
  { label: "Adventure", key: "adventure" },
  { label: "Backpacking", key: "backpacking" },
  { label: "Food", key: "food" },
]

export type Destination = {
  slug: string
  flag: string
  name: string
  country: string
  budget: string
  budgetNote: string
  activities: string[]
  tags: string[]
  image: string
  rating: number
  bestTime: string
  savedByDefault?: boolean
}

export const destinations: Destination[] = destinationCatalog.map((item, index) => ({
  slug: `${item.city.toLowerCase().replace(/\s+/g, "-")}-${index}`,
  flag: item.country,
  name: item.city,
  country: item.country,
  budget: item.region === "North Africa" ? "$" : item.region === "Europe" ? "$$" : "$$$",
  budgetNote: item.note,
  activities: [item.note],
  tags: item.tags,
  image: item.image,
  rating: 4.7,
  bestTime: item.region,
  savedByDefault: false,
}))

const countryFlags: Record<string, string> = {
  TN: "TN",
  EG: "EG",
  MA: "MA",
  ES: "ES",
  FR: "FR",
  JP: "JP",
  TH: "TH",
  ID: "ID",
  VN: "VN",
  PT: "PT",
  US: "US",
  GB: "GB",
}

const toDestination = (d: PublicDestination): Destination => ({
  slug: d.id,
  flag: (d.countryCode && countryFlags[d.countryCode.toUpperCase()]) || d.country,
  name: d.city,
  country: d.country,
  budget:
    d.averageDailyBudget == null
      ? "$$"
      : d.averageDailyBudget < 60
        ? "$"
        : d.averageDailyBudget < 110
          ? "$$"
          : "$$$",
  budgetNote: d.description || `${d.city}, ${d.country}`,
  activities: d.description ? [d.description] : ["Check the community activities"],
  tags: d.tags,
  image:
    d.coverImageUrl ||
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&auto=format",
  rating: 4.7,
  bestTime: "Community pick",
  savedByDefault: false,
})

export default function ExploreScreen({ navigate }: Props) {
  const [activeCategory, setActiveCategory] = useState(0)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [remoteDestinations, setRemoteDestinations] = useState<PublicDestination[]>([])
  const isDesktop = useIsDesktop()

  // Merge live published destinations from Supabase on top of the static
  // catalog. When the user is signed out (or the DB is empty) the catalog
  // remains as a graceful fallback.
  useEffect(() => {
    let active = true
    getPublishedDestinations()
      .then((list) => {
        if (active) setRemoteDestinations(Array.isArray(list) ? list : [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const mergedDestinations = useMemo(() => {
    const base = [...destinations]
    const existing = new Set(
      base.map((d) => `${d.name.toLowerCase()}|${d.country.toLowerCase()}`),
    )
    for (const r of remoteDestinations) {
      const key = `${r.city.toLowerCase()}|${r.country.toLowerCase()}`
      if (existing.has(key)) continue
      base.push(toDestination(r))
      existing.add(key)
    }
    return base
  }, [remoteDestinations])

  // Load saved places from store and sync with saved set
  useEffect(() => {
    let active = true
    const syncSaved = async () => {
      try {
        const places = await getSavedPlaces()
        if (!active) return
        const savedNames = new Set(
          (places || []).map((p: any) => (p.name || p.title || "").toLowerCase().trim()),
        )
        const slugSet = new Set<string>()
        for (const d of mergedDestinations) {
          if (savedNames.has(d.name.toLowerCase().trim())) {
            slugSet.add(d.slug)
          }
        }
        setSaved(slugSet)
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
  }, [mergedDestinations])

  const toggleSave = async (e: React.MouseEvent, slug: string) => {
    e.stopPropagation()
    const targetDest = mergedDestinations.find((d) => d.slug === slug)
    if (!targetDest) return

    // Optimistic UI state
    setSaved((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

    try {
      await toggleSavedPlace({
        name: targetDest.name,
        address: `${targetDest.name}, ${targetDest.country}`,
        city: targetDest.name,
        country: targetDest.country,
        category: "places",
        rating: targetDest.rating,
        image_url: targetDest.image,
        notes: targetDest.description || targetDest.bestTime,
      })
    } catch (err) {
      console.warn("Failed to toggle saved place:", err)
    }
  }

  const activeKey = categories[activeCategory].key
  const filtered = mergedDestinations.filter((d) => {
    const matchesCategory =
      activeKey === "trending" || d.tags.includes(activeKey)
    const matchesSearch =
      search === "" ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.country.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  if (selectedSlug) {
    const dest = mergedDestinations.find((d) => d.slug === selectedSlug)!
    return (
      <DestinationDetail
        dest={dest}
        saved={saved.has(dest.slug)}
        onToggleSave={(e) => toggleSave(e, dest.slug)}
        onBack={() => setSelectedSlug(null)}
        navigate={navigate}
      />
    )
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      <div className="px-5 md:px-8 mb-5">
        <h1 className="text-[26px] md:text-[32px] font-black text-navy mb-0.5">
          Where to next?
        </h1>
        <p className="text-slate-400 text-[13px]">
          Discover your next adventure
        </p>
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search destinations…"
            className="flex-1 text-[14px] text-navy outline-none bg-transparent placeholder:text-slate-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-slate-300 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-2 px-5 md:px-8 mb-5 overflow-x-auto pb-1">
        {categories.map((cat, i) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(i)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-bold transition-all"
            style={{
              background: i === activeCategory ? "#3B41C8" : "white",
              color: i === activeCategory ? "white" : "#64748b",
              boxShadow:
                i === activeCategory
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="px-5 md:px-8 mb-3 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-400">
          {filtered.length} destination{filtered.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => navigate("saved-places")}
          className="text-[12px] font-bold flex items-center gap-1"
          style={{ color: "#3B41C8" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="#FF6347">
            <path d="M6 10.5S1 7.3 1 4a3 3 0 016 0 3 3 0 016 0c0 3.3-5 6.5-5 6.5z" />
          </svg>
          Saved ({saved.size})
        </button>
      </div>

      {/* Destination cards */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-6" : "px-5 flex flex-col gap-4 pb-6"}>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-navy font-black text-[16px] mb-1">
              No destinations found
            </p>
            <p className="text-slate-400 text-[13px]">
              Try a different search or category
            </p>
          </div>
        )}

        {filtered.map((dest) => (
          <div
            key={dest.slug}
            onClick={() => setSelectedSlug(dest.slug)}
            className="w-full rounded-[22px] overflow-hidden text-left relative cursor-pointer"
            style={{
              height: isDesktop ? "260px" : "190px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            }}
          >
            <img
              src={dest.image}
              alt={dest.name}
              className="w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)",
              }}
            />

            {/* Save button */}
            <button
              onClick={(e) => toggleSave(e, dest.slug)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.9)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill={saved.has(dest.slug) ? "#FF6347" : "none"}
                stroke={saved.has(dest.slug) ? "#FF6347" : "#94a3b8"}
                strokeWidth="1.6"
              >
                <path d="M8 13.5S2 10 2 5.5a4 4 0 018 0 4 4 0 018 0C18 10 8 13.5 8 13.5z" />
              </svg>
            </button>

            {/* Rating */}
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90">
              <span className="text-amber-400 text-[10px]">★</span>
              <span className="text-navy font-black text-[11px]">
                {dest.rating}
              </span>
            </div>

            <div className="absolute inset-0 p-4 flex flex-col justify-end">
              <div className="flex items-center gap-2 mb-1.5">
                <div>
                  <h3 className="text-white font-black text-[19px] leading-tight">
                    {dest.name}
                  </h3>
                  <p className="text-white/60 text-[11px]">{dest.country}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {dest.activities.slice(0, 3).map((a) => (
                    <span
                      key={a}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                      style={{
                        background: "rgba(255,255,255,0.18)",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
                <div className="text-right ml-2 flex-shrink-0">
                  <p className="text-white/60 text-[9px]">from</p>
                  <p className="text-white font-black text-[14px]">
                    {dest.budget}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Inline destination detail ─── */
function GuideSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 animate-pulse"
          style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
        >
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex-shrink-0" />
          <div className="flex-1">
            <div className="h-3 rounded-full bg-slate-100 mb-1.5 w-2/3" />
            <div className="h-2.5 rounded-full bg-slate-50 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function DestinationDetail({
  dest,
  saved,
  onToggleSave,
  onBack,
  navigate,
}: {
  dest: Destination
  saved: boolean
  onToggleSave: (e: React.MouseEvent) => void
  onBack: () => void
  navigate: (s: Screen) => void
}) {
  const highlights = [
    { label: "Budget", value: dest.budget },
    { label: "Best time", value: dest.bestTime },
    { label: "Rating", value: String(dest.rating) },
    { label: "Climate", value: "Tropical" },
  ]

  // Live guide: best places, hotels and activities from keyless web APIs
  // (OpenStreetMap Overpass + Wikipedia). Falls back to static samples offline.
  const [guide, setGuide] = useState<DestinationGuide | null>(null)
  const [guideLoading, setGuideLoading] = useState(true)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    let active = true
    setGuide(null)
    setGuideLoading(true)
    getDestinationGuide(dest.name, dest.country)
      .then((g) => {
        if (active) setGuide(g)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setGuideLoading(false)
      })
    return () => {
      active = false
    }
  }, [dest.name, dest.country])

  const aboutText =
    guide?.wikiExtract ||
    `${dest.name} is one of the world's most iconic travel destinations. Known for its vibrant culture, stunning landscapes, and incredible food scene, it attracts millions of backpackers and travelers every year. The best time to visit is ${dest.bestTime}, when the weather is ideal and the crowds are manageable.}`

  const staysSample = [
    { name: "Le Jardin Tunis", type: "Boutique stay", price: "$28/night", rating: 4.8 },
    {
      name: "Dar Sousse Maison",
      type: "Coastal hostel",
      price: "$32/night",
      rating: 4.6,
    },
    {
      name: "Riad Sfax Bleu",
      type: "Historic inn",
      price: "$26/night",
      rating: 4.7,
    },
  ]

  return (
    <div className="min-h-full bg-surface pb-24">
      {/* Hero */}
      <div className={isDesktop ? "relative h-[420px] bg-slate-900" : "relative h-[280px] bg-slate-900"}>
        <img
          src={dest.image}
          alt={dest.name}
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(13,15,46,0.75) 100%)",
          }}
        />
        <button
          onClick={onBack}
          className="absolute top-12 left-5 md:left-8 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={onToggleSave}
          className="absolute top-12 right-5 md:right-8 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(8px)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill={saved ? "#FF6347" : "none"}
            stroke={saved ? "#FF6347" : "white"}
            strokeWidth="1.6"
          >
            <path d="M9 15.5S2 11.5 2 6a5 5 0 0110 0 5 5 0 0110 0C22 11.5 9 15.5 9 15.5z" />
          </svg>
        </button>
        <div className="absolute bottom-5 left-5 right-5 md:left-8 md:right-8">
          <div className="flex items-center gap-2 mb-1">
            <div>
              <h1 className="text-white font-black text-[26px] leading-tight">
                {dest.name}
              </h1>
              <p className="text-white/60 text-[13px]">{dest.country}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {dest.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white capitalize"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(6px)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div
        className="mx-5 md:mx-8 -mt-4 relative z-10 bg-white rounded-2xl grid grid-cols-4 py-3 px-2"
        style={{ boxShadow: "0 8px 24px rgba(59,65,200,0.12)" }}
      >
        {highlights.map((h) => (
          <div key={h.label} className="flex flex-col items-center gap-0.5">
            <span className="text-navy font-black text-[12px]">{h.value}</span>
            <span className="text-slate-400 text-[9px] font-medium">
              {h.label}
            </span>
          </div>
        ))}
      </div>

      {/* Activities */}
      <div className="px-5 md:px-8 mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Top Experiences
        </p>
        <div className="flex flex-wrap gap-2">
          {dest.activities.map((a) => (
            <span
              key={a}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
              style={{ background: "rgba(59,65,200,0.08)", color: "#3B41C8" }}
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      {/* About — live Wikipedia summary when available */}
      <div className="px-5 md:px-8 mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
          About
        </p>
        {guide?.wikiImage && (
          <img
            src={guide.wikiImage}
            alt={dest.name}
            className="w-full h-[140px] object-cover rounded-2xl mb-2"
          />
        )}
        <p className="text-slate-600 text-[13px] leading-relaxed">
          {aboutText}
        </p>
      </div>

      {/* Best places to visit — live from OpenStreetMap */}
      <div className="px-5 md:px-8 mt-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Best places to visit
        </p>
        {guideLoading && <GuideSkeleton rows={3} />}
        {!guideLoading && guide && guide.places.length > 0 && (
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
            {guide.places.map((p) => (
              <a
                key={p.id}
                href={p.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between text-left"
                style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-[15px] font-black text-brand flex-shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-navy font-bold text-[13px] truncate">{p.name}</p>
                    <p className="text-slate-400 text-[11px] truncate">{p.detail}</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-brand flex-shrink-0 ml-2">
                  Map ↗
                </span>
              </a>
            ))}
          </div>
        )}
        {!guideLoading && (!guide || guide.places.length === 0) && (
          <p className="text-slate-400 text-[12px]">
            No live sights found — check the map for {dest.name}.
          </p>
        )}
      </div>

      {/* Best hotels — live from OpenStreetMap, booking via Booking.com */}
      <div className="px-5 md:px-8 mt-5">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Best hotels
          </p>
          <a
            href={bookingSearchUrl(dest.name, dest.country)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-brand"
          >
            Book ↗
          </a>
        </div>
        {guideLoading && <GuideSkeleton rows={3} />}
        {!guideLoading && guide && guide.hotels.length > 0 && (
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
            {guide.hotels.map((h) => (
              <div
                key={h.id}
                className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between text-left"
                style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-[15px] font-black text-brand flex-shrink-0">
                    {h.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-navy font-bold text-[13px] truncate">{h.name}</p>
                    <p className="text-slate-400 text-[11px] truncate">{h.detail}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-2">
                  <a
                    href={h.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-brand"
                  >
                    Map ↗
                  </a>
                  <a
                    href={bookingSearchUrl(h.name, dest.country)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-semibold text-slate-400"
                  >
                    Check price
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
        {!guideLoading && (!guide || guide.hotels.length === 0) && (
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
            {staysSample.map((s) => (
              <button
                key={s.name}
                onClick={() => navigate("stay-details")}
                className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between text-left"
                style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-[15px] font-black text-brand">
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-navy font-bold text-[13px]">{s.name}</p>
                    <p className="text-slate-400 text-[11px]">{s.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-navy font-black text-[13px]">{s.price}</p>
                  <p className="text-amber-400 text-[11px]">★ {s.rating}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Activities to do — live from OpenStreetMap */}
      <div className="px-5 md:px-8 mt-5">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Activities to do
          </p>
          <a
            href={activitySearchUrl(dest.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-brand"
          >
            More ↗
          </a>
        </div>
        {guideLoading && <GuideSkeleton rows={2} />}
        {!guideLoading && guide && guide.activities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {guide.activities.map((a) => (
              <a
                key={a.id}
                href={a.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                style={{ background: "rgba(6,196,212,0.12)", color: "#0891b2" }}
                title={a.detail}
              >
                {a.name}
              </a>
            ))}
          </div>
        )}
        {!guideLoading && (!guide || guide.activities.length === 0) && (
          <div className="flex flex-wrap gap-2">
            {dest.activities.map((a) => (
              <span
                key={a}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold"
                style={{ background: "rgba(59,65,200,0.08)", color: "#3B41C8" }}
              >
                {a}
              </span>
            ))}
          </div>
        )}
        <p className="text-slate-300 text-[10px] mt-3">
          Live data: OpenStreetMap + Wikipedia · Prices/booking via Booking.com
        </p>
      </div>

      {/* CTA */}
      <div className="px-5 md:px-8 mt-6">
        <button
          onClick={() => navigate("create-trip")}
          className="w-full py-4 rounded-2xl text-white font-black text-[16px]"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 12px 32px rgba(59,65,200,0.35)",
          }}
        >
          Plan a trip to {dest.name}
        </button>
      </div>
    </div>
  )
}
