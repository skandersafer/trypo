import { useState, useEffect, useRef } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { useIsDesktop } from "../lib/useIsDesktop"
import { getUserProfile, updateUserProfile, processAvatarFile } from "../lib/trips"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const travelStyles = [
  "🎒 Backpacker",
  "🏝 Beach lover",
  "🏙 City explorer",
  "🥾 Adventurer",
  "💎 Luxury",
]
const companionOptions = ["Solo", "Couple", "Friends", "Family"]

export default function EditProfileScreen({ navigate, goBack }: Props) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [bio, setBio] = useState("")
  const [homeCountry, setHomeCountry] = useState("")
  const [activeStyle, setActiveStyle] = useState(0)
  const [activeCompanion, setActiveCompanion] = useState(0)
  const [saved, setSaved] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stats, setStats] = useState({
    tripsCount: 0,
    totalCitiesCount: 0,
    totalMemoriesCount: 0,
    visitedCountriesCount: 0,
  })

  useEffect(() => {
    void (async () => {
      const p = await getUserProfile()
      setName(p.fullName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler")
      setEmail(p.email || user?.email || "")
      setUsername(p.username || `@${(user?.email || "traveler").split("@")[0]}`)
      setBio(p.bio || "Passionate traveler exploring the world 🌍")
      setHomeCountry(p.homeCountry || "France")
      setAvatarUrl(
        p.avatarUrl ||
          (user as any)?.user_metadata?.avatar_url ||
          (user as any)?.user_metadata?.avatarUrl ||
          null,
      )
      setStats({
        tripsCount: p.tripsCount || 0,
        totalCitiesCount: p.totalCitiesCount || 0,
        totalMemoriesCount: p.totalMemoriesCount || 0,
        visitedCountriesCount: p.visitedCountriesCount || 0,
      })
    })()
  }, [user])

  const handleSave = async () => {
    await updateUserProfile({
      fullName: name.trim(),
      username: username.trim(),
      email: email.trim(),
      bio: bio.trim(),
      homeCountry: homeCountry.trim(),
      ...(avatarUrl ? { avatarUrl } : {}),
    })
    setSaved(true)
    setTimeout(() => {
      navigate("profile")
    }, 800)
  }

  /** Upload from phone camera or gallery → downscaled photo used app-wide. */
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const dataUrl = await processAvatarFile(file)
      setAvatarUrl(dataUrl)
      // Persist immediately (local + server) so the new photo is already live
      // on the profile AND in the trip community even if the user leaves
      // without pressing Save.
      void updateUserProfile({ avatarUrl: dataUrl })
    } catch {
      setUploadError("Could not read that photo. Try another one.")
    } finally {
      setUploading(false)
    }
  }

  const initial = (name || user?.email || "T").charAt(0).toUpperCase()

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
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
          <h1 className="text-[20px] font-black text-navy">Edit Profile</h1>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-xl text-[13px] font-bold text-white transition-all"
          style={{
            background: saved
              ? "#059669"
              : "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 4px 12px rgba(59,65,200,0.3)",
          }}
        >
          {saved ? "✓ Saved!" : "Save"}
        </button>
      </div>

      <div className="px-5 md:px-8 flex flex-col gap-5 pb-10 w-full md:max-w-xl md:mx-auto">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-[28px] overflow-hidden bg-brand flex items-center justify-center text-white font-black text-4xl shadow-md active:scale-95 transition-transform"
              title="Upload a profile photo"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </button>
            <div
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                boxShadow: "0 4px 10px rgba(59,65,200,0.4)",
              }}
            >
              {uploading ? "…" : "📷"}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[12px] font-bold text-brand"
          >
            {uploading ? "Loading photo…" : avatarUrl ? "Change photo" : "Upload a photo"}
          </button>
          {uploadError && (
            <p className="text-[11px] font-bold text-red-500">⚠️ {uploadError}</p>
          )}
          <p className="text-[12px] font-bold text-brand">
            {email || "Account Profile"}
          </p>
        </div>

        {/* Basic info */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
            Basic Info
          </p>
          <div
            className="bg-white rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
          >
            <Field
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Your name"
            />
            <div className="h-[1px] bg-slate-50 mx-4" />
            <Field
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="@username"
            />
            <div className="h-[1px] bg-slate-50 mx-4" />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="your@email.com"
              type="email"
            />
            <div className="h-[1px] bg-slate-50 mx-4" />
            <Field
              label="Home country"
              value={homeCountry}
              onChange={setHomeCountry}
              placeholder="Where are you from?"
            />
          </div>
        </div>

        {/* Bio */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
            Bio
          </p>
          <div
            className="bg-white rounded-2xl p-4"
            style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
          >
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={120}
              className="w-full text-navy text-[14px] outline-none resize-none bg-transparent leading-relaxed"
              placeholder="Tell travelers about yourself…"
            />
            <p className="text-slate-300 text-[10px] text-right mt-1">
              {bio.length}/120
            </p>
          </div>
        </div>

        {/* Travel style */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
            Travel Style
          </p>
          <div className={isDesktop ? "grid grid-cols-3 lg:grid-cols-5 gap-2 pb-1" : "flex gap-2 overflow-x-auto pb-1"}>
            {travelStyles.map((s, i) => (
              <button
                key={s}
                onClick={() => setActiveStyle(i)}
                className="flex-shrink-0 px-3.5 py-2.5 rounded-2xl text-[12px] font-bold transition-all"
                style={{
                  background: i === activeStyle ? "#3B41C8" : "white",
                  color: i === activeStyle ? "white" : "#64748b",
                  boxShadow:
                    i === activeStyle
                      ? "0 6px 16px rgba(59,65,200,0.3)"
                      : "0 2px 8px rgba(59,65,200,0.06)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Usually travels with */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
            Usually Travels
          </p>
          <div className="flex gap-2">
            {companionOptions.map((c, i) => (
              <button
                key={c}
                onClick={() => setActiveCompanion(i)}
                className="flex-1 py-2.5 rounded-2xl text-[12px] font-bold transition-all"
                style={{
                  background: i === activeCompanion ? "#3B41C8" : "white",
                  color: i === activeCompanion ? "white" : "#64748b",
                  boxShadow:
                    i === activeCompanion
                      ? "0 6px 16px rgba(59,65,200,0.3)"
                      : "0 2px 8px rgba(59,65,200,0.06)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Stats (dynamic) */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
            Your Stats
          </p>
          <div
            className="bg-white rounded-2xl p-4"
            style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
          >
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: String(stats.tripsCount), label: "Trips", icon: "🗺" },
                { value: String(stats.totalCitiesCount), label: "Cities", icon: "🏙" },
                { value: String(stats.totalMemoriesCount), label: "Memories", icon: "📸" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1">
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-navy font-black text-[20px]">
                    {s.value}
                  </span>
                  <span className="text-slate-400 text-[11px]">{s.label}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-slate-300 text-[11px] mt-3">
              Stats are updated automatically from your trips
            </p>
          </div>
        </div>

        {/* World map link */}
        <button
          onClick={() => navigate("world-map")}
          className="w-full rounded-2xl p-4 flex items-center gap-4 bg-white text-left"
          style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: "rgba(59,65,200,0.07)" }}
          >
            🌍
          </div>
          <div className="flex-1">
            <p className="text-navy font-bold text-[14px]">My World Map</p>
            <p className="text-slate-400 text-[12px]">
              {stats.visitedCountriesCount} countr{stats.visitedCountriesCount > 1 ? "ies" : "y"} explored · View your map
            </p>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            opacity="0.3"
          >
            <path
              d="M5 3l4 4-4 4"
              stroke="#0D0F2E"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-2xl text-white font-black text-[16px]"
          style={{
            background: saved
              ? "#059669"
              : "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 12px 32px rgba(59,65,200,0.3)",
            transition: "all 0.3s ease",
          }}
        >
          {saved ? "✓ Profile saved!" : "Save Changes"}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <p className="text-slate-400 text-[12px] font-medium w-[90px] flex-shrink-0">
        {label}
      </p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-navy font-semibold text-[14px] outline-none bg-transparent text-right"
      />
    </div>
  )
}
