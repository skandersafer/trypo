import { useState, useEffect, useRef } from "react"
import type { Screen } from "../App"
import { getTripDetails, togglePackingItem, addPackingItem, deletePackingItem, getActiveTripId } from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Item = { id: string | number; label: string; packed: boolean; category: string }

const categories = [
  "All",
  "Documents",
  "Clothing",
  "Toiletries",
  "Tech",
  "Gear",
]

function SwipeablePackingRow({
  item,
  onToggle,
  onDelete,
}: {
  item: Item
  onToggle: (id: string | number) => void
  onDelete: (id: string | number) => void
}) {
  const [offsetX, setOffsetX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const startXRef = useRef<number | null>(null)
  const currentOffsetRef = useRef<number>(0)

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return
    const diff = e.touches[0].clientX - startXRef.current
    if (diff < 0) {
      const clamped = Math.max(-100, diff)
      currentOffsetRef.current = clamped
      setOffsetX(clamped)
    } else {
      const clamped = Math.min(0, currentOffsetRef.current + diff)
      setOffsetX(clamped)
    }
  }

  const handleTouchEnd = () => {
    setIsSwiping(false)
    startXRef.current = null
    if (currentOffsetRef.current <= -50) {
      setOffsetX(-80)
      currentOffsetRef.current = -80
    } else {
      setOffsetX(0)
      currentOffsetRef.current = 0
    }
  }

  // Mouse drag support for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("button")) return

    startXRef.current = e.clientX
    setIsSwiping(true)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (startXRef.current === null) return
      const diff = moveEvent.clientX - startXRef.current
      if (diff < 0) {
        const clamped = Math.max(-100, diff)
        currentOffsetRef.current = clamped
        setOffsetX(clamped)
      } else {
        const clamped = Math.min(0, currentOffsetRef.current + diff)
        setOffsetX(clamped)
      }
    }

    const handleMouseUp = () => {
      setIsSwiping(false)
      startXRef.current = null
      if (currentOffsetRef.current <= -50) {
        setOffsetX(-80)
        currentOffsetRef.current = -80
      } else {
        setOffsetX(0)
        currentOffsetRef.current = 0
      }
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-red-500 shadow-sm select-none">
      {/* Background Action: Delete Button */}
      <div className="absolute inset-y-0 right-0 w-[80px] flex items-center justify-center bg-red-500 text-white">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(item.id)
          }}
          className="w-full h-full flex flex-col items-center justify-center gap-1 font-bold text-[11px] active:bg-red-600"
        >
          <span className="text-lg">🗑️</span>
          <span>Delete</span>
        </button>
      </div>

      {/* Foreground Swipeable Card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
          boxShadow: "0 2px 6px rgba(59,65,200,0.06)",
        }}
        className="relative bg-white flex items-center gap-3 px-4 py-3.5 cursor-grab active:cursor-grabbing"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (offsetX < -20) {
              setOffsetX(0)
              currentOffsetRef.current = 0
            } else {
              onToggle(item.id)
            }
          }}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: item.packed
                ? "linear-gradient(135deg, #3B41C8, #06C4D4)"
                : "transparent",
              border: item.packed ? "none" : "2px solid #e2e8f0",
            }}
          >
            {item.packed && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-5"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <span
            className="text-[14px] font-semibold flex-1 transition-colors"
            style={{
              color: item.packed ? "#94a3b8" : "#0D0F2E",
              textDecoration: item.packed ? "line-through" : "none",
            }}
          >
            {item.label}
          </span>
        </button>

        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: "rgba(59,65,200,0.07)", color: "#3B41C8" }}
        >
          {item.category}
        </span>

        {/* Hint arrow */}
        <span className="text-[11px] text-slate-300 pointer-events-none pl-1">
          ‹
        </span>
      </div>
    </div>
  )
}

