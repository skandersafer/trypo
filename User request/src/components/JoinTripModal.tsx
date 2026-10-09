import { useEffect, useState } from "react"
import { useAuth } from "../lib/auth"
import { joinTripByCode } from "../lib/trips"
import type { Screen } from "../App"

interface Props {
  isOpen: boolean
  onClose: () => void
  navigate: (s: Screen) => void
  onJoined?: () => void
  initialCode?: string
}

export default function JoinTripModal({ isOpen, onClose, navigate, onJoined, initialCode }: Props) {
  const { user } = useAuth()
  const [code, setCode] = useState(initialCode || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // A deep link (trypo://join/XXX) can prefill the code.
  useEffect(() => {
    if (isOpen && initialCode) setCode(initialCode)
  }, [isOpen, initialCode])

  if (!isOpen) return null

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) {
      setError("Please enter a trip code.")
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await joinTripByCode(trimmed, {
        id: user?.id,
        name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler",
        email: user?.email || undefined,
        avatar: user?.user_metadata?.avatar_url || undefined,
      })

      if (res.success) {
        setSuccess(res.message || "Trip joined successfully!")
        if (onJoined) onJoined()
        setTimeout(() => {
          onClose()
          navigate("trip-overview")
        }, 1200)
      } else {
        setError(res.message || "Invalid invite code.")
      }
    } catch (err: any) {
      setError(err?.message || "An error occurred while joining.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="absolute inset-0 z-[100] flex items-end justify-center md:items-center md:p-8"
      style={{ background: "rgba(10, 10, 46, 0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-[32px] md:rounded-[28px] p-6 pb-9 shadow-2xl animate-in slide-in-from-bottom duration-200"
        style={{ maxWidth: "390px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
              style={{ background: "rgba(59,65,200,0.1)" }}
            >
              👥
            </div>
            <div>
              <h3 className="font-black text-navy text-[17px]">Join a Trip</h3>
              <p className="text-slate-400 text-[11px]">Enter your friend's invite code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold hover:bg-slate-200 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Trip Invite Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setError(null)
              }}
              placeholder="e.g. TUNISIA-CREW or TRIP-4921"
              autoFocus
              className="w-full px-4 py-3.5 rounded-2xl bg-surface border-2 border-slate-200 font-black text-navy text-[15px] outline-none focus:border-brand tracking-wider placeholder:text-slate-300 placeholder:tracking-normal uppercase"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-bold flex items-center gap-2">
              <span>🎉</span>
              <span>{success}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="flex-1 py-3.5 rounded-2xl text-white font-black text-[13px] cursor-pointer disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                boxShadow: "0 6px 18px rgba(59,65,200,0.3)",
              }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Join Crew ✨"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

