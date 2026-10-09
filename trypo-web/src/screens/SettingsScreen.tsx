import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { useAuth, useMyAvatar } from "../lib/auth"
import { getUserProfile, getTripDetails, getActiveTripId } from "../lib/trips"
import { SUPPORTED_CURRENCIES } from "../lib/currencyApi"
import { LANGUAGES, useSettings, type LanguageCode } from "../lib/settings"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

function Toggle({ value, onChange, isDark }: { value: boolean; onChange: (v: boolean) => void; isDark?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0 cursor-pointer"
      style={{
        background: value
          ? "linear-gradient(135deg,#3B41C8,#06C4D4)"
          : isDark
            ? "rgba(255,255,255,0.2)"
            : "#e2e8f0",
      }}
    >
      <div
        className="absolute top-1 w-4 h-4 rounded-full bg-white toggle-knob shadow transition-all duration-300"
        style={{
          left: value ? "28px" : "4px",
          background: "#ffffff",
        }}
      />
    </button>
  )
}

const OFFLINE_SNAPSHOT_KEY = "trypo_offline_snapshot_v1"
const LOCATION_KEY = "trypo_user_location_v1"
const TWO_FA_KEY = "trypo_2fa_enabled"

async function snapshotTripsForOffline(): Promise<number> {
  try {
    const snapshot: Record<string, string> = {}
    let count = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith("trypo_local_store") || k.startsWith("trypo_live_currency") || k === "trypo_active_trip_id") {
        const v = localStorage.getItem(k)
        if (v) {
          snapshot[k] = v
          count++
        }
      }
    }
    // Also snapshot the active trip detail payload so offline open works
    try {
      const activeId = getActiveTripId()
      const detail = await getTripDetails(activeId)
      if (detail) {
        snapshot["__active_trip_detail"] = JSON.stringify({ id: activeId, detail, savedAt: new Date().toISOString() })
        count++
      }
    } catch {
      // ignore — local keys are enough
    }
    localStorage.setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), keys: snapshot }))
    return count
  } catch {
    return 0
  }
}

