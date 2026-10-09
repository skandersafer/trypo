import type { Screen } from "../App"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
  onLogout: () => void
}

export default function LogoutScreen({ navigate, onLogout, goBack }: Props) {
  const isDesktop = useIsDesktop()
  return (
    <div className="h-full flex flex-col items-center justify-center relative overflow-hidden bg-surface">
      {/* Background gradient blob */}
      <div
        className="absolute top-[-80px] right-[-80px] w-[280px] h-[280px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #3B41C8, transparent)" }}
      />
      <div
        className="absolute bottom-[-60px] left-[-60px] w-[220px] h-[220px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #FF6347, transparent)" }}
      />

      {/* Icon */}
      <div
        className="w-24 h-24 rounded-[28px] flex items-center justify-center mb-6"
        style={{
          background: "rgba(239,68,68,0.08)",
          border: "1.5px solid rgba(239,68,68,0.15)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path
            d="M15 20h18M27 14l6 6-6 6"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M21 8H8a2 2 0 00-2 2v20a2 2 0 002 2h13"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Text */}
      <h2 className="text-navy font-black text-[24px] mb-2">
        Leaving already?
      </h2>
      <p className="text-slate-400 text-[14px] text-center px-10 mb-10 leading-relaxed">
        Your trips and memories will be waiting when you come back.
      </p>



      {/* Buttons */}
      <div className={isDesktop ? "flex flex-col gap-3 w-full md:max-w-md px-8" : "flex flex-col gap-3 w-[calc(100%-64px)]"}>
        <button
          onClick={onLogout}
          className="w-full py-4 rounded-2xl font-bold text-[15px]"
          style={{
            background: "rgba(239,68,68,0.09)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          Yes, logout
        </button>
        <button
          onClick={() => goBack("profile")}
          className="w-full py-4 rounded-2xl font-bold text-[15px] text-white"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 10px 28px rgba(59,65,200,0.35)",
          }}
        >
          Stay on Trypo
        </button>
      </div>
    </div>
  )
}
