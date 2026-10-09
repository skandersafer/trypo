import { useState, useRef, useEffect } from "react"
import type { Screen, BookingType } from "../App"
import { useAuth } from "../lib/auth"
import { getTripDetails } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  openBooking: (type: BookingType) => void
}

const categories = [
  "All",
  "✈️ Flights",
  "🏨 Stays",
  "🚆 Transport",
  "🎟 Activities",
]

const statusStyle: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "rgba(5,150,105,0.1)", text: "#059669" },
  booked: { bg: "rgba(59,65,200,0.1)", text: "#3B41C8" },
  pending: { bg: "rgba(217,119,6,0.1)", text: "#d97706" },
}

const typeToBookingType: Record<string, "flight" | "stay" | "transport" | "activity"> =
  {
    flight: "flight",
    stay: "stay",
    transport: "transport",
    activity: "activity",
  }

export default function BookingsScreen({ navigate, openBooking, goBack }: Props) {
  const { configured, user } = useAuth()
  const isDesktop = useIsDesktop()
  const [activeCategory, setActiveCategory] = useState(0)
  const [uploadName, setUploadName] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const [bookingsList, setBookingsList] = useState<any[]>([])
  const [tripTitle, setTripTitle] = useState<string>("My Trip")
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true

    async function loadBookings() {
      if (!configured || !user) {
        if (active) {
          setLoading(false)
          setBookingsList([])
        }
        return
      }

      setLoading(true)

      try {
        const tripData = await getTripDetails()
        if (!active) return

        if (tripData && (tripData.bookings || []).length > 0) {
          setTripTitle(tripData.title || "My Trip")
          const destinations = tripData.trip_destinations || []
          const destMap: Record<string, string> = {}
          destinations.forEach((d: any) => {
            if (d?.id && d?.city) {
              destMap[String(d.id)] = d.city
              destMap[String(d.id).toLowerCase()] = d.city
            }
          })

          const items = tripData.bookings || []
          const mapped = items.map((b: any) => {
            let bookingName = b.title || b.name || b.notes || "Booking"
            Object.entries(destMap).forEach(([id, city]) => {
              if (id && city) {
                bookingName = bookingName.replaceAll(id, city)
                bookingName = bookingName.replaceAll(id.toUpperCase(), city)
                bookingName = bookingName.replaceAll(id.toLowerCase(), city)
              }
            })
            return {
              id: b.id,
              type: b.booking_type || "flight",
              icon:
                b.booking_type === "stay"
                  ? "🏨"
                  : b.booking_type === "transport"
                    ? "🚆"
                    : b.booking_type === "activity"
                      ? "🎟"
                      : "✈️",
              name: bookingName,
              provider: b.provider || b.vendor_name || "Direct",
              date: b.starts_at ? new Date(b.starts_at).toLocaleDateString() : "Date TBD",
              price: b.amount ? `${b.amount} ${b.currency || "EUR"}` : "Free",
              ref: b.confirmation_code || b.booking_reference || b.ref || "N/A",
              status: b.status || "confirmed",
            }
          })
          setBookingsList(mapped)
          setLoading(false)
          return
        }

        setBookingsList([])
      } catch {
        if (active) {
          setBookingsList([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadBookings()
    return () => {
      active = false
    }
  }, [configured, user])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadName(file.name)
      setTimeout(() => {
        setUploaded(true)
      }, 800)
    }
  }

  const filtered =
    activeCategory === 0
      ? bookingsList
      : bookingsList.filter((b) =>
          categories[activeCategory].toLowerCase().includes(b.type),
        )

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-5">
        <button
          onClick={() => goBack("trip-overview")}
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
          <h1 className="text-[20px] font-black text-navy">My Bookings</h1>
          <p className="text-slate-400 text-[12px]">
            {tripTitle} · {bookingsList.length} bookings
          </p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 px-5 md:px-8 mb-5 overflow-x-auto pb-1">
        {categories.map((cat, i) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(i)}
            className="flex-shrink-0 px-3 py-2 rounded-full text-[11px] font-bold transition-all"
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

      {/* Booking cards */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-6" : "px-5 flex flex-col gap-3 pb-6"}>
        {loading ? (
          <div className="bg-white rounded-[22px] p-8 text-center shadow-sm">
            <p className="text-slate-400 text-sm">Loading bookings...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-[22px] p-8 text-center shadow-sm">
            <span className="text-4xl mb-3 block">🎫</span>
            <h3 className="text-navy font-bold text-[15px]">No bookings added yet</h3>
            <p className="text-slate-400 text-[12px] mt-1">
              Upload your booking PDF or ticket to get started
            </p>
          </div>
        ) : (
          filtered.map((b, i) => {
            const s = statusStyle[b.status] || statusStyle.confirmed
            return (
              <div
                key={b.id || i}
                className="bg-white rounded-[22px] overflow-hidden"
                style={{ boxShadow: "0 4px 16px rgba(59,65,200,0.08)" }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                        style={{ background: "rgba(59,65,200,0.07)" }}
                      >
                        {b.icon}
                      </div>
                      <div>
                        <h3 className="text-navy font-bold text-[14px]">
                          {b.name}
                        </h3>
                        <p className="text-slate-400 text-[11px]">{b.provider}</p>
                      </div>
                    </div>
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-black capitalize"
                      style={{ background: s.bg, color: s.text }}
                    >
                      {b.status}
                    </span>
                  </div>

                  <div className="flex gap-4 pt-2 border-t border-slate-50">
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Date
                      </p>
                      <p className="text-navy font-semibold text-[12px]">
                        {b.date}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Ref
                      </p>
                      <p className="text-navy font-semibold text-[12px] font-mono">
                        {b.ref}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-[10px] text-slate-400 font-medium">
                        Price
                      </p>
                      <p className="text-navy font-black text-[15px]">
                        {b.price}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      openBooking(typeToBookingType[b.type] ?? "flight")
                    }
                    className="w-full mt-3 py-2 rounded-xl text-[12px] font-bold"
                    style={{
                      background: "rgba(59,65,200,0.07)",
                      color: "#3B41C8",
                    }}
                  >
                    View Details →
                  </button>
                </div>
              </div>
            )
          })
        )}

        {/* Upload booking */}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={handleFile}
        />
        {uploaded && uploadName ? (
          <div
            className="w-full py-4 rounded-2xl flex items-center gap-3 px-4 mt-2"
            style={{
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            <span className="text-xl">📄</span>
            <div className="flex-1 min-w-0">
              <p className="text-green-600 font-bold text-[13px] truncate">
                {uploadName}
              </p>
              <p className="text-green-500 text-[11px]">
                ✓ Booking uploaded successfully
              </p>
            </div>
            <button
              onClick={() => {
                setUploaded(false)
                setUploadName(null)
              }}
              className="text-slate-300 text-xl leading-none"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-4 rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2 mt-2"
            style={{
              border: "2px dashed #3B41C8",
              color: "#3B41C8",
              background: "rgba(59,65,200,0.03)",
            }}
          >
            {uploadName ? "⏳ Uploading…" : "📎 Upload Booking (PDF or Image)"}
          </button>
        )}
      </div>
    </div>
  )
}
