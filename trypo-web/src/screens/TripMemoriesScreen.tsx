import { useState, useRef } from "react"
import type { Screen } from "../App"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

// ── Map styles ───────────────────────────────────────────────────────────────
const MAP_STYLES = [
  {
    id: "dark",
    name: "Dark Cinematic",
    emoji: "🌑",
    preview: "linear-gradient(135deg, #0D0F2E 0%, #1a1060 50%, #0a2040 100%)",
    accent: "#06C4D4",
    dots: ["#3B41C8", "#06C4D4", "#FF6347"],
  },
  {
    id: "watercolor",
    name: "Watercolor",
    emoji: "🎨",
    preview: "linear-gradient(135deg, #fef3c7 0%, #fde68a 40%, #a7f3d0 100%)",
    accent: "#10b981",
    dots: ["#f59e0b", "#10b981", "#3B41C8"],
  },
  {
    id: "minimal",
    name: "Minimal",
    emoji: "◻️",
    preview: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
    accent: "#3B41C8",
    dots: ["#0D0F2E", "#3B41C8", "#06C4D4"],
  },
  {
    id: "retro",
    name: "Retro Paper",
    emoji: "🗺",
    preview: "linear-gradient(135deg, #fef9e7 0%, #fdecc8 50%, #e8d5a3 100%)",
    accent: "#92400e",
    dots: ["#92400e", "#b45309", "#d97706"],
  },
  {
    id: "neon",
    name: "Neon Night",
    emoji: "🌆",
    preview: "linear-gradient(135deg, #0a0014 0%, #1a003a 50%, #000a1a 100%)",
    accent: "#f0abfc",
    dots: ["#f0abfc", "#67e8f9", "#86efac"],
  },
]

// ── Slideshow speeds ─────────────────────────────────────────────────────────
const SPEEDS = [
  { id: "slow", label: "Slow", sub: "5s per photo", icon: "🐢" },
  { id: "normal", label: "Normal", sub: "3s per photo", icon: "🚶" },
  { id: "fast", label: "Fast", sub: "1.5s per photo", icon: "🏃" },
]

// ── Trip stops ───────────────────────────────────────────────────────────────
const STOPS = [
  {
    id: "tunis",
    city: "Tunis",
    emoji: "🏙",
    dates: "Jun 5–7",
    days: 2,
    color: "#3B41C8",
  },
  {
    id: "sousse",
    city: "Sousse",
    emoji: "🏝",
    dates: "Jun 7–10",
    days: 3,
    color: "#06C4D4",
  },
  {
    id: "sfax",
    city: "Sfax",
    emoji: "🧭",
    dates: "Jun 10–12",
    days: 2,
    color: "#10b981",
  },
]

// Placeholder photo sets per city (Unsplash)
const CITY_PHOTOS: Record<string, string[]> = {
  tunis: [
    "https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1559628232-ce2823eb1bfd?w=300&h=300&fit=crop",
  ],
  sousse: [
    "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=300&h=300&fit=crop",
  ],
  sfax: [
    "https://images.unsplash.com/photo-1537953773345-d172ccf13cf4?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=300&h=300&fit=crop",
  ],
}

