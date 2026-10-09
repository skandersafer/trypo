import { useState } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
}

const slides = [
  {
    title: "Your entire journey.\nOne place.",
    subtitle:
      "Organize destinations, stays, transport and experiences effortlessly.",
    image:
      "https://images.unsplash.com/photo-1510382755425-2c381be86837?w=800&h=900&fit=crop&auto=format",
    accent: "#3B41C8",
  },
  {
    title: "Plan every day\nyour way.",
    subtitle: "Build your perfect itinerary and keep everything organized.",
    image:
      "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=900&fit=crop&auto=format",
    accent: "#0891b2",
  },
  {
    title: "Travel without\nthe stress.",
    subtitle: "Your stays, bookings, budget and memories — always with you.",
    image:
      "https://images.unsplash.com/photo-1591233244187-ffd622c51fbd?w=800&h=900&fit=crop&auto=format",
    accent: "#0f766e",
    cta: true,
  },
]

export default function OnboardingScreen({ navigate }: Props) {
  const { user } = useAuth()
  const [current, setCurrent] = useState(0)
  const isDesktop = useIsDesktop()
  const slide = slides[current]

  const handleFinish = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("trypo_has_seen_onboarding", "true")
    }
    if (user) navigate("home")
    else navigate("auth")
  }

  const next = () => {
    if (current < slides.length - 1) setCurrent((c) => c + 1)
    else handleFinish()
  }

  return (
    <div className="h-full flex flex-col bg-[#0D0F2E] relative overflow-hidden">
      {/* Image area */}
      <div
        className={isDesktop ? "relative flex-shrink-0 overflow-hidden bg-slate-900 w-full" : "relative h-[56%] flex-shrink-0 overflow-hidden bg-slate-900"}
        style={isDesktop ? { height: "42vh" } : undefined}
      >
        <img
          src={slide.image}
          alt="Travel destination"
          className="w-full h-full object-cover"
          style={{ transition: "opacity 0.4s ease" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(13,15,46,0.1) 0%, rgba(13,15,46,0.6) 70%, #0D0F2E 100%)",
          }}
        />

        {/* Skip */}
        <button
          onClick={handleFinish}
          className="absolute top-12 right-5 text-white/70 text-sm font-semibold px-4 py-2 rounded-full cursor-pointer active:scale-95 transition-transform"
          style={{
            background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          Skip
        </button>

        {/* Slide number */}
        <div className="absolute bottom-6 left-6">
          <span className="text-white/40 text-xs font-medium">
            {String(current + 1).padStart(2, "0")} /{" "}
            {String(slides.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-between px-7 pt-7 pb-8 w-full md:max-w-md md:mx-auto">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-black text-white leading-tight whitespace-pre-line">
            {slide.title}
          </h2>
          <p className="text-white/55 text-[15px] leading-relaxed">
            {slide.subtitle}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Dot indicators */}
          <div className="flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  height: "4px",
                  width: i === current ? "28px" : "8px",
                  borderRadius: "2px",
                  background:
                    i === current ? "#06C4D4" : "rgba(255,255,255,0.2)",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
          </div>

          <button
            onClick={next}
            className="w-full py-4 rounded-2xl text-white font-bold text-[16px]"
            style={{
              background: "linear-gradient(135deg, #3B41C8 0%, #06C4D4 100%)",
              boxShadow: "0 12px 32px rgba(59,65,200,0.35)",
            }}
          >
            {slide.cta ? "Start Exploring" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  )
}
