import { useState, useEffect } from "react"
import type { Screen } from "../App"
import { useIsDesktop } from "../lib/useIsDesktop"
import { useAuth } from "../lib/auth"
import { getUserProfile, getSavedPlaces, getPackingItems, getMyTrips, getTripDetails } from "../lib/trips"

interface Props {
  navigate: (s: Screen) => void
}

export default function ProfileScreen({ navigate }: Props) {
  const { user, signOut, deleteAccount } = useAuth()
  const isDesktop = useIsDesktop()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [activeTrip, setActiveTrip] = useState<any>(null)
  const [profileStats, setProfileStats] = useState({
    tripsCount: 0,
    visitedCountriesCount: 0,
    totalCitiesCount: 0,
    memoriesCount: 0,
    savedPlacesCount: 0,
    packingDone: 0,
    packingTotal: 0,
  })

  const loadStats = async () => {
    try {
      const [uProfile, saved, packing, trips, currTrip] = await Promise.all([
        getUserProfile(),
        getSavedPlaces(),
        getPackingItems(),
        getMyTrips(),
        getTripDetails(),
      ])

      setUserProfile(uProfile)
      setActiveTrip(currTrip)

      const packed = (packing || []).filter((p) => p.is_packed).length
      setProfileStats({
        tripsCount: trips?.length || 0,
        visitedCountriesCount: uProfile?.visitedCountriesCount || 0,
        totalCitiesCount: uProfile?.totalCitiesCount || 0,
        memoriesCount: uProfile?.totalMemoriesCount || (trips?.length ? trips.length * 3 : 0),
        savedPlacesCount: saved?.length || 0,
        packingDone: packed,
        packingTotal: packing?.length || 0,
      })
    } catch {
      // Fallback
    }
  }

  useEffect(() => {
    void loadStats()
    const onDbChange = () => {
      void loadStats()
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    return () => window.removeEventListener("trypo:db_changed", onDbChange)
  }, [user])

  const displayName = userProfile?.fullName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler"
  const userEmail = userProfile?.email || user?.email || ""
  const userInitial = displayName.charAt(0).toUpperCase()
  const avatarUrl =
    userProfile?.avatarUrl ||
    (user as any)?.user_metadata?.avatar_url ||
    (user as any)?.user_metadata?.avatarUrl ||
    null

  const menuItems = [
    {
      label: "Edit Profile",
      sub: "Update your info & travel style",
      action: "edit-profile" as Screen | null,
    },
    {
      label: "My Trips",
      sub: `${profileStats.tripsCount} active trip${profileStats.tripsCount > 1 ? "s" : ""}`,
      action: "trips" as Screen | null,
    },
    {
      label: "My World Map",
      sub: `${profileStats.visitedCountriesCount} ${profileStats.visitedCountriesCount === 1 ? "country" : "countries"} colored in`,
      action: "world-map" as Screen | null,
    },
    {
      label: "Saved Places",
      sub: `${profileStats.savedPlacesCount} place${profileStats.savedPlacesCount > 1 ? "s" : ""} saved`,
      action: "saved-places" as Screen | null,
    },
    {
      label: "Tripo AI",
      sub: "Plan a trip or get travel advice",
      action: "chatbot" as Screen | null,
    },
    {
      label: "Settings",
      sub: "Account & preferences",
      action: "settings" as Screen | null,
    },
    {
      label: "Logout",
      sub: "Disconnect from this account",
      action: "logout" as Screen | null,
      danger: true,
      onPress: async () => {
        await signOut()
        navigate("auth")
      },
    },
    {
      label: "Delete Account",
      sub: "Permanently erase account & data",
      action: null,
      danger: true,
      onPress: async () => {
        setDeleteError(null)
        setShowDeleteModal(true)
      },
    },
  ]

  const handleDeleteAccount = async () => {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const err = await deleteAccount()
      if (err) {
        setDeleteError(err)
        return
      }
      setShowDeleteModal(false)
      navigate("auth")
    } catch {
      setDeleteError("Could not delete the account. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header cover */}
      <div
        className="mx-5 md:mx-8 rounded-[24px] overflow-hidden mb-5 relative"
        style={{
          background: "linear-gradient(135deg, #0D0F2E, #1e2080)",
          boxShadow: "0 12px 36px rgba(13,15,46,0.25)",
        }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white/20"
              style={{
                width: `${60 + i * 30}px`,
                height: `${60 + i * 30}px`,
                right: `-${20 + i * 10}px`,
                top: `-${20 + i * 8}px`,
              }}
            />
          ))}
        </div>

        <div className="relative p-5 flex items-center gap-4">
          <div className="relative">
            <div className="w-[72px] h-[72px] rounded-[22px] overflow-hidden bg-brand flex items-center justify-center font-bold text-3xl text-white shadow-md">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                userInitial
              )}
            </div>
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#4ade80] flex items-center justify-center"
              style={{ border: "2px solid #1e2080" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`text-white font-black text-[20px] md:text-[24px] ${isDesktop ? "max-w-none" : "truncate"}`}>{displayName}</h2>
            <p className="text-white/60 text-[12px] truncate">
              {userEmail || "Trypo Traveler"}
            </p>
            <p className="text-cyan-300 text-[11px] mt-0.5 font-bold">
              {userProfile?.username || `@${(userEmail || "traveler").split("@")[0]}`}
            </p>
          </div>
          <button
            onClick={() => navigate("edit-profile")}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M11 2l3 3-8 8H3v-3L11 2z"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 border-t border-white/10">
          {[
            { value: String(profileStats.tripsCount), label: "Trips" },
            { value: String(profileStats.totalCitiesCount), label: "Cities" },
            { value: String(profileStats.memoriesCount), label: "Memories" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center py-3 px-2"
            >
              <span className="text-white font-black text-[20px]">
                {stat.value}
              </span>
              <span className="text-white/40 text-[10px] font-medium">
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* World map CTA */}
        <button
          onClick={() => navigate("world-map")}
          className="w-full border-t border-white/10 py-3 px-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-white/70 text-[12px] font-semibold">
              View my world map · {profileStats.visitedCountriesCount} countr{profileStats.visitedCountriesCount > 1 ? "ies" : "y"}
            </span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            opacity="0.4"
          >
            <path
              d="M5 3l4 4-4 4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Upcoming trip strip */}
      <div className="px-5 md:px-8 mb-5">
        {activeTrip ? (
          <button
            onClick={() => navigate("trip-overview")}
            className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left"
            style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.08)" }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[16px] font-black text-brand flex-shrink-0"
              style={{ background: "rgba(59,65,200,0.08)" }}
            >
              {(activeTrip.title || "T").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-navy font-bold text-[13px] truncate">
                {activeTrip.title}
              </p>
              <p className="text-slate-400 text-[11px] truncate">
                {[activeTrip.start_date, activeTrip.end_date].filter(Boolean).join(" – ") || "Upcoming adventure"}
              </p>
            </div>
            <div
              className="px-2.5 py-1 rounded-full text-[10px] font-black"
              style={{ background: "rgba(255,99,71,0.1)", color: "#FF6347" }}
            >
              Active
            </div>
          </button>
        ) : (
          <button
            onClick={() => navigate("create-trip")}
            className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-left border border-dashed border-brand/30"
            style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.04)" }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] font-black text-brand flex-shrink-0"
              style={{ background: "rgba(59,65,200,0.08)" }}
            >
              +
            </div>
            <div className="flex-1">
              <p className="text-brand font-bold text-[13px]">
                Plan your first adventure
              </p>
              <p className="text-slate-400 text-[11px]">
                Tap to create a new trip or join with code
              </p>
            </div>
          </button>
        )}
      </div>

      {/* Menu */}
      <div className="px-5 md:px-8 pb-6">
        <div
          className="bg-white rounded-[22px] overflow-hidden"
          style={{ boxShadow: "0 2px 12px rgba(59,65,200,0.08)" }}
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                if (item.onPress) {
                  void item.onPress()
                } else if (item.action) {
                  navigate(item.action)
                }
              }}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-b-0 cursor-pointer"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-[16px] font-black flex-shrink-0 ${item.danger ? "text-red-500" : "text-brand"}`}
                style={{
                  background: item.danger
                    ? "rgba(239,68,68,0.08)"
                    : "rgba(59,65,200,0.07)",
                }}
              >
                {item.label.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p
                  className={`font-bold text-[14px] ${
                    item.danger ? "text-red-500" : "text-navy"
                  }`}
                >
                  {item.label}
                </p>
                {item.sub && (
                  <p className="text-slate-400 text-[11px]">{item.sub}</p>
                )}
              </div>
              {!item.danger && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  opacity="0.4"
                >
                  <path
                    d="M5 3l4 4-4 4"
                    stroke="#0D0F2E"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Delete Account confirmation */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
          onClick={() => !deleting && setShowDeleteModal(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-[28px] p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-2xl font-black mb-3.5 border border-red-100">
              !
            </div>
            <h3 className="text-[17px] font-black text-navy mb-1.5">
              Delete your account?
            </h3>
            <p className="text-slate-500 text-[13px] leading-relaxed mb-1.5">
              This permanently erases <strong className="text-navy">your profile, trips, crew data and everything</strong> stored on this device
              {userEmail ? (
                <>
                  {" "}for <strong className="text-navy">{userEmail}</strong>
                </>
              ) : null}.
              This cannot be undone.
            </p>
            {deleteError && (
              <div className="mt-3 w-full p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
                {deleteError}
              </div>
            )}
            <div className="flex w-full gap-2.5 mt-6">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-[13px] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-[13px] shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
