
import { useEffect, useState } from "react"
import { getDestinationGuide, searchHotels, type HotelOffer } from "../lib/travelApi"
import { addBooking, addItineraryItem, deleteBooking, deleteItineraryItem, getBookings, getItineraryItems, updateBooking, updateItineraryItem } from "../lib/trips"

export type DestinationHubTarget = {
  city: string
  country?: string
  dates?: string
  startDate?: string
  endDate?: string
  days?: number
}

interface Props {
  destination: DestinationHubTarget | null
  onClose: () => void
  onExploreStay?: (hotelName?: string) => void
  onExploreHiddenGems?: (city: string) => void
}

export default function DestinationHubModal({ destination, onClose, onExploreStay, onExploreHiddenGems }: Props) {
  const [hotels, setHotels] = useState<HotelOffer[]>([])
  const [loadingHotels, setLoadingHotels] = useState(false)

  // ── My notes for this destination ──────────────────────────────────
  const [noteText, setNoteText] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [noteMsg, setNoteMsg] = useState<string | null>(null)
  const [existingNotes, setExistingNotes] = useState<Array<{ id: string; title: string; details: string | null }>>([])
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState("")
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null)

  // ── Manually added stays for this destination ──────────────────────
  const [showStayForm, setShowStayForm] = useState(false)
  const [stayName, setStayName] = useState("")
  const [stayPrice, setStayPrice] = useState("")
  const [stayCheckin, setStayCheckin] = useState("")
  const [stayCheckout, setStayCheckout] = useState("")
  const [stayRef, setStayRef] = useState("")
  const [savingStay, setSavingStay] = useState(false)
  const [stayMsg, setStayMsg] = useState<string | null>(null)
  const [existingStays, setExistingStays] = useState<Array<{ id: string; name: string; detail: string; checkin: string; checkout: string; price: string; ref: string }>>([])
  const [editingStayId, setEditingStayId] = useState<string | null>(null)
  const [editStayName, setEditStayName] = useState("")
  const [editStayCheckin, setEditStayCheckin] = useState("")
  const [editStayCheckout, setEditStayCheckout] = useState("")
  const [editStayPrice, setEditStayPrice] = useState("")
  const [editStayRef, setEditStayRef] = useState("")
  const [busyStayId, setBusyStayId] = useState<string | null>(null)

  const city = destination?.city || ""
  const country = destination?.country || ""
  const encodedCity = encodeURIComponent(country ? `${city}, ${country}` : city)
  const encodedRawCity = encodeURIComponent(city)

  // Booking & accommodation links
  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodedCity}${
    destination?.startDate && destination?.endDate
      ? `&checkin=${destination.startDate}&checkout=${destination.endDate}`
      : ""
  }`
  const getYourGuideUrl = `https://www.getyourguide.com/s/?q=${encodedRawCity}`
  const airbnbUrl = `https://www.airbnb.com/s/${encodedCity}/homes`
  const hostelworldUrl = `https://www.hostelworld.com/search?search=${encodedRawCity}`
  const viatorUrl = `https://www.viator.com/searchResults/all?search=${encodedRawCity}`
  const skyscannerUrl = `https://www.skyscanner.com/transport/flights/anywhere/${encodedRawCity}/`
  const tripAdvisorUrl = `https://www.tripadvisor.com/Search?q=${encodedCity}`
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedCity}+hotels+attractions`

  // Fetch live best hotels for this city with fallback
  useEffect(() => {
    if (!city) return
    let active = true

    async function loadBestHotels() {
      try {
        setLoadingHotels(true)
        const results = await searchHotels({ city, maxResults: 5 })
        if (!active) return

        if (results && results.length > 0) {
          setHotels(results)
          return
        }
        // No keyed provider data (Amadeus needs API keys): fall back to real
        // OpenStreetMap hotel POIs around the city instead of invented names.
        // Price/rating stay empty so the card shows "Check price" + a
        // Booking.com link rather than fabricated numbers.
        const guide = await getDestinationGuide(city, country)
        if (!active) return
        setHotels(
          guide.hotels.map((h) => ({
            id: h.id,
            name: h.name,
            city,
            country: country || "Travel",
            price: 0,
            currency: "EUR",
            rating: undefined,
            distanceKm: undefined,
            image: undefined,
          })),
        )
      } catch (err) {
        console.warn("Failed to load hotels for hub:", err)
      } finally {
        if (active) setLoadingHotels(false)
      }
    }

    void loadBestHotels()

    return () => {
      active = false
    }
  }, [city, country])

  // Load already-saved notes + manual stays for this city, and prefill
  // stay dates from the destination's own dates.
  useEffect(() => {
    if (!city) return
    let active = true
    setNoteText("")
    setNoteMsg(null)
    setStayMsg(null)
    setShowStayForm(false)
    setEditingNoteId(null)
    setEditingStayId(null)
    setStayCheckin(destination?.startDate?.slice(0, 10) || "")
    setStayCheckout(destination?.endDate?.slice(0, 10) || "")

    async function loadMine() {
      try {
        const items = await getItineraryItems()
        if (!active) return
        const mine = (items || [])
          .filter(
            (it: any) =>
              it?.item_type === "note" &&
              String(it?.location_name || "").toLowerCase() === city.toLowerCase(),
          )
          .map((it: any) => ({ id: it.id, title: it.title, details: it.details }))
        setExistingNotes(mine)
      } catch {
        /* ignore */
      }
      try {
        const bookings = await getBookings()
        if (!active) return
        const needle = city.toLowerCase()
        const mine = (bookings || [])
          .filter((b: any) => {
            if (b?.booking_type !== "stay") return false
            const hay = `${b?.name || ""} ${b?.notes || ""} ${b?.provider || ""}`.toLowerCase()
            return hay.includes(needle)
          })
          .map((b: any) => ({
            id: b.id,
            name: b.name || "Manual stay",
            detail: [
              b.starts_at ? String(b.starts_at).slice(0, 10) : null,
              b.ends_at ? String(b.ends_at).slice(0, 10) : null,
            ]
              .filter(Boolean)
              .join(" → "),
            checkin: b.starts_at ? String(b.starts_at).slice(0, 10) : "",
            checkout: b.ends_at ? String(b.ends_at).slice(0, 10) : "",
            price: b.amount != null ? String(b.amount) : "",
            ref: b.confirmation_code || "",
          }))
        setExistingStays(mine)
      } catch {
        /* ignore */
      }
    }

    void loadMine()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])

  const handleSaveNote = async () => {
    const text = noteText.trim()
    if (!text || savingNote) return
    setSavingNote(true)
    setNoteMsg(null)
    try {
      const created = await addItineraryItem({
        itemType: "note",
        title: `Note — ${city}`,
        details: text,
        locationName: city,
      })
      setExistingNotes((prev) => [{ id: created.id, title: created.title, details: text }, ...prev])
      setNoteText("")
      setNoteMsg("Note saved ✓")
    } catch {
      setNoteMsg("Could not save the note. Try again.")
    } finally {
      setSavingNote(false)
    }
  }

  const handleSaveStay = async () => {
    const name = stayName.trim()
    if (!name || savingStay) return
    setSavingStay(true)
    setStayMsg(null)
    try {
      const startsAt = stayCheckin ? new Date(`${stayCheckin}T14:00:00`).toISOString() : null
      const endsAt = stayCheckout || stayCheckin
        ? new Date(`${stayCheckout || stayCheckin}T11:00:00`).toISOString()
        : null
      const amount = Number(String(stayPrice).replace(/[^\d.]/g, "")) || null
      const item = await addItineraryItem({
        itemType: "stay",
        title: name,
        details: `Manual stay in ${city}${stayRef.trim() ? ` · Ref ${stayRef.trim()}` : ""}${stayCheckin ? ` · ${stayCheckin}${stayCheckout && stayCheckout !== stayCheckin ? ` → ${stayCheckout}` : ""}` : ""}`,
        locationName: city,
        startsAt,
        endsAt,
        estimatedCost: amount,
        currency: "EUR",
      })
      const created = await addBooking({
        bookingType: "stay",
        provider: "Manual entry",
        name,
        confirmationCode: stayRef.trim() || name,
        status: "booked",
        startsAt,
        endsAt,
        amount,
        currency: "EUR",
        notes: `Manual stay in ${city}${stayRef.trim() ? ` — Ref ${stayRef.trim()}` : ""}`,
        itineraryItemId: item.id,
      })
      setExistingStays((prev) => [
        {
          id: created.id,
          name,
          detail: [stayCheckin || null, stayCheckout || null].filter(Boolean).join(" → "),
          checkin: stayCheckin || "",
          checkout: stayCheckout || "",
          price: stayPrice.trim(),
          ref: stayRef.trim(),
        },
        ...prev,
      ])
      setStayName("")
      setStayPrice("")
      setStayRef("")
      setShowStayForm(false)
      setStayMsg("Stay saved ✓")
    } catch {
      setStayMsg("Could not save the stay. Try again.")
    } finally {
      setSavingStay(false)
    }
  }

  // ── Edit / delete a saved note ─────────────────────────────────────
  const startEditNote = (id: string, text: string | null) => {
    setEditingNoteId(id)
    setEditingNoteText(text || "")
  }

  const saveEditNote = async (id: string) => {
    const text = editingNoteText.trim()
    if (!text || busyNoteId) return
    setBusyNoteId(id)
    try {
      const current = existingNotes.find((n) => n.id === id)
      await updateItineraryItem(id, {
        item_type: "note",
        title: current?.title || `Note — ${city}`,
        details: text,
      })
      setExistingNotes((prev) => prev.map((n) => (n.id === id ? { ...n, details: text } : n)))
      setEditingNoteId(null)
    } catch {
      setNoteMsg("Could not update the note. Try again.")
    } finally {
      setBusyNoteId(null)
    }
  }

  const removeNote = async (id: string) => {
    if (busyNoteId) return
    if (!window.confirm("Delete this note?")) return
    setBusyNoteId(id)
    try {
      await deleteItineraryItem(id)
      setExistingNotes((prev) => prev.filter((n) => n.id !== id))
      if (editingNoteId === id) setEditingNoteId(null)
    } catch {
      setNoteMsg("Could not delete the note. Try again.")
    } finally {
      setBusyNoteId(null)
    }
  }

  // ── Edit / delete a saved manual stay ──────────────────────────────
  const startEditStay = (s: { id: string; name: string; checkin: string; checkout: string; price: string; ref: string }) => {
    setEditingStayId(s.id)
    setEditStayName(s.name)
    setEditStayCheckin(s.checkin)
    setEditStayCheckout(s.checkout)
    setEditStayPrice(s.price)
    setEditStayRef(s.ref)
  }

  const saveEditStay = async (id: string) => {
    const name = editStayName.trim()
    if (!name || busyStayId) return
    setBusyStayId(id)
    try {
      const startsAt = editStayCheckin ? new Date(`${editStayCheckin}T14:00:00`).toISOString() : null
      const endsAt = editStayCheckout || editStayCheckin
        ? new Date(`${editStayCheckout || editStayCheckin}T11:00:00`).toISOString()
        : null
      const amount = Number(String(editStayPrice).replace(/[^\d.]/g, "")) || null
      const ref = editStayRef.trim()
      await updateBooking(id, {
        name,
        starts_at: startsAt,
        ends_at: endsAt,
        amount,
        currency: "EUR",
        confirmation_code: ref || name,
        notes: `Manual stay in ${city}${ref ? ` — Ref ${ref}` : ""}`,
      })
      setExistingStays((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                name,
                detail: [editStayCheckin || null, editStayCheckout || null].filter(Boolean).join(" → "),
                checkin: editStayCheckin,
                checkout: editStayCheckout,
                price: editStayPrice.trim(),
                ref,
              }
            : s,
        ),
      )
      setEditingStayId(null)
      setStayMsg("Stay updated ✓")
    } catch {
      setStayMsg("Could not update the stay. Try again.")
    } finally {
      setBusyStayId(null)
    }
  }

  const removeStay = async (id: string) => {
    if (busyStayId) return
    if (!window.confirm("Delete this stay?")) return
    setBusyStayId(id)
    try {
      await deleteBooking(id)
      setExistingStays((prev) => prev.filter((s) => s.id !== id))
      if (editingStayId === id) setEditingStayId(null)
    } catch {
      setStayMsg("Could not delete the stay. Try again.")
    } finally {
      setBusyStayId(null)
    }
  }

  if (!destination) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center md:items-center md:p-8"
      style={{
        background: "rgba(10, 10, 46, 0.65)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-[32px] md:rounded-[28px] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-250 shadow-2xl"
        style={{
          maxWidth: "430px",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center flex-shrink-0">
          <div className="w-10 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {/* Modal Header */}
        <div className="px-5 pt-2 pb-3.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(59,65,200,0.12), rgba(6,196,212,0.15))" }}
            >
              📍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-navy font-black text-[18px] leading-tight">{city}</h3>
                {destination.days && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand/10 text-brand">
                    {destination.days} {destination.days > 1 ? "days" : "day"}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-[12px] font-medium">
                {destination.dates || "Explore booking, activities & hotels"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 font-bold flex items-center justify-center transition-colors cursor-pointer text-base"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Section: My notes for this destination */}
          <div className="p-3.5 rounded-2xl border border-amber-200/70 bg-amber-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-600">
                📝 My notes — {city}
              </span>
              {existingNotes.length > 0 && (
                <span className="text-[10px] font-bold text-amber-500">
                  {existingNotes.length} saved
                </span>
              )}
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={`e.g. Must-see spots, food to try, reminders for ${city}…`}
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-[13px] font-medium text-navy outline-none resize-none bg-white"
              style={{ border: "1.5px solid #fde68a" }}
            />
            <button
              type="button"
              onClick={handleSaveNote}
              disabled={!noteText.trim() || savingNote}
              className="mt-2 w-full py-2.5 rounded-xl font-bold text-[12px] transition-all disabled:opacity-50"
              style={{ background: "#f59e0b", color: "white" }}
            >
              {savingNote ? "Saving…" : "+ Add note"}
            </button>
            {noteMsg && <p className="mt-1.5 text-[11px] font-bold text-amber-600">{noteMsg}</p>}
            {existingNotes.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {existingNotes.slice(0, 3).map((n) => (
                  <div key={n.id} className="px-3 py-2 rounded-xl bg-white border border-amber-100">
                    {editingNoteId === n.id ? (
                      <div>
                        <textarea
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg px-2.5 py-2 text-[12px] font-medium text-navy outline-none resize-none bg-amber-50/60"
                          style={{ border: "1.5px solid #fde68a" }}
                        />
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            className="px-3 py-1.5 rounded-lg font-bold text-[11px] bg-slate-100 text-slate-500"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEditNote(n.id)}
                            disabled={!editingNoteText.trim() || busyNoteId === n.id}
                            className="flex-1 py-1.5 rounded-lg font-bold text-[11px] text-white disabled:opacity-50"
                            style={{ background: "#f59e0b" }}
                          >
                            {busyNoteId === n.id ? "Saving…" : "Save ✓"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-navy text-[12px] font-semibold leading-snug flex-1">{n.details}</p>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditNote(n.id, n.details)}
                            className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 font-bold text-[12px] hover:bg-amber-100"
                            aria-label="Edit note"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeNote(n.id)}
                            disabled={busyNoteId === n.id}
                            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 font-bold text-[12px] hover:bg-red-100 disabled:opacity-50"
                            aria-label="Delete note"
                            title="Delete"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: My stays for this destination */}
          <div className="p-3.5 rounded-2xl border border-teal-200/70 bg-teal-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-teal-700">
                🏨 My stays — {city}
              </span>
              {existingStays.length > 0 && (
                <span className="text-[10px] font-bold text-teal-600">
                  {existingStays.length} added
                </span>
              )}
            </div>
            {existingStays.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {existingStays.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="px-3 py-2 rounded-xl bg-white border border-teal-100"
                  >
                    {editingStayId === s.id ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editStayName}
                          onChange={(e) => setEditStayName(e.target.value)}
                          placeholder="Hotel / Airbnb name *"
                          className="w-full rounded-lg px-2.5 py-2 text-[12px] font-semibold text-navy outline-none bg-teal-50/60"
                          style={{ border: "1.5px solid #99f6e4" }}
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="date"
                            value={editStayCheckin}
                            onChange={(e) => setEditStayCheckin(e.target.value)}
                            className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-navy outline-none bg-teal-50/60"
                            style={{ border: "1.5px solid #99f6e4" }}
                          />
                          <input
                            type="date"
                            value={editStayCheckout}
                            min={editStayCheckin || undefined}
                            onChange={(e) => setEditStayCheckout(e.target.value)}
                            className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-navy outline-none bg-teal-50/60"
                            style={{ border: "1.5px solid #99f6e4" }}
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={editStayPrice}
                            onChange={(e) => setEditStayPrice(e.target.value)}
                            placeholder="Price €"
                            inputMode="decimal"
                            className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-navy outline-none bg-teal-50/60"
                            style={{ border: "1.5px solid #99f6e4" }}
                          />
                          <input
                            type="text"
                            value={editStayRef}
                            onChange={(e) => setEditStayRef(e.target.value)}
                            placeholder="Ref"
                            className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-navy outline-none bg-teal-50/60"
                            style={{ border: "1.5px solid #99f6e4" }}
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingStayId(null)}
                            className="px-3 py-1.5 rounded-lg font-bold text-[11px] bg-slate-100 text-slate-500"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveEditStay(s.id)}
                            disabled={!editStayName.trim() || busyStayId === s.id}
                            className="flex-1 py-1.5 rounded-lg font-bold text-[11px] text-white disabled:opacity-50"
                            style={{ background: "#0d9488" }}
                          >
                            {busyStayId === s.id ? "Saving…" : "Save ✓"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-navy text-[12px] font-bold truncate">{s.name}</p>
                          {s.detail && (
                            <p className="text-teal-600 text-[10px] font-semibold">{s.detail}</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditStay(s)}
                            className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 font-bold text-[12px] hover:bg-teal-100"
                            aria-label="Edit stay"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeStay(s.id)}
                            disabled={busyStayId === s.id}
                            className="w-7 h-7 rounded-lg bg-red-50 text-red-500 font-bold text-[12px] hover:bg-red-100 disabled:opacity-50"
                            aria-label="Delete stay"
                            title="Delete"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!showStayForm ? (
              <button
                type="button"
                onClick={() => setShowStayForm(true)}
                className="w-full py-2.5 rounded-xl font-bold text-[12px] transition-all"
                style={{ background: "#0d9488", color: "white" }}
              >
                + Add a stay manually
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={stayName}
                  onChange={(e) => setStayName(e.target.value)}
                  placeholder="Hotel / Airbnb name *"
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold text-navy outline-none bg-white"
                  style={{ border: "1.5px solid #99f6e4" }}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-teal-700 block mb-1">Check-in</label>
                    <input
                      type="date"
                      value={stayCheckin}
                      onChange={(e) => setStayCheckin(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-navy outline-none bg-white"
                      style={{ border: "1.5px solid #99f6e4" }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-teal-700 block mb-1">Check-out</label>
                    <input
                      type="date"
                      value={stayCheckout}
                      min={stayCheckin || undefined}
                      onChange={(e) => setStayCheckout(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-navy outline-none bg-white"
                      style={{ border: "1.5px solid #99f6e4" }}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={stayPrice}
                    onChange={(e) => setStayPrice(e.target.value)}
                    placeholder="Price € (optional)"
                    inputMode="decimal"
                    className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-navy outline-none bg-white"
                    style={{ border: "1.5px solid #99f6e4" }}
                  />
                  <input
                    type="text"
                    value={stayRef}
                    onChange={(e) => setStayRef(e.target.value)}
                    placeholder="Ref (optional)"
                    className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-navy outline-none bg-white"
                    style={{ border: "1.5px solid #99f6e4" }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStayForm(false)}
                    className="px-4 py-2.5 rounded-xl font-bold text-[12px] bg-white text-slate-500 border border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStay}
                    disabled={!stayName.trim() || savingStay}
                    className="flex-1 py-2.5 rounded-xl font-bold text-[12px] transition-all disabled:opacity-50"
                    style={{ background: "#0d9488", color: "white" }}
                  >
                    {savingStay ? "Saving…" : "Save stay ✓"}
                  </button>
                </div>
              </div>
            )}
            {stayMsg && <p className="mt-1.5 text-[11px] font-bold text-teal-700">{stayMsg}</p>}
          </div>

          {/* Section 1: Travel & Activity Platforms */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                🚀 Travel & Activity Links
              </span>
              <span className="text-[10px] text-slate-400 font-bold">Opens in new tab</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Booking.com */}
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-blue-50/60 hover:border-blue-200 transition-all group shadow-xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#003580] flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-xs">
                  B.
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-navy font-bold text-[13px] group-hover:text-blue-700 truncate">
                      Booking.com
                    </p>
                    <span className="text-[10px] text-slate-300 group-hover:text-blue-400">↗</span>
                  </div>
                  <p className="text-slate-400 text-[10px] truncate">Stays & hotels</p>
                </div>
              </a>

              {/* GetYourGuide */}
              <a
                href={getYourGuideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-orange-50/60 hover:border-orange-200 transition-all group shadow-xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FF5533] flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-xs">
                  🎟️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-navy font-bold text-[13px] group-hover:text-orange-600 truncate">
                      GetYourGuide
                    </p>
                    <span className="text-[10px] text-slate-300 group-hover:text-orange-400">↗</span>
                  </div>
                  <p className="text-slate-400 text-[10px] truncate">Tours & passes</p>
                </div>
              </a>

              {/* Airbnb */}
              <a
                href={airbnbUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-rose-50/60 hover:border-rose-200 transition-all group shadow-xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FF385C] flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-xs">
                  🏠
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-navy font-bold text-[13px] group-hover:text-rose-600 truncate">
                      Airbnb
                    </p>
                    <span className="text-[10px] text-slate-300 group-hover:text-rose-400">↗</span>
                  </div>
                  <p className="text-slate-400 text-[10px] truncate">Homes & villas</p>
                </div>
              </a>

              {/* Viator */}
              <a
                href={viatorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-emerald-50/60 hover:border-emerald-200 transition-all group shadow-xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#008768] flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-xs">
                  🧭
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-navy font-bold text-[13px] group-hover:text-emerald-700 truncate">
                      Viator
                    </p>
                    <span className="text-[10px] text-slate-300 group-hover:text-emerald-400">↗</span>
                  </div>
                  <p className="text-slate-400 text-[10px] truncate">Guided trips</p>
                </div>
              </a>

              {/* Hostelworld */}
              <a
                href={hostelworldUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-amber-50/60 hover:border-amber-200 transition-all group shadow-xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#F15A24] flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-xs">
                  🛏️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-navy font-bold text-[13px] group-hover:text-amber-700 truncate">
                      Hostelworld
                    </p>
                    <span className="text-[10px] text-slate-300 group-hover:text-amber-400">↗</span>
                  </div>
                  <p className="text-slate-400 text-[10px] truncate">Budget & social</p>
                </div>
              </a>

              {/* Google Maps / City Overview */}
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-teal-50/60 hover:border-teal-200 transition-all group shadow-xs"
              >
                <div className="w-9 h-9 rounded-xl bg-[#34A853] flex items-center justify-center text-white text-sm font-black flex-shrink-0 shadow-xs">
                  🗺️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-navy font-bold text-[13px] group-hover:text-teal-700 truncate">
                      Google Maps
                    </p>
                    <span className="text-[10px] text-slate-300 group-hover:text-teal-400">↗</span>
                  </div>
                  <p className="text-slate-400 text-[10px] truncate">Explore nearby</p>
                </div>
              </a>
            </div>
          </div>

          {/* Section: Hidden Gems in this Destination */}
          <div
            onClick={() => {
              if (typeof window !== "undefined") {
                localStorage.setItem("trypo_hidden_gems_target_city", city)
              }
              onClose()
              if (onExploreHiddenGems) {
                onExploreHiddenGems(city)
              }
            }}
            className="p-3.5 rounded-2xl border border-brand/20 bg-gradient-to-r from-brand/5 via-cyan-500/5 to-purple-500/5 hover:from-brand/10 hover:to-cyan-500/10 transition-all cursor-pointer flex items-center justify-between group shadow-xs"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center text-lg font-black shadow-xs flex-shrink-0">
                💎
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="text-navy font-black text-sm group-hover:text-brand transition-colors truncate">
                    Hidden Gems in {city}
                  </h4>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                    Multi-Source
                  </span>
                </div>
                <p className="text-slate-500 text-[11px] truncate">
                  Atlas Obscura, Wikivoyage & OpenStreetMap secrets
                </p>
              </div>
            </div>
            <span className="text-brand font-black text-sm group-hover:translate-x-0.5 transition-transform flex-shrink-0 ml-2">
              Explore →
            </span>
          </div>

          {/* Section 2: Best Hotels in Destination */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                🏨 Best Hotels in {city}
              </span>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-brand hover:underline flex items-center gap-0.5"
              >
                View all on Booking ↗
              </a>
            </div>

            {loadingHotels && (
              <div className="py-8 flex flex-col items-center justify-center gap-2 bg-slate-50/60 rounded-2xl">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 text-[11px] font-semibold">Finding best stays in {city}…</p>
              </div>
            )}

            {!loadingHotels && hotels.length === 0 && (
              <div className="py-6 px-4 text-center bg-slate-50/60 rounded-2xl">
                <p className="text-slate-500 text-[12px] font-bold mb-1">
                  No stays found for {city} yet
                </p>
                <p className="text-slate-400 text-[11px]">
                  Try the Booking.com search above for live availability.
                </p>
              </div>
            )}

            {!loadingHotels && hotels.length > 0 && (
              <div className="space-y-2.5">
                {hotels.map((hotel) => (
                  <div
                    key={hotel.id}
                    className="p-3 rounded-2xl bg-white border border-slate-100 flex items-center gap-3 shadow-xs hover:shadow-md transition-all hover:border-brand/30"
                  >
                    <img
                      src={
                        hotel.image ||
                        "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300&h=200&fit=crop&auto=format"
                      }
                      alt={hotel.name}
                      className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-slate-100"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className="text-navy font-bold text-[13px] truncate">{hotel.name}</h4>
                        {hotel.rating && (
                          <span className="px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-600 font-black text-[10px] flex items-center gap-0.5 flex-shrink-0">
                            ★ {hotel.rating.toFixed(1)}
                          </span>
                        )}
                      </div>

                      <p className="text-slate-400 text-[11px] truncate flex items-center gap-1">
                        <span>📍 {hotel.city}</span>
                        {hotel.distanceKm && <span>· {hotel.distanceKm} km from center</span>}
                      </p>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-brand font-black text-[12px]">
                          {hotel.price > 0 ? `~${hotel.price} ${hotel.currency || "EUR"} / night` : "Check price"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <a
                        href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(
                          `${hotel.name}, ${city}`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-brand text-white font-bold text-[11px] text-center hover:opacity-90 active:scale-95 transition-all shadow-xs"
                      >
                        Book ↗
                      </a>
                      {onExploreStay && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose()
                            onExploreStay(hotel.name)
                          }}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 font-bold text-[10px] hover:bg-slate-200 active:scale-95 transition-all"
                        >
                          View in App
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 rounded-2xl text-white font-black text-[13px] text-center flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
              boxShadow: "0 4px 14px rgba(59,65,200,0.3)",
            }}
          >
            Search on Booking ↗
          </a>
        </div>
      </div>
    </div>
  )
}

