import { useState, useEffect, useMemo } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import {
  useMyNotifications,
  markNotificationsRead,
  deleteNotification,
  type DbNotification,
} from "../lib/communityLive"
import { getNotifications } from "../lib/trips"
import { useSettings } from "../lib/settings"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Notif = {
  id: string | number
  icon: string
  title: string
  body: string
  time: string
  read: boolean
  type: "trip" | "booking" | "crew" | "system" | "promo"
  action?: Screen
}

const typePalette: Record<string, { bg: string; border: string }> = {
  trip: { bg: "rgba(59,65,200,0.08)", border: "rgba(59,65,200,0.15)" },
  booking: { bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.15)" },
  crew: { bg: "rgba(6,196,212,0.08)", border: "rgba(6,196,212,0.15)" },
  system: { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.15)" },
  promo: { bg: "rgba(255,99,71,0.08)", border: "rgba(255,99,71,0.15)" },
}

// Route DB notification types to an icon + UI palette + optional deep link.
const notifMeta: Record<string, { icon: string; type: Notif["type"]; action?: Screen }> = {
  join_request: { icon: "🙋", type: "crew", action: "trip-social" },
  join_accepted: { icon: "🎉", type: "trip" },
  join_declined: { icon: "😔", type: "system" },
  booking: { icon: "🗓️", type: "booking" },
  crew: { icon: "🧑‍🤝‍🧑", type: "crew" },
  reminder: { icon: "⏰", type: "system" },
  trip: { icon: "✈️", type: "trip" },
}

const formatTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Just now"

function toDbNotif(n: DbNotification): Notif {
  const meta = notifMeta[n.type] || { icon: "🔔", type: "system" as Notif["type"] }
  return {
    id: n.id,
    icon: meta.icon,
    title: n.title || "Notification",
    body: n.body || "",
    time: formatTime(n.created_at),
    read: Boolean(n.read_at),
    type: meta.type,
    action: meta.action,
  }
}

function toStoreNotif(n: any): Notif {
  return {
    id: n.id,
    icon: n.icon || "🔔",
    title: n.title || "Notification",
    body: n.body || n.message || "",
    time: n.created_at
      ? new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Just now",
    read: Boolean(n.is_read || n.read),
    type: n.type || "system",
    action: n.action_screen as Screen,
  }
}

export default function NotificationsScreen({ navigate, goBack }: Props) {
  const { configured, user } = useAuth()
  const { settings } = useSettings()
  const isDesktop = useIsDesktop()
  const { notifications: dbNotifs, loading: dbLoading } = useMyNotifications()
  const [storeNotifs, setStoreNotifs] = useState<Notif[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!configured || !user) return
    getNotifications()
      .then((data) => setStoreNotifs((data || []).map(toStoreNotif)))
      .catch(() => setStoreNotifs([]))
  }, [configured, user])

  const dbIds = useMemo(() => new Set(dbNotifs.map((n) => n.id)), [dbNotifs])

  const notifs = useMemo(() => {
    const map = new Map<string | number, Notif>()
    for (const n of dbNotifs) {
      const m = toDbNotif(n)
      if (!hidden.has(String(m.id))) map.set(m.id, m)
    }
    for (const n of storeNotifs) {
      if (hidden.has(String(n.id))) continue
      if (!map.has(n.id)) map.set(n.id, n)
    }
    // Respect Settings → Notifications toggles
    const prefs = settings.notifications
    return Array.from(map.values()).filter((n) => {
      if (n.type === "trip" && !prefs.trip) return false
      if (n.type === "booking" && !prefs.booking) return false
      if (n.type === "crew" && !prefs.crew) return false
      if (n.type === "promo" && !prefs.promo) return false
      return true
    })
  }, [dbNotifs, storeNotifs, hidden, settings.notifications])

  const unread = notifs.filter((n) => !n.read).length

  const markAllRead = () => {
    void markNotificationsRead()
    setStoreNotifs((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const markOneRead = (n: Notif) => {
    if (dbIds.has(String(n.id))) void markNotificationsRead([String(n.id)])
    else setStoreNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
  }

  const dismiss = (id: string | number) => {
    setHidden((prev) => new Set(prev).add(String(id)))
    if (dbIds.has(String(id))) void deleteNotification(String(id))
    else setStoreNotifs((prev) => prev.filter((x) => x.id !== id))
  }

  const handleTap = (n: Notif) => {
    markOneRead(n)
    if (n.action) navigate(n.action)
  }

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack("home")}
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
            <h1 className="text-[20px] font-black text-navy">Notifications</h1>
            <p className="text-slate-400 text-[12px]">
              {unread > 0 ? `${unread} unread` : "All caught up ✓"}
            </p>
          </div>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-[12px] font-bold text-brand"
          >
            Mark all read
          </button>
        )}
      </div>

      {dbLoading ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm mx-5 md:mx-8 mt-4">
          <p className="text-slate-400 text-sm">Loading notifications...</p>
        </div>
      ) : notifs.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm mx-5 md:mx-8 mt-4">
          <span className="text-4xl mb-3 block">🔔</span>
          <h3 className="text-navy font-bold text-[15px]">No notifications yet</h3>
          <p className="text-slate-400 text-[12px] mt-1">You're all caught up!</p>
        </div>
      ) : (
        <>
          {/* Unread section */}
          {unread > 0 && (
            <div className="px-5 md:px-8 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                New
              </p>
              <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "flex flex-col gap-2"}>
                {notifs
                  .filter((n) => !n.read)
                  .map((n) => (
                    <NotifCard
                      key={n.id}
                      n={n}
                      onTap={handleTap}
                      onDismiss={dismiss}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Read section */}
          <div className="px-5 md:px-8 mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 mt-3">
              Earlier
            </p>
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : "flex flex-col gap-2"}>
              {notifs
                .filter((n) => n.read)
                .map((n) => (
                  <NotifCard
                    key={n.id}
                    n={n}
                    onTap={handleTap}
                    onDismiss={dismiss}
                  />
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NotifCard({
  n,
  onTap,
  onDismiss,
}: {
  n: Notif
  onTap: (n: Notif) => void
  onDismiss: (id: string | number) => void
}) {
  const palette = typePalette[n.type] || typePalette.system

  return (
    <div
      className="bg-white rounded-2xl p-4 flex gap-3"
      style={{
        boxShadow: n.read
          ? "0 2px 6px rgba(59,65,200,0.05)"
          : "0 4px 14px rgba(59,65,200,0.12)",
        borderLeft: n.read ? "none" : "3px solid #3B41C8",
        opacity: n.read ? 0.85 : 1,
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{
          background: palette.bg,
          border: `1px solid ${palette.border}`,
        }}
      >
        {n.icon}
      </div>
      <button className="flex-1 text-left" onClick={() => onTap(n)}>
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className="text-navy font-bold text-[13px] leading-snug">
            {n.title}
          </p>
          <span className="text-slate-400 text-[10px] font-medium flex-shrink-0 mt-0.5">
            {n.time}
          </span>
        </div>
        <p className="text-slate-500 text-[12px] leading-relaxed">{n.body}</p>
        {n.action && (
          <span className="text-brand font-bold text-[11px] mt-1 inline-block">
            View →
          </span>
        )}
      </button>
      <button
        onClick={() => onDismiss(n.id)}
        className="flex-shrink-0 self-start mt-0.5 opacity-30 hover:opacity-60"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M10.5 3.5l-7 7M3.5 3.5l7 7"
            stroke="#0D0F2E"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}