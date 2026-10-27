import { useState, useEffect } from "react"
import type { Screen } from "../App"
import { getSavedPlaces, toggleSavedPlace, addItineraryItem, getTripDetails } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const amenities = [
  { icon: "📶", label: "Free WiFi" },
  { icon: "🏊", label: "Pool" },
  { icon: "🍺", label: "Bar" },
  { icon: "🍳", label: "Breakfast" },
  { icon: "🎉", label: "Events" },
  { icon: "🧺", label: "Laundry" },
]

const rooms = [
  {
    name: "6-Bed Mixed Dorm",
    price: "$18",
    icon: "🛏",
    capacity: "6 beds",
    available: 3,
    features: ["Shared bath", "Locker", "AC"],
  },
  {
    name: "4-Bed Female Dorm",
    price: "$22",
    icon: "🛏",
    capacity: "4 beds",
    available: 1,
    features: ["Shared bath", "Female only", "Locker"],
  },
  {
    name: "Private Double Room",
    price: "$65",
    icon: "🏨",
    capacity: "2 guests",
    available: 2,
    features: ["En-suite bath", "AC", "TV"],
  },
  {
    name: "Private Twin Room",
    price: "$58",
    icon: "🏨",
    capacity: "2 guests",
    available: 1,
    features: ["En-suite bath", "AC", "Balcony"],
  },
]

const reviews = [
  {
    name: "Sarah M.",
    country: "🇦🇺",
    date: "Nov 2024",
    rating: 5,
    text: "Beautiful boutique stay in Tunis. The courtyard is calm, the hosts are lovely, and the location is perfect for the medina.",
  },
  {
    name: "Jake T.",
    country: "🇬🇧",
    date: "Oct 2024",
    rating: 5,
    text: "Perfect location, great vibe, and easy access to cafés and local markets. Would stay again without hesitation.",
  },
  {
    name: "Maria L.",
    country: "🇧🇷",
    date: "Oct 2024",
    rating: 4,
    text: "Really good value and a calm atmosphere. Everything feels clean and well looked after in the common areas.",
  },
  {
    name: "Chris K.",
    country: "🇩🇪",
    date: "Sep 2024",
    rating: 5,
    text: "The host arranged a great local guide and the room was ideal for a short Tunis stay. Staff were extremely helpful.",
  },
]

const nearbyPlaces = [
  { name: "Medina Gate", type: "Historic", dist: "50 m", icon: "🧭" },
  { name: "Place du 7 Novembre", type: "Square", dist: "0.9 km", icon: "🏛" },
  { name: "Tunis Corniche", type: "Walk", dist: "1.4 km", icon: "🌊" },
  { name: "Café de la Ville", type: "Coffee", dist: "1.1 km", icon: "☕" },
  { name: "7-Eleven", type: "Convenience", dist: "30 m", icon: "🏪" },
]

const tabs = ["Overview", "Rooms", "Location", "Reviews"]

