import { useState } from "react"

interface Props {
  title: string
  subtitle?: string
  link?: string
  code?: string
  onClose: () => void
  // Share-to-Community: when provided, a community block appears in the sheet.
  communityPublic?: boolean
  communityBusy?: boolean
  communityError?: string | null
  onToggleCommunity?: () => void
  onOpenCommunity?: () => void
}

export default function ShareSheet({
  title,
  subtitle,
  link,
  code,
  onClose,
  communityPublic,
  communityBusy,
  communityError,
  onToggleCommunity,
  onOpenCommunity,
}: Props) {
  const dynamicCode = code || "TRYPO-INVITE"
  const dynamicLink = link || `https://trypo-app.vercel.app/join/${dynamicCode}`
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const copyLink = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(dynamicLink)
    }
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  const copyCode = () => {
    if (navigator?.clipboard?.writeText && dynamicCode) {
      navigator.clipboard.writeText(dynamicCode)
    }
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2500)
  }

  const shareText = `Rejoins mon voyage "${title}" sur Trypo avec le code : ${dynamicCode} !`
  const shareUrl = dynamicLink

  const shareOptions = [
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#25D366" />
          <path
            d="M12 4a8 8 0 00-6.93 11.97L4 20l4.17-1.06A8 8 0 1012 4z"
            fill="white"
            opacity="0.9"
          />
          <path
            d="M9.5 8.5c-.28 0-.75.1-.75.75 0 .63.56 1.19.56 1.19s1.44 2.63 3.25 3.5c1.25.6 1.94.56 1.94.56.75-.06.94-.75.94-.75s.19-.5-.31-.69L13.5 12.5s-.44-.19-.69.06l-.5.5c-.25.25-.69.19-.69.19S9.94 12.31 9.5 11s.25-.75.25-.75.44-.44.25-.75L9.06 8.75c-.13-.25-.3-.25-.56-.25h.5v.5-.5z"
            fill="white"
          />
        </svg>
      ),
      label: "WhatsApp",
      color: "#25D366",
      action: () => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + " " + shareUrl)}`, "_blank")
      },
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#0088cc" />
          <path
            d="M12 5L5 9v6l7 4 7-4V9l-7-4z"
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2" fill="white" />
        </svg>
      ),
      label: "Telegram",
      color: "#0088cc",
      action: () => {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, "_blank")
      },
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#EA4335" />
          <path
            d="M4 8l8 5 8-5"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect
            x="4"
            y="7"
            width="16"
            height="11"
            rx="2"
            stroke="white"
            strokeWidth="1.5"
          />
        </svg>
      ),
      label: "Gmail",
      color: "#EA4335",
      action: () => {
        window.open(`mailto:?subject=${encodeURIComponent(`Rejoins mon voyage : ${title}`)}&body=${encodeURIComponent(shareText + "\n" + shareUrl)}`, "_blank")
      },
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#1877F2" />
          <path
            d="M16 8h-2a1 1 0 00-1 1v2h3l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 014-4h2v3z"
            fill="white"
          />
        </svg>
      ),
      label: "Facebook",
      color: "#1877F2",
      action: () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank")
      },
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#000" />
          <path
            d="M18 6.5L13 12l5 5.5h-2.5L12 13.5 8.5 17.5H6l5-5.5L6 6.5h2.5L12 10l3.5-3.5H18z"
            fill="white"
          />
        </svg>
      ),
      label: "X",
      color: "#000",
      action: () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank")
      },
    },
  ]

  const handleNativeShare = () => {
    if (typeof navigator !== "undefined" && navigator?.share) {
      navigator.share({
        title: `Voyage Trypo : ${title}`,
        text: shareText,
        url: shareUrl,
      }).catch(() => {})
    } else {
      copyLink()
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-[200] md:items-center md:p-8"
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-white rounded-t-[32px] md:rounded-[28px] px-6 pt-4 pb-8 max-h-[90vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: "0 -10px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />

        {/* Header with close */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚀</span>
            <h3 className="text-navy font-black text-[17px]">Share Trip</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-navy hover:bg-slate-200 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Trip preview */}
        <div className="flex items-center gap-3 mb-4 p-3.5 rounded-2xl bg-surface border border-slate-100">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ background: "rgba(59,65,200,0.08)" }}
          >
            🗺️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-navy font-black text-[14px] truncate">{title}</p>
            {subtitle && (
              <p className="text-slate-400 text-[11px] truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Join Code Box */}
        {dynamicCode && (
          <div
            className="rounded-2xl p-4 mb-4 text-white relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #0D0F2E 0%, #1e2080 100%)",
              boxShadow: "0 6px 20px rgba(13,15,46,0.18)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🎟️</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">
                  Unique Join Code
                </span>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/80">
                Ce voyage uniquement
              </span>
            </div>

            <div className="flex items-center justify-between bg-white/10 rounded-xl p-2.5 mb-2 border border-white/10">
              <span className="font-mono text-[17px] font-black tracking-widest text-cyan-300 select-all">
                {dynamicCode}
              </span>
              <button
                onClick={copyCode}
                className="px-3 py-1.5 rounded-lg text-[11px] font-black text-navy bg-cyan-300 hover:bg-cyan-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
              >
                {copiedCode ? "✓ Copied!" : "📋 Copy Code"}
              </button>
            </div>

            <p className="text-[10px] text-white/70 leading-tight">
              Vos amis peuvent entrer ce code dans l'application pour rejoindre ce voyage en direct.
            </p>
          </div>
        )}

        {/* Share to Community */}
        {onToggleCommunity && (
          <div
            className="rounded-2xl p-4 mb-4"
            style={{
              background: communityPublic
                ? "rgba(16,185,129,0.08)"
                : "rgba(59,65,200,0.06)",
              border: `1.5px solid ${communityPublic ? "rgba(16,185,129,0.3)" : "rgba(59,65,200,0.15)"}`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.8)" }}
              >
                🌍
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-navy font-black text-[14px]">
                  Share to Community
                </p>
                <p className="text-slate-400 text-[11px] leading-snug">
                  {communityPublic
                    ? "Live — anyone on Trypo can discover it"
                    : "Publish this trip so travelers can find it"}
                </p>
              </div>
              <button
                onClick={onToggleCommunity}
                disabled={communityBusy}
                className="px-3.5 py-2 rounded-xl text-[12px] font-black text-white flex-shrink-0 disabled:opacity-50 active:scale-95 transition-all"
                style={{
                  background: communityPublic
                    ? "#10b981"
                    : "linear-gradient(135deg, #3B41C8, #06C4D4)",
                  boxShadow: "0 4px 12px rgba(59,65,200,0.25)",
                }}
              >
                {communityBusy ? "…" : communityPublic ? "✓ Live" : "Share"}
              </button>
            </div>
            {communityPublic && (
              <button
                onClick={onToggleCommunity}
                disabled={communityBusy}
                className="mt-2 text-[11px] font-bold text-slate-500 underline underline-offset-2 disabled:opacity-50"
              >
                Make private again
              </button>
            )}
            {communityError && (
              <p className="mt-2 text-[11px] font-bold text-red-500">{communityError}</p>
            )}
            {communityPublic && onOpenCommunity && (
              <button
                onClick={onOpenCommunity}
                className="mt-2.5 w-full py-2.5 rounded-xl text-[12px] font-black"
                style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}
              >
                View in Community →
              </button>
            )}
          </div>
        )}

        {/* Share icons row */}
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5">
          Share with friends
        </p>
        <div className="flex justify-between mb-5">
          {shareOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={opt.action}
              className="flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
            >
              <div
                className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center bg-white"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
              >
                {opt.icon}
              </div>
              <span className="text-[10px] font-semibold text-slate-500">
                {opt.label}
              </span>
            </button>
          ))}
        </div>

        {/* Copy link */}
        <div
          className="flex items-center gap-2.5 bg-surface rounded-2xl px-3.5 py-2.5 mb-3"
          style={{ border: "1px solid rgba(59,65,200,0.12)" }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            className="flex-shrink-0"
          >
            <path
              d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5l-1 1"
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5l1-1"
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="flex-1 text-[11px] text-slate-500 truncate font-mono">
            {dynamicLink}
          </span>
          <button
            onClick={copyLink}
            className="px-3 py-1.5 rounded-full text-[11px] font-black transition-all flex-shrink-0 cursor-pointer active:scale-95"
            style={{
              background: copiedLink
                ? "rgba(16,185,129,0.12)"
                : "rgba(59,65,200,0.1)",
              color: copiedLink ? "#10b981" : "#3B41C8",
            }}
          >
            {copiedLink ? "✓ Copied!" : "Copy"}
          </button>
        </div>

        {/* Native share button */}
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button
            onClick={handleNativeShare}
            className="w-full py-3 rounded-2xl bg-brand text-white font-black text-[13px] flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all cursor-pointer"
          >
            <span>📤</span> Plus d'options de partage
          </button>
        )}
      </div>
    </div>
  )
}