export default function TripMemoriesScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<"style" | "photos" | "preview">(
    "style",
  )
  const [selectedStyle, setSelectedStyle] = useState("dark")
  const [selectedSpeed, setSelectedSpeed] = useState("normal")
  const [maxPhotos, setMaxPhotos] = useState(3)
  const [expandedCity, setExpandedCity] = useState<string | null>("tunis")
  const [cityPhotos, setCityPhotos] = useState<Record<string, string[]>>(
    Object.fromEntries(STOPS.map((s) => [s.id, CITY_PHOTOS[s.id] ?? []])),
  )
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewCity, setPreviewCity] = useState(0)
  const [previewPhoto, setPreviewPhoto] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState<{
    city: string
    idx: number
  } | null>(null)

  const style = MAP_STYLES.find((s) => s.id === selectedStyle) ?? MAP_STYLES[0]
  const speed = SPEEDS.find((s) => s.id === selectedSpeed) ?? SPEEDS[1]
  const totalPhotos = Object.values(cityPhotos).reduce(
    (a, b) => a + b.length,
    0,
  )

  // ── Preview slideshow ──────────────────────────────────────────────────────
  const startPreview = () => {
    setPreviewPlaying(true)
    setPreviewCity(0)
    setPreviewPhoto(0)
  }

  const stopPreview = () => setPreviewPlaying(false)

  const nextPreviewSlide = () => {
    const allCities = STOPS.filter((s) => cityPhotos[s.id]?.length > 0)
    const photos = cityPhotos[allCities[previewCity]?.id ?? ""] ?? []
    if (previewPhoto < photos.length - 1) {
      setPreviewPhoto((p) => p + 1)
    } else if (previewCity < allCities.length - 1) {
      setPreviewCity((c) => c + 1)
      setPreviewPhoto(0)
    } else {
      stopPreview()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadTarget) return
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setCityPhotos((prev) => ({
        ...prev,
        [uploadTarget]: [...(prev[uploadTarget] ?? []), url].slice(
          0,
          maxPhotos,
        ),
      }))
    }
    e.target.value = ""
    setUploadTarget(null)
  }

  const removePhoto = (cityId: string, idx: number) => {
    setCityPhotos((prev) => ({
      ...prev,
      [cityId]: prev[cityId].filter((_, i) => i !== idx),
    }))
    setDeletingPhoto(null)
  }

  // ── Preview overlay ────────────────────────────────────────────────────────
  const citiesWithPhotos = STOPS.filter((s) => cityPhotos[s.id]?.length > 0)
  const previewStop = citiesWithPhotos[previewCity]
  const previewPhotos = previewStop ? (cityPhotos[previewStop.id] ?? []) : []
  const currentPreviewPhoto = previewPhotos[previewPhoto] ?? null

  return (
    <div className="min-h-full flex flex-col" style={{ background: "#f5f6ff" }}>
      {/* Header */}
      <div
        className="flex-shrink-0 pt-12 pb-5 px-5 md:px-8"
        style={{ background: "linear-gradient(135deg, #0D0F2E, #1e2080)" }}
      >
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => goBack("trip-overview")}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.1)" }}
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
          <div className="flex-1">
            <h1 className="text-white font-black text-[18px]">Trip Memories</h1>
            <p className="text-white/50 text-[12px]">
              Tunisia Coast Escape · {totalPhotos} photos
            </p>
          </div>
          <button
            onClick={startPreview}
            disabled={citiesWithPhotos.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-black"
            style={{
              background:
                citiesWithPhotos.length > 0
                  ? "linear-gradient(135deg, #3B41C8, #06C4D4)"
                  : "rgba(255,255,255,0.1)",
              color: "white",
              opacity: citiesWithPhotos.length === 0 ? 0.5 : 1,
            }}
          >
            ▶ Play
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/10 rounded-2xl p-1">
          {([
            { id: "style", label: "🗺 Map Style" },
            { id: "photos", label: "📸 Photos" },
            { id: "preview", label: "⚙️ Settings" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-2 rounded-xl text-[11px] font-black transition-all"
              style={{
                background: activeTab === tab.id ? "white" : "transparent",
                color:
                  activeTab === tab.id ? "#0D0F2E" : "rgba(255,255,255,0.5)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── TAB: Map Style ── */}
        {activeTab === "style" && (
          <div className="p-5 md:p-8 flex flex-col gap-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Choose your map style
            </p>
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-3"}>
              {MAP_STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStyle(s.id)}
                  className="flex items-center gap-4 p-4 rounded-2xl transition-all text-left"
                  style={{
                    background: "white",
                    border:
                      selectedStyle === s.id
                        ? `2px solid ${s.accent}`
                        : "2px solid transparent",
                    boxShadow:
                      selectedStyle === s.id
                        ? `0 4px 20px ${s.accent}33`
                        : "0 2px 8px rgba(59,65,200,0.07)",
                  }}
                >
                  {/* Mini map preview */}
                  <div
                    className="w-16 h-16 rounded-xl flex-shrink-0 relative overflow-hidden"
                    style={{ background: s.preview }}
                  >
                    {/* Route dots */}
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox="0 0 64 64"
                    >
                      <path
                        d="M8 50 Q20 20 32 32 Q44 44 56 14"
                        stroke={s.accent}
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                        fill="none"
                        opacity="0.7"
                      />
                      {[
                        [8, 50],
                        [20, 34],
                        [32, 32],
                        [44, 38],
                        [56, 14],
                      ].map(([x, y], i) => (
                        <circle
                          key={i}
                          cx={x}
                          cy={y}
                          r="3"
                          fill={s.dots[i % s.dots.length]}
                        />
                      ))}
                    </svg>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg">{s.emoji}</span>
                      <p className="text-navy font-black text-[14px]">
                        {s.name}
                      </p>
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      {s.dots.map((c, i) => (
                        <span
                          key={i}
                          className="w-3 h-3 rounded-full"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>

                  {selectedStyle === s.id && (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                      style={{ background: s.accent }}
                    >
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Live map preview */}
            <div
              className="rounded-[22px] overflow-hidden"
              style={{ boxShadow: "0 8px 28px rgba(59,65,200,0.15)" }}
            >
              <div
                className="relative w-full"
                style={{ height: isDesktop ? "280px" : "180px", background: style.preview }}
              >
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 350 180"
                  preserveAspectRatio="none"
                >
                  {/* Grid */}
                  {[40, 80, 120, 160].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="350"
                      y2={y}
                      stroke={style.accent}
                      strokeWidth="0.3"
                      opacity="0.2"
                    />
                  ))}
                  {[70, 140, 210, 280].map((x) => (
                    <line
                      key={x}
                      x1={x}
                      y1="0"
                      x2={x}
                      y2="180"
                      stroke={style.accent}
                      strokeWidth="0.3"
                      opacity="0.2"
                    />
                  ))}
                  {/* Route */}
                  <path
                    d="M 40 140 Q 90 80 140 100 Q 190 120 230 60 Q 270 30 310 50"
                    stroke={style.accent}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    fill="none"
                    opacity="0.8"
                  />
                  {/* Stops */}
                  {[
                    [40, 140],
                    [140, 100],
                    [230, 60],
                    [310, 50],
                  ].map(([x, y], i) => (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r="10"
                        fill={style.dots[i % style.dots.length]}
                        opacity="0.25"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r="5"
                        fill={style.dots[i % style.dots.length]}
                      />
                    </g>
                  ))}
                </svg>
                <div className="absolute bottom-3 left-3">
                  <p
                    className="text-[10px] font-black uppercase tracking-wider"
                    style={{ color: style.accent }}
                  >
                    Preview · {style.name}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Photos ── */}
        {activeTab === "photos" && (
          <div className={isDesktop ? "p-5 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-4" : "p-5 flex flex-col gap-3"}>
            <div className={isDesktop ? "flex items-center justify-between mb-1 lg:col-span-2" : "flex items-center justify-between mb-1"}>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                Your travel memories
              </p>
              <span className="text-[11px] font-bold text-brand">
                {totalPhotos} photos added
              </span>
            </div>

            {STOPS.map((stop) => {
              const photos = cityPhotos[stop.id] ?? []
              const isOpen = expandedCity === stop.id
              const canAdd = photos.length < maxPhotos

              return (
                <div
                  key={stop.id}
                  className="bg-white rounded-[20px] overflow-hidden"
                  style={{ boxShadow: "0 2px 12px rgba(59,65,200,0.08)" }}
                >
                  {/* City header */}
                  <button
                    onClick={() => setExpandedCity(isOpen ? null : stop.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ background: stop.color + "18" }}
                    >
                      {stop.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-navy font-black text-[14px]">
                        {stop.city}
                      </p>
                      <p className="text-slate-400 text-[11px]">
                        {stop.dates} · {photos.length}/{maxPhotos} photos
                      </p>
                    </div>
                    {/* Photo thumbnails preview */}
                    {photos.length > 0 && !isOpen && (
                      <div className="flex -space-x-2 mr-1">
                        {photos.slice(0, 3).map((p, i) => (
                          <img
                            key={i}
                            src={p}
                            alt=""
                            className="w-7 h-7 rounded-lg object-cover border-2 border-white"
                          />
                        ))}
                      </div>
                    )}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s",
                        flexShrink: 0,
                      }}
                    >
                      <path
                        d="M4 6l4 4 4-4"
                        stroke="#94a3b8"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {/* Expanded photos grid */}
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                        {photos.map((photo, idx) => (
                          <div
                            key={idx}
                            className="relative rounded-xl overflow-hidden"
                            style={{ aspectRatio: "1" }}
                          >
                            <img
                              src={photo}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            {/* Delete button */}
                            <button
                              onClick={() =>
                                setDeletingPhoto({ city: stop.id, idx })
                              }
                              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ background: "rgba(0,0,0,0.55)" }}
                            >
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 8 8"
                                fill="none"
                              >
                                <path
                                  d="M1 1l6 6M7 1L1 7"
                                  stroke="white"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}

                        {/* Add photo slot */}
                        {canAdd && (
                          <button
                            onClick={() => {
                              setUploadTarget(stop.id)
                              fileInputRef.current?.click()
                            }}
                            className="rounded-xl flex flex-col items-center justify-center gap-1"
                            style={{
                              aspectRatio: "1",
                              border: `2px dashed ${stop.color}55`,
                              background: stop.color + "08",
                            }}
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-[16px]"
                              style={{ background: stop.color }}
                            >
                              +
                            </div>
                            <p
                              className="text-[9px] font-bold"
                              style={{ color: stop.color }}
                            >
                              Add photo
                            </p>
                          </button>
                        )}

                        {/* Max reached indicator */}
                        {!canAdd && (
                          <div
                            className="rounded-xl flex flex-col items-center justify-center gap-1"
                            style={{
                              aspectRatio: "1",
                              background: "rgba(59,65,200,0.05)",
                            }}
                          >
                            <p className="text-[9px] font-bold text-slate-300 text-center px-2">
                              Max {maxPhotos} photos
                            </p>
                          </div>
                        )}
                      </div>

                      {photos.length === 0 && (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <span className="text-3xl opacity-30">
                            {stop.emoji}
                          </span>
                          <p className="text-slate-300 text-[12px] font-medium">
                            No memories yet
                          </p>
                          <button
                            onClick={() => {
                              setUploadTarget(stop.id)
                              fileInputRef.current?.click()
                            }}
                            className="px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                            style={{ background: stop.color }}
                          >
                            Add your first photo
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* ── TAB: Settings ── */}
        {activeTab === "preview" && (
          <div className="p-5 md:p-8 flex flex-col gap-5">
            {/* Slideshow speed */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                Slideshow speed
              </p>
              <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
                {SPEEDS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSpeed(s.id)}
                    className="flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                    style={{
                      background: "white",
                      border:
                        selectedSpeed === s.id
                          ? "2px solid #3B41C8"
                          : "2px solid transparent",
                      boxShadow:
                        selectedSpeed === s.id
                          ? "0 4px 16px rgba(59,65,200,0.15)"
                          : "0 2px 8px rgba(59,65,200,0.06)",
                    }}
                  >
                    <span className="text-2xl">{s.icon}</span>
                    <div className="flex-1">
                      <p className="text-navy font-black text-[14px]">
                        {s.label}
                      </p>
                      <p className="text-slate-400 text-[11px]">{s.sub}</p>
                    </div>
                    {selectedSpeed === s.id && (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                        style={{ background: "#3B41C8" }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Max photos per city */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                Photos per city
              </p>
              <div
                className="bg-white rounded-2xl p-5"
                style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.07)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-navy font-black text-[16px]">
                    Max {maxPhotos} photos
                  </p>
                  <p className="text-slate-400 text-[12px]">per destination</p>
                </div>
                {/* Slider */}
                <div className="relative h-10 flex items-center">
                  <div
                    className="absolute left-0 right-0 h-2 rounded-full"
                    style={{ background: "#e2e8f0" }}
                  />
                  <div
                    className="absolute left-0 h-2 rounded-full"
                    style={{
                      width: `${((maxPhotos - 1) / 9) * 100}%`,
                      background: "linear-gradient(90deg, #3B41C8, #06C4D4)",
                    }}
                  />
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={maxPhotos}
                    onChange={(e) => setMaxPhotos(Number(e.target.value))}
                    className="absolute left-0 right-0 w-full opacity-0 h-10 cursor-pointer"
                  />
                  {/* Thumb */}
                  <div
                    className="absolute w-6 h-6 rounded-full bg-white border-[3px] flex items-center justify-center"
                    style={{
                      left: `calc(${((maxPhotos - 1) / 9) * 100}% - 12px)`,
                      borderColor: "#3B41C8",
                      boxShadow: "0 2px 8px rgba(59,65,200,0.35)",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  {[1, 3, 5, 7, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxPhotos(n)}
                      className="text-[11px] font-bold"
                      style={{ color: maxPhotos === n ? "#3B41C8" : "#94a3b8" }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary card */}
            <div
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{
                background: "linear-gradient(135deg, #0D0F2E, #1e2080)",
              }}
            >
              <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">
                Current settings
              </p>
              <div className="flex gap-3">
                <div
                  className="flex-1 rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  <p className="text-white/50 text-[10px] mb-1">Map Style</p>
                  <p className="text-white font-black text-[13px]">
                    {style.emoji} {style.name}
                  </p>
                </div>
                <div
                  className="flex-1 rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  <p className="text-white/50 text-[10px] mb-1">Speed</p>
                  <p className="text-white font-black text-[13px]">
                    {speed.icon} {speed.label}
                  </p>
                </div>
                <div
                  className="flex-1 rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                >
                  <p className="text-white/50 text-[10px] mb-1">Per city</p>
                  <p className="text-white font-black text-[13px]">
                    📸 {maxPhotos}
                  </p>
                </div>
              </div>
              <button
                onClick={startPreview}
                disabled={citiesWithPhotos.length === 0}
                className="w-full py-3.5 rounded-xl text-white font-black text-[14px] flex items-center justify-center gap-2"
                style={{
                  background:
                    citiesWithPhotos.length > 0
                      ? "linear-gradient(135deg, #3B41C8, #06C4D4)"
                      : "rgba(255,255,255,0.1)",
                  opacity: citiesWithPhotos.length === 0 ? 0.5 : 1,
                }}
              >
                ▶ Preview slideshow
              </button>
              {citiesWithPhotos.length === 0 && (
                <p className="text-white/30 text-[11px] text-center">
                  Add photos first in the Photos tab
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deletingPhoto && (
        <div
          className="absolute inset-0 flex items-center justify-center px-8"
          style={{
            zIndex: 100,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(6px)",
          }}
          onClick={() => setDeletingPhoto(null)}
        >
          <div
            className="bg-white rounded-[28px] p-6 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-navy font-black text-[17px] mb-2 text-center">
              Remove photo?
            </p>
            <p className="text-slate-400 text-[13px] text-center mb-5">
              This memory will be deleted from your trip.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingPhoto(null)}
                className="flex-1 py-3 rounded-2xl font-bold text-[14px] text-slate-500"
                style={{ background: "#f1f5f9" }}
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  removePhoto(deletingPhoto.city, deletingPhoto.idx)
                }
                className="flex-1 py-3 rounded-2xl font-bold text-[14px] text-white"
                style={{
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slideshow preview overlay */}
      {previewPlaying && previewStop && currentPreviewPhoto && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{ zIndex: 200, background: "#000" }}
        >
          {/* Photo */}
          <div className="flex-1 relative" onClick={nextPreviewSlide}>
            <img
              src={currentPreviewPhoto}
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: 0.9 }}
            />
            {/* Style overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: style.preview,
                opacity: 0.25,
                mixBlendMode: "multiply",
              }}
            />
            {/* Dark gradient */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 100%)",
              }}
            />

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 pt-12 px-5 flex items-center justify-between">
              <div className="flex gap-1 flex-1">
                {previewPhotos.map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 h-1 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.3)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        background: "white",
                        width:
                          i < previewPhoto
                            ? "100%"
                            : i === previewPhoto
                              ? "50%"
                              : "0%",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={stopPreview}
                className="ml-4 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 1l10 10M11 1L1 11"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* City label */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{previewStop.emoji}</span>
                <div>
                  <p className="text-white font-black text-[26px] leading-none">
                    {previewStop.city}
                  </p>
                  <p className="text-white/60 text-[13px]">
                    {previewStop.dates} · Tunisia 🇹🇳
                  </p>
                </div>
              </div>
              <p className="text-white/50 text-[12px]">
                Tap to continue · {previewCity + 1}/{citiesWithPhotos.length}{" "}
                cities
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
