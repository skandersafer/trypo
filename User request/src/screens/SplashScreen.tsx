import { useEffect } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
}

export default function SplashScreen({ navigate }: Props) {
  const { user } = useAuth()
  const isDesktop = useIsDesktop()

  useEffect(() => {
    const t = setTimeout(() => {
      if (user) {
        navigate("home")
      } else {
        const seen = typeof window !== "undefined" && localStorage.getItem("trypo_has_seen_onboarding")
        navigate(seen ? "auth" : "onboarding")
      }
    }, 600)
    return () => clearTimeout(t)
  }, [navigate, user])

  return (
    <div
      className="h-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #0a0a2e 0%, #1e2094 40%, #0891b2 100%)",
      }}
    >
      {/* Decorative orbs */}
      <div
        className="absolute top-[-60px] right-[-60px] w-[260px] h-[260px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #06C4D4, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-[-80px] left-[-60px] w-[280px] h-[280px] rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, #FF6347, transparent 70%)",
        }}
      />
      <div
        className="absolute top-[40%] left-[-100px] w-[200px] h-[200px] rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, #3B41C8, transparent 70%)",
        }}
      />

      {/* Logo mark */}
      <div className={isDesktop ? "flex flex-col items-center gap-8 z-10 w-full md:max-w-md px-6" : "flex flex-col items-center gap-8 z-10"}>
        <div
          className="w-[100px] h-[100px] rounded-[30px] flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
          }}
        >
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <circle
              cx="26"
              cy="26"
              r="22"
              stroke="white"
              strokeWidth="2"
              fill="none"
              opacity="0.9"
            />
            <ellipse
              cx="26"
              cy="26"
              rx="11"
              ry="22"
              stroke="white"
              strokeWidth="2"
              fill="none"
              opacity="0.9"
            />
            <line
              x1="4"
              y1="26"
              x2="48"
              y2="26"
              stroke="white"
              strokeWidth="2"
              opacity="0.9"
            />
            <line
              x1="8"
              y1="16"
              x2="44"
              y2="16"
              stroke="white"
              strokeWidth="1.5"
              opacity="0.6"
            />
            <line
              x1="8"
              y1="36"
              x2="44"
              y2="36"
              stroke="white"
              strokeWidth="1.5"
              opacity="0.6"
            />
          </svg>
        </div>

        <div className="flex flex-col items-center gap-3">
          <h1
            className="text-[64px] font-black text-white leading-none tracking-tight"
            style={{ letterSpacing: "-2px" }}
          >
            trypo
          </h1>
          <div className="flex items-center gap-2">
            <div className="w-8 h-[1px] bg-white/30" />
            <p className="text-white/60 text-[11px] font-medium tracking-[0.2em] uppercase">
              Plan it. Live it. Remember it.
            </p>
            <div className="w-8 h-[1px] bg-white/30" />
          </div>
        </div>

        {/* Animated loading dots */}
        <div className="flex gap-2 mt-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/50"
              style={{
                animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