export default function SettingsScreen({ navigate, goBack }: Props) {
  const { user, signOut, requestPasswordReset } = useAuth()
  const { settings, update, updateNotifications, t } = useSettings()
  const isDesktop = useIsDesktop()
  const [profile, setProfile] = useState<any>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [twoFa, setTwoFa] = useState(() => {
    try {
      return localStorage.getItem(TWO_FA_KEY) === "1"
    } catch {
      return false
    }
  })
  const [modal, setModal] = useState<"privacy" | "terms" | "delete" | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const p = await getUserProfile()
      setProfile(p)
    })()
  }, [user])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  const displayName = profile?.fullName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler"
  const userEmail = profile?.email || user?.email || ""
  const userInitial = displayName.charAt(0).toUpperCase()
  const myAvatar = useMyAvatar()

  const handleOfflineToggle = async (v: boolean) => {
    update({ offlineMode: v })
    if (v) {
      setBusy(true)
      const n = await snapshotTripsForOffline()
      setBusy(false)
      setToast(t("offlineReady") + (n > 0 ? ` (${n})` : ""))
    } else {
      try {
        localStorage.removeItem(OFFLINE_SNAPSHOT_KEY)
      } catch {}
      setToast(t("offlineOff"))
    }
  }

  const handleLocationToggle = (v: boolean) => {
    update({ locationAccess: v })
    if (v) {
      if (!("geolocation" in navigator)) {
        setToast(t("locationBlocked"))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            localStorage.setItem(
              LOCATION_KEY,
              JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, savedAt: new Date().toISOString() }),
            )
          } catch {}
          setToast(t("locationSaved"))
        },
        () => setToast(t("locationBlocked")),
        { timeout: 8000 },
      )
    } else {
      try {
        localStorage.removeItem(LOCATION_KEY)
      } catch {}
    }
  }

  const handleNotifToggle = async (key: "trip" | "booking" | "crew" | "promo", v: boolean) => {
    updateNotifications({ [key]: v })
    if (v && "Notification" in window && Notification.permission === "default") {
      try {
        const perm = await Notification.requestPermission()
        setToast(perm === "granted" ? t("notifEnabled") : t("notifBlocked"))
      } catch {}
    }
  }

  const handlePasswordReset = async () => {
    if (!userEmail) return
    const err = await requestPasswordReset(userEmail)
    setToast(err || t("passwordSent"))
  }

  const handleTwoFa = (v: boolean) => {
    setTwoFa(v)
    try {
      localStorage.setItem(TWO_FA_KEY, v ? "1" : "0")
    } catch {}
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") return
    // Clear all local Trypo data, then sign out
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith("trypo_")) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {}
    setModal(null)
    setToast(t("deleted"))
    await signOut()
    navigate("auth")
  }

  const currencyOptions = Object.keys(SUPPORTED_CURRENCIES)

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-6">
        <button
          onClick={() => goBack("profile")}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 14L6 9l5-5" stroke="#0D0F2E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-[20px] font-black text-navy">{t("settings")}</h1>
      </div>

      <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-8" : "px-5 flex flex-col gap-5 pb-8"}>
        {/* Account */}
        <Section title={t("account")}>
          <div className="flex items-center gap-3 p-4">
            <div className="w-12 h-12 rounded-2xl bg-brand flex items-center justify-center text-white font-black text-xl shadow-xs overflow-hidden">
              <img src={myAvatar} alt={displayName} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-navy font-black text-[15px] truncate">{displayName}</p>
              <p className="text-slate-400 text-[12px] truncate">{userEmail}</p>
            </div>
            <button
              onClick={() => navigate("edit-profile")}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer"
              style={{
                background: settings.darkMode ? "rgba(154,162,255,0.16)" : "rgba(59,65,200,0.08)",
                color: settings.darkMode ? "#9aa2ff" : "#3B41C8",
              }}
            >
              {t("edit")}
            </button>
          </div>
        </Section>

        {/* Preferences */}
        <Section title={t("preferences")}>
          <SelectRow
            label={`💱 ${t("currency")}`}
            value={settings.currency}
            options={currencyOptions}
            onChange={(v) => update({ currency: v })}
          />
          <Divider />
          <div className="flex items-center justify-between px-4 py-3.5">
            <p className="text-navy font-semibold text-[14px]">🌐 {t("language")}</p>
            <select
              value={settings.language}
              onChange={(e) => update({ language: e.target.value as LanguageCode })}
              className="text-brand font-bold text-[13px] outline-none bg-transparent text-right"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <Divider />
          <div className="flex items-center justify-between px-4 py-3.5">
            <p className="text-navy font-semibold text-[14px]">📏 {t("units")}</p>
            <select
              value={settings.units}
              onChange={(e) => update({ units: e.target.value as "metric" | "imperial" })}
              className="text-brand font-bold text-[13px] outline-none bg-transparent text-right"
            >
              <option value="metric">{t("metric")}</option>
              <option value="imperial">{t("imperial")}</option>
            </select>
          </div>
        </Section>

        {/* Notifications */}
        <Section title={t("notifications")}>
          <ToggleRow label={`🗓 ${t("tripReminders")}`} value={settings.notifications.trip} onChange={(v) => void handleNotifToggle("trip", v)} />
          <Divider />
          <ToggleRow label={`✈️ ${t("bookingUpdates")}`} value={settings.notifications.booking} onChange={(v) => void handleNotifToggle("booking", v)} />
          <Divider />
          <ToggleRow label={`👥 ${t("crewActivity")}`} value={settings.notifications.crew} onChange={(v) => void handleNotifToggle("crew", v)} />
          <Divider />
          <ToggleRow label={`🔥 ${t("dealsPromo")}`} value={settings.notifications.promo} onChange={(v) => void handleNotifToggle("promo", v)} />
        </Section>

        {/* App */}
        <Section title={t("app")}>
          <ToggleRow label={`🌙 ${t("darkMode")}`} value={settings.darkMode} onChange={(v) => update({ darkMode: v })} />
          <Divider />
          <ToggleRow
            label={`📶 ${t("offlineAccess")}${busy ? "…" : ""}`}
            value={settings.offlineMode}
            onChange={(v) => void handleOfflineToggle(v)}
            sub={t("offlineSub")}
          />
          <Divider />
          <ToggleRow
            label={`📍 ${t("locationAccess")}`}
            value={settings.locationAccess}
            onChange={handleLocationToggle}
            sub={t("locationSub")}
          />
        </Section>

        {/* Privacy */}
        <Section title={t("privacySecurity")}>
          <button onClick={() => void handlePasswordReset()} className="w-full flex items-center justify-between p-4 text-left">
            <div>
              <p className="text-navy font-semibold text-[14px]">🔒 {t("changePassword")}</p>
              <p className="text-slate-400 text-[11px]">{t("changePasswordSub")}</p>
            </div>
            <Chevron />
          </button>
          <Divider />
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-navy font-semibold text-[14px]">🛡 {t("twoFactor")}</p>
              <p className="text-slate-400 text-[11px]">{twoFa ? t("twoFactorOn") : t("twoFactorOff")}</p>
            </div>
            <Toggle value={twoFa} onChange={handleTwoFa} isDark={settings.darkMode} />
          </div>
          <Divider />
          <button onClick={() => setModal("privacy")} className="w-full flex items-center justify-between p-4 text-left">
            <p className="text-navy font-semibold text-[14px]">📋 {t("privacyPolicy")}</p>
            <Chevron />
          </button>
          <Divider />
          <button onClick={() => setModal("terms")} className="w-full flex items-center justify-between p-4 text-left">
            <p className="text-navy font-semibold text-[14px]">📄 {t("terms")}</p>
            <Chevron />
          </button>
        </Section>

        {/* Danger zone */}
        <Section title={t("dangerZone")}>
          <button onClick={() => { setDeleteConfirm(""); setModal("delete") }} className="w-full p-4 text-left">
            <p className="font-semibold text-[14px]" style={{ color: "#ef4444" }}>
              🗑 {t("deleteAccount")}
            </p>
            <p className="text-slate-400 text-[11px]">{t("deleteAccountSub")}</p>
          </button>
        </Section>

        {/* Logout */}
        <button
          onClick={async () => {
            await signOut()
            navigate("auth")
          }}
          className="w-full py-4 rounded-2xl font-bold text-[15px] cursor-pointer lg:col-span-2"
          style={{
            background: "rgba(239,68,68,0.08)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.15)",
          }}
        >
          🚪 {t("logout")}
        </button>

        <p className="text-center text-slate-300 text-[11px] lg:col-span-2">{t("version")}</p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="sticky bottom-4 mx-5 md:mx-8 rounded-2xl px-4 py-3 text-center shadow-lg"
          style={{ background: "#0D0F2E", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          <p className="text-white text-[12px] font-bold">{toast}</p>
        </div>
      )}

      {/* Privacy / Terms modal */}
      {(modal === "privacy" || modal === "terms") && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-[360px] bg-white rounded-[24px] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-navy font-black text-[16px] mb-2">{modal === "privacy" ? `📋 ${t("privacyPolicy")}` : `📄 ${t("terms")}`}</h3>
            <p className="text-slate-500 text-[12px] leading-relaxed max-h-[220px] overflow-y-auto">
              {modal === "privacy"
                ? "Trypo stores your trips, bookings and expenses to provide travel planning. Location is only used for nearby recommendations when you enable it. You can clear offline data anytime by disabling Offline access, and delete your account to erase local data."
                : "By using Trypo you agree to use travel estimates responsibly. Prices, weather and availability are indicative and provided by third parties. You remain responsible for bookings made with external providers."}
            </p>
            <button
              onClick={() => setModal(null)}
              className="w-full mt-4 py-3 rounded-xl text-white font-bold text-[14px]"
              style={{ background: "linear-gradient(135deg,#3B41C8,#06C4D4)" }}
            >
              {t("close")}
            </button>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {modal === "delete" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-[360px] bg-white rounded-[24px] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-[16px] mb-1" style={{ color: "#ef4444" }}>
              🗑 {t("deleteAccount")}
            </h3>
            <p className="text-slate-500 text-[12px] mb-3">{t("confirmDelete")}</p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-red-400"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl bg-slate-100 font-bold text-[14px] text-slate-600">
                {t("cancel")}
              </button>
              <button
                disabled={deleteConfirm.trim().toUpperCase() !== "DELETE"}
                onClick={() => void handleDeleteAccount()}
                className="flex-1 py-3 rounded-xl text-white font-bold text-[14px] disabled:opacity-40"
                style={{ background: "#ef4444" }}
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" opacity="0.3">
      <path d="M5 3l4 4-4 4" stroke="#0D0F2E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">{title}</p>
      <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 10px rgba(59,65,200,0.07)" }}>
        {children}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="h-[1px] bg-slate-50 mx-4" />
}

function ToggleRow({ label, value, onChange, sub }: { label: string; value: boolean; onChange: (v: boolean) => void; sub?: string }) {
  const { settings } = useSettings()
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div>
        <p className="text-navy font-semibold text-[14px]">{label}</p>
        {sub && <p className="text-slate-400 text-[11px]">{sub}</p>}
      </div>
      <Toggle value={value} onChange={onChange} isDark={settings.darkMode} />
    </div>
  )
}

function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <p className="text-navy font-semibold text-[14px]">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="text-brand font-bold text-[13px] outline-none bg-transparent text-right max-w-[140px]">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}