export default function PackingListScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [items, setItems] = useState<Item[]>([])
  const [tripTitle, setTripTitle] = useState<string>("My Trip")
  const [currentTripId, setCurrentTripId] = useState<string>("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [newItem, setNewItem] = useState("")
  const [loading, setLoading] = useState(true)

  const isSelfUpdatingRef = useRef(false)

  const loadPacking = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const targetId = currentTripId || getActiveTripId()
      const tripData = await getTripDetails(targetId)
      if (!tripData) {
        setItems([])
        return
      }
      setCurrentTripId(tripData.id)
      setTripTitle(tripData.title || "My Trip")
      const rawItems = tripData.packing_items || []
      const mapped: Item[] = rawItems.map((p: any) => ({
        id: String(p.id),
        label: p.label || p.item_name || p.name || "Item",
        packed: Boolean(p.is_packed || p.packed),
        category: p.category || "Gear",
      }))
      setItems((prev) => {
        const existingIds = new Set(mapped.map((m) => String(m.id)))
        const unmerged = prev.filter((p) => !existingIds.has(String(p.id)))
        return [...unmerged, ...mapped]
      })
    } catch (e) {
      console.error("Error loading packing list:", e)
    } finally {
      if (isInitial) setLoading(false)
    }
  }

  useEffect(() => {
    void loadPacking(true)
    const onDbChange = () => {
      if (isSelfUpdatingRef.current) return
      void loadPacking(false)
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    return () => window.removeEventListener("trypo:db_changed", onDbChange)
  }, [])

  const toggle = async (id: string | number) => {
    setItems((prev) =>
      prev.map((item) =>
        String(item.id) === String(id) ? { ...item, packed: !item.packed } : item,
      ),
    )
    await togglePackingItem(String(id), currentTripId)
  }

  const handleDelete = async (id: string | number) => {
    setItems((prev) => prev.filter((item) => String(item.id) !== String(id)))
    await deletePackingItem(String(id), currentTripId)
  }

  const addItem = async () => {
    const text = newItem.trim()
    if (!text) return

    const cat = activeCategory === "All" ? "Gear" : activeCategory
    setNewItem("")

    const tempId = "pk-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6)
    const optimisticItem: Item = {
      id: tempId,
      label: text,
      packed: false,
      category: cat,
    }
    setItems((prev) => [optimisticItem, ...prev])

    isSelfUpdatingRef.current = true
    try {
      const added = await addPackingItem({
        tripId: currentTripId,
        category: cat,
        itemName: text,
      })
      if (added && added.id) {
        setItems((prev) =>
          prev.map((it) => (it.id === tempId ? { ...it, id: String(added.id) } : it)),
        )
      }
    } catch (e) {
      console.error("Failed to add packing item:", e)
    } finally {
      setTimeout(() => {
        isSelfUpdatingRef.current = false
      }, 500)
    }
  }

  const matchesCategory = (itemCat: string, selectedCat: string) => {
    if (selectedCat === "All") return true
    const c1 = (itemCat || "").toLowerCase()
    const c2 = selectedCat.toLowerCase()
    if (c1 === c2) return true
    if (c2 === "clothing" && (c1.includes("vêtement") || c1.includes("vetement") || c1.includes("cloth") || c1.includes("habit"))) return true
    if (c2 === "toiletries" && (c1.includes("sant") || c1.includes("toilet") || c1.includes("hygi") || c1.includes("soin"))) return true
    if (c2 === "gear" && (c1.includes("équip") || c1.includes("equip") || c1.includes("général") || c1.includes("general") || c1.includes("gear") || c1.includes("autre") || c1.includes("other"))) return true
    if (c2 === "documents" && (c1.includes("doc") || c1.includes("papier") || c1.includes("passeport") || c1.includes("billet"))) return true
    if (c2 === "tech" && (c1.includes("tech") || c1.includes("électro") || c1.includes("electro"))) return true
    return false
  }

  const filtered = items.filter((i) => matchesCategory(i.category, activeCategory))
  const packed = items.filter((i) => i.packed).length
  const total = items.length
  const pct = total > 0 ? Math.round((packed / total) * 100) : 0

  return (
    <div className="min-h-full bg-surface pb-6">
      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-5">
        <div>
          <h1 className="text-[20px] font-black text-navy">Packing List</h1>
          <p className="text-slate-400 text-[12px]">{tripTitle}</p>
        </div>
      </div>

      {/* Progress Card */}
      <div
        className="mx-5 md:mx-8 mb-5 rounded-[22px] p-4"
        style={{
          background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
          boxShadow: "0 8px 24px rgba(59,65,200,0.3)",
        }}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-white/70 text-[11px] font-medium mb-0.5">
              Packing progress
            </p>
            <p className="text-white font-black text-[28px]">{pct}%</p>
            <p className="text-white/60 text-[12px]">
              {packed} of {total} items packed
            </p>
          </div>
          <div className="relative w-16 h-16">
            <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="8"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeDasharray={`${(pct / 100) * 163} 163`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg">
              🧳
            </span>
          </div>
        </div>

        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 px-5 md:px-8 mb-4 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all active:scale-95"
            style={{
              background: activeCategory === cat ? "#3B41C8" : "white",
              color: activeCategory === cat ? "white" : "#64748b",
              boxShadow:
                activeCategory === cat
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items & Swipe Instructions */}
      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8" : "px-5 flex flex-col gap-2.5"}>
        <div className={isDesktop ? "flex items-center justify-between px-1 lg:col-span-2" : "flex items-center justify-between px-1"}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Items ({filtered.length})
          </p>
          <span className="text-[10px] text-slate-400 font-medium">
            ← Glisser vers la gauche pour supprimer
          </span>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-slate-400 text-sm">Chargement de la liste...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <span className="text-3xl mb-2 block">🧳</span>
            <p className="text-navy font-bold text-sm">Aucun article dans cette catégorie</p>
            <p className="text-slate-400 text-xs mt-1">Ajoutez un article ci-dessous</p>
          </div>
        ) : (
          filtered.map((item) => (
            <SwipeablePackingRow
              key={item.id}
              item={item}
              onToggle={toggle}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Add item input row */}
        <div
          className={isDesktop ? "bg-white rounded-2xl px-4 py-3 flex items-center gap-3 mt-2 lg:col-span-2" : "bg-white rounded-2xl px-4 py-3 flex items-center gap-3 mt-2"}
          style={{ boxShadow: "0 2px 6px rgba(59,65,200,0.08)" }}
        >
          <div className="w-6 h-6 rounded-full border-2 border-dashed border-slate-300 flex-shrink-0" />
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addItem()
              }
            }}
            placeholder={`Ajouter un article (${activeCategory === "All" ? "Gear" : activeCategory})…`}
            className="flex-1 text-[14px] text-navy font-semibold outline-none placeholder:text-slate-300"
          />
          <button
            type="button"
            onClick={addItem}
            className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-sm active:scale-95 transition-transform"
            style={{ background: "#3B41C8" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1v12M1 7h12"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