export default function StayDetailsScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState(0)
  const [imgIndex, setImgIndex] = useState(0)
  const [saved, setSaved] = useState(false)

  // Add-to-itinerary date modal state
  const [showDateModal, setShowDateModal] = useState(false)
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [tripStart, setTripStart] = useState("")
  const [tripEnd, setTripEnd] = useState("")
  const [addingStay, setAddingStay] = useState(false)
  const [stayError, setStayError] = useState<string | null>(null)

  // Load stay passed from FindStayScreen or explore
  const [stayData] = useState(() => {
    try {
      const raw = localStorage.getItem("trypo_selected_stay")
      if (raw) return JSON.parse(raw)
    } catch {
      /* fallback */
    }
    return null
  })

  const stayName = stayData?.name || "Le Jardin Tunis"
  const stayCity = stayData?.city || "Tunis"
  const stayCountry = stayData?.country || "Tunisia"
  const stayLocation = stayData?.location || "Medina"
  const stayPrice = stayData?.price || "$28/night"
  const stayRating = stayData?.rating || 4.8

  const openStayDateModal = async () => {
    setStayError(null)
    setShowDateModal(true)
    try {
      const trip = await getTripDetails()
      const s = ((trip?.start_date || "") as string).slice(0, 10)
      const e = ((trip?.end_date || "") as string).slice(0, 10)
      setTripStart(s)
      setTripEnd(e)
      setCheckIn((prev) => prev || s)
      setCheckOut((prev) => prev || e || s)
    } catch {
      /* ignore */
    }
  }

  const confirmAddStay = async () => {
    if (!checkIn) {
      setStayError("Pick a check-in date first.")
      return
    }
    setAddingStay(true)
    setStayError(null)
    try {
      const trip = await getTripDetails()
      if (!trip) throw new Error("Create a trip before adding a stay.")
      const priceNum = Number(String(stayPrice).replace(/[^\d.]/g, "")) || null
      await addItineraryItem({
        tripId: trip.id,
        itemType: "stay",
        title: `🏨 ${stayName}`,
        details: `${stayLocation}, ${stayCity} · ${stayPrice}${checkOut && checkOut !== checkIn ? ` · ${checkIn} → ${checkOut}` : ` · ${checkIn}`}`,
        locationName: `${stayName}, ${stayCity}`,
        startsAt: new Date(`${checkIn}T14:00:00`).toISOString(),
        endsAt: new Date(`${checkOut || checkIn}T11:00:00`).toISOString(),
        estimatedCost: priceNum,
        currency: String(stayPrice).includes("€") ? "EUR" : "USD",
      })
      setShowDateModal(false)
      navigate("itinerary")
    } catch (err) {
      setStayError(err instanceof Error ? err.message : "Unable to add this stay.")
    } finally {
      setAddingStay(false)
    }
  }

  const images = stayData?.image
    ? [
        stayData.image,
        "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=800&h=500&fit=crop&auto=format",
        "https://images.unsplash.com/photo-1576475706812-822620fc23ba?w=800&h=500&fit=crop&auto=format",
      ]
    : [
        "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=800&h=500&fit=crop&auto=format",
        "https://images.unsplash.com/photo-1576475706812-822620fc23ba?w=800&h=500&fit=crop&auto=format",
        "https://images.unsplash.com/photo-1601224335112-b74158e231ec?w=800&h=500&fit=crop&auto=format",
      ]

  // Sync saved status from persistent store
  useEffect(() => {
    let active = true
    const checkSaved = async () => {
      try {
        const places = await getSavedPlaces()
        if (!active) return
        const normName = stayName.trim().toLowerCase()
        const isFound = (places || []).some(
          (p: any) => (p.name || p.title || "").trim().toLowerCase() === normName,
        )
        setSaved(isFound)
      } catch {
        /* ignore */
      }
    }
    void checkSaved()

    window.addEventListener("trypo:db_changed", checkSaved)
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", checkSaved)
    }
  }, [stayName])

  const handleToggleSave = async () => {
    const nextSaved = !saved
    setSaved(nextSaved)
    try {
      await toggleSavedPlace({
        name: stayName,
        address: stayLocation,
        city: stayCity,
        country: stayCountry,
        category: "stays",
        rating: Number(stayRating) || 4.8,
        image_url: images[0],
        notes: `${stayPrice} · ${stayLocation}`,
      })
    } catch (err) {
      console.warn("Failed to toggle stay saved status:", err)
    }
  }

  return (
    <div className="min-h-full bg-surface relative pb-28">
      {/* Image gallery */}
      <div className={isDesktop ? "relative h-[420px] bg-slate-900 overflow-hidden" : "relative h-[260px] bg-slate-900 overflow-hidden"}>
        <img
          src={images[imgIndex]}
          alt="Stay"
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 60%)",
          }}
        />
        <button
          onClick={handleToggleSave}
          className="absolute top-12 right-5 md:right-8 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill={saved ? "#FF6347" : "none"}
          >
            <path
              d="M8 14s-6-3.8-6-8a4 4 0 018 0 4 4 0 018 0c0 4.2-6 8-6 8"
              stroke={saved ? "#FF6347" : "white"}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setImgIndex(i)}
              className="rounded-full transition-all"
              style={{
                width: i === imgIndex ? "20px" : "6px",
                height: "6px",
                background: i === imgIndex ? "white" : "rgba(255,255,255,0.5)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Name / rating */}
      <div className="px-5 md:px-8 pt-4">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1">
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-black"
              style={{ background: "rgba(255,99,71,0.12)", color: "#FF6347" }}
            >
              🔥 Backpacker Favorite
            </span>
            <h1 className="text-navy font-black text-[22px] leading-tight mt-1">
              {stayName}
            </h1>
          </div>
          <div className="flex items-center gap-1 ml-3 mt-1">
            <span className="text-amber-400">★</span>
            <span className="text-navy font-black text-[16px]">{stayRating}</span>
          </div>
        </div>

        <div className="flex gap-4 mb-4 mt-2">
          {[
            { icon: "📍", label: stayLocation },
            { icon: "💰", label: stayPrice },
            { icon: "🛏", label: "Double room" },
            { icon: "📅", label: "Jun 5–8" },
          ].map((info) => (
            <div key={info.label} className="flex flex-col items-center gap-1">
              <span className="text-sm">{info.icon}</span>
              <span className="text-[9px] font-semibold text-slate-500 text-center">
                {info.label}
              </span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-bold"
              style={{
                background: i === activeTab ? "#3B41C8" : "white",
                color: i === activeTab ? "white" : "#64748b",
                boxShadow:
                  i === activeTab
                    ? "0 4px 12px rgba(59,65,200,0.3)"
                    : "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* --- OVERVIEW --- */}
        {activeTab === 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Amenities
            </p>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
              {amenities.map((a) => (
                <div
                  key={a.label}
                  className="flex items-center gap-2 bg-white rounded-2xl px-3 py-2.5"
                  style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
                >
                  <span className="text-base">{a.icon}</span>
                  <span className="text-navy text-[11px] font-semibold">
                    {a.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              About
            </p>
            <p className="text-slate-600 text-[13px] leading-relaxed mb-5">
              Le Jardin Tunis is a calm boutique stay tucked into the heart of the
              Medina, with a rooftop terrace, local hosts, and easy access to cafés,
              markets, and evening walks around the city.
            </p>

            <div
              className="bg-white rounded-2xl p-4 mb-4"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-amber-400 text-lg">★★★★★</span>
                <span className="text-navy font-black text-[15px]">4.8</span>
                <span className="text-slate-400 text-[12px]">
                  · 428 reviews
                </span>
              </div>
              <p className="text-slate-600 text-[13px] italic">
                "Beautiful boutique stay in Tunis. The courtyard is calm, the hosts
                are lovely, and the location is perfect for the medina."
              </p>
              <p className="text-slate-400 text-[11px] mt-1.5 font-medium">
                — Sarah M., 🇦🇺 Australia
              </p>
            </div>

            <div className="flex gap-3">
              {[
                { val: "428", lbl: "Reviews" },
                { val: "4.8", lbl: "Rating" },
                { val: "#1", lbl: "Tunis stays" },
              ].map((s) => (
                <div
                  key={s.lbl}
                  className="flex-1 bg-white rounded-2xl py-3 flex flex-col items-center"
                  style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
                >
                  <span className="text-navy font-black text-[18px]">
                    {s.val}
                  </span>
                  <span className="text-slate-400 text-[10px]">{s.lbl}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- ROOMS --- */}
        {activeTab === 1 && (
          <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-3"}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              Available Room Types
            </p>
            {rooms.map((room) => (
              <div
                key={room.name}
                className="bg-white rounded-[18px] p-4"
                style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{room.icon}</span>
                    <div>
                      <p className="text-navy font-black text-[14px]">
                        {room.name}
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        {room.capacity}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-navy font-black text-[16px]">
                      {room.price}
                    </p>
                    <p className="text-slate-400 text-[10px]">per night</p>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {room.features.map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        background: "rgba(59,65,200,0.07)",
                        color: "#3B41C8",
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {room.available} left
                  </span>
                  <button
                    className="px-4 py-1.5 rounded-full text-[12px] font-black text-white"
                    style={{
                      background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    }}
                  >
                    Select Room
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- LOCATION --- */}
        {activeTab === 2 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Address
            </p>
            <div
              className="bg-white rounded-2xl p-4 mb-4"
              style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
            >
              <p className="text-navy font-bold text-[14px] mb-1">
                Le Jardin Tunis
              </p>
              <p className="text-slate-500 text-[12px]">
                Rue de la Médina, Tunis,
              </p>
              <p className="text-slate-500 text-[12px]">
                Tunisia
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white"
                  style={{ background: "#3B41C8" }}
                >
                  📍 Open Maps
                </button>
                <button
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold"
                  style={{
                    background: "rgba(59,65,200,0.08)",
                    color: "#3B41C8",
                  }}
                >
                  🧭 Directions
                </button>
              </div>
            </div>

            {/* Map placeholder */}
            <div
              className={isDesktop ? "relative h-[220px] rounded-2xl overflow-hidden mb-4" : "relative h-[140px] rounded-2xl overflow-hidden mb-4"}
              style={{
                background: "linear-gradient(135deg, #1a1a5e, #0a2040)",
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl">📍</span>
                  </div>
                  <p className="text-white/60 text-[12px]">
                    Medina, Tunis
                  </p>
                </div>
              </div>
              {/* decorative grid */}
              <svg
                className="absolute inset-0 w-full h-full opacity-10"
                viewBox="0 0 350 140"
              >
                {[0, 30, 60, 90, 120, 140].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="350"
                    y2={y}
                    stroke="white"
                    strokeWidth="0.5"
                  />
                ))}
                {[0, 50, 100, 150, 200, 250, 300, 350].map((x) => (
                  <line
                    key={x}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="140"
                    stroke="white"
                    strokeWidth="0.5"
                  />
                ))}
                <circle cx="175" cy="70" r="10" fill="#3B41C8" />
                <circle
                  cx="175"
                  cy="70"
                  r="20"
                  fill="none"
                  stroke="#3B41C8"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
                <circle
                  cx="175"
                  cy="70"
                  r="32"
                  fill="none"
                  stroke="#3B41C8"
                  strokeWidth="1"
                  opacity="0.25"
                />
              </svg>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Nearby
            </p>
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-2" : "flex flex-col gap-2"}>
              {nearbyPlaces.map((p) => (
                <div
                  key={p.name}
                  className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ boxShadow: "0 1px 6px rgba(59,65,200,0.06)" }}
                >
                  <span className="text-xl">{p.icon}</span>
                  <div className="flex-1">
                    <p className="text-navy font-bold text-[13px]">{p.name}</p>
                    <p className="text-slate-400 text-[11px]">{p.type}</p>
                  </div>
                  <span
                    className="text-[12px] font-black"
                    style={{ color: "#3B41C8" }}
                  >
                    {p.dist}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- REVIEWS --- */}
        {activeTab === 3 && (
          <div>
            {/* Rating summary */}
            <div
              className="bg-white rounded-2xl p-4 mb-4"
              style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
            >
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-navy font-black text-[36px] leading-none">
                    4.8
                  </p>
                  <div className="flex gap-0.5 justify-center mt-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className="text-amber-400 text-[14px]">
                        ★
                      </span>
                    ))}
                  </div>
                  <p className="text-slate-400 text-[10px] mt-1">428 reviews</p>
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  {[
                    ["Cleanliness", 95],
                    ["Location", 99],
                    ["Staff", 98],
                    ["Value", 94],
                    ["Atmosphere", 97],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-[70px]">
                        {lbl}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${val}%`,
                            background:
                              "linear-gradient(90deg, #3B41C8, #06C4D4)",
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-navy">
                        {(Number(val) / 20).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "flex flex-col gap-3"}>
              {reviews.map((r) => (
                <div
                  key={r.name}
                  className="bg-white rounded-2xl p-4"
                  style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
                        <span className="text-sm">{r.country}</span>
                      </div>
                      <div>
                        <p className="text-navy font-bold text-[13px]">
                          {r.name}
                        </p>
                        <p className="text-slate-400 text-[10px]">{r.date}</p>
                      </div>
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: r.rating }).map((_, i) => (
                        <span key={i} className="text-amber-400 text-[11px]">
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-600 text-[12px] leading-relaxed italic">
                    "{r.text}"
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div
        className="absolute bottom-0 left-0 right-0 p-4 bg-white"
        style={{ boxShadow: "0 -4px 20px rgba(59,65,200,0.1)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-navy font-black text-[20px]">
              $18{" "}
              <span className="text-slate-400 font-medium text-[13px]">
                / night
              </span>
            </p>
            <p className="text-slate-400 text-[11px]">3 nights · $54 total</p>
          </div>
          <div className="flex -space-x-2">
            {["#3B41C8", "#06C4D4", "#FF6347"].map((c) => (
              <div
                key={c}
                className="w-7 h-7 rounded-full border-2 border-white"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <button
          onClick={openStayDateModal}
          className="w-full py-3.5 rounded-2xl text-white font-black text-[15px]"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 20px rgba(59,65,200,0.35)",
          }}
        >
          Add to My Trypo
        </button>
      </div>

      {/* Pick stay dates modal */}
      {showDateModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowDateModal(false)}
        >
          <div
            className="w-full max-w-[360px] bg-white rounded-[28px] p-5 shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-navy">Add stay 📅</h3>
              <button
                onClick={() => setShowDateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-400 text-[12px] mb-4">
              🏨 {stayName} · {stayCity}
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-400 mb-1 block">Check-in</label>
                <input
                  type="date"
                  value={checkIn}
                  min={tripStart || undefined}
                  max={tripEnd || checkOut || undefined}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-brand"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-400 mb-1 block">Check-out</label>
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn || tripStart || undefined}
                  max={tripEnd || undefined}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-brand"
                />
              </div>
            </div>
            {tripStart && tripEnd && (
              <p className="text-slate-400 text-[11px] mt-2">Trip: {tripStart} → {tripEnd}</p>
            )}
            {stayError && <p className="mt-2 text-center text-xs text-red-500">{stayError}</p>}
            <button
              disabled={addingStay || !checkIn}
              onClick={confirmAddStay}
              className="w-full py-3 rounded-xl text-white font-bold text-sm mt-4 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
            >
              {addingStay ? "Adding…" : "Add to Itinerary ✨"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
