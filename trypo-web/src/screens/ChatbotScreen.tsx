import { useState, useRef, useEffect } from "react"
import type { Screen } from "../App"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

type Role = "bot" | "user"
type GeneratedPlan = {
  dest: string
  flag: string
  budget: string
  days: string
  best: string
  stops: { city: string; duration: string; highlights: string[] }[]
}
type Msg = {
  role: Role
  text: string
  id: number
  chips?: string[]
  tripPlan?: GeneratedPlan
}

// ── Knowledge base ──────────────────────────────────────────────────────────

const DESTINATIONS: Record<string, {
  flag: string
  best: string
  budget: string
  days: string
  vibe: string
  must: string[]
  stay: string[]
  eat: string[]
  transport: string
  avoid: string
  plan: { day: string; title: string; items: string[] }[]
}> = {}

// ── Response engine ─────────────────────────────────────────────────────────

let msgId = 0
const id = () => ++msgId

function detectDestination(text: string): string | null {
  const t = text.toLowerCase()
  for (const key of Object.keys(DESTINATIONS)) {
    if (t.includes(key)) return key
  }
  // aliases
  if (
    t.includes("thai") ||
    t.includes("bangkok") ||
    t.includes("phuket") ||
    t.includes("chiang mai")
  )
    return "thailand"
  if (
    t.includes("japon") ||
    t.includes("tokyo") ||
    t.includes("kyoto") ||
    t.includes("osaka")
  )
    return "japan"
  if (
    t.includes("maroc") ||
    t.includes("marrakech") ||
    t.includes("casablanca") ||
    t.includes("fes")
  )
    return "morocco"
  if (
    t.includes("viet") ||
    t.includes("hanoi") ||
    t.includes("ho chi minh") ||
    t.includes("saigon")
  )
    return "vietnam"
  if (t.includes("bali") || t.includes("ubud") || t.includes("seminyak"))
    return "bali"
  if (
    t.includes("colombie") ||
    t.includes("medellin") ||
    t.includes("bogota") ||
    t.includes("cartagena")
  )
    return "colombia"
  return null
}

function detectIntent(text: string) {
  const t = text.toLowerCase()
  if (
    t.includes("budget") ||
    t.includes("combien") ||
    t.includes("cost") ||
    t.includes("prix") ||
    t.includes("cheap") ||
    t.includes("cher")
  )
    return "budget"
  if (
    t.includes("plan") ||
    t.includes("itinéraire") ||
    t.includes("itinerary") ||
    t.includes("schedule") ||
    t.includes("programme") ||
    t.includes("jour") ||
    t.includes("day")
  )
    return "plan"
  if (
    t.includes("stay") ||
    t.includes("hostel") ||
    t.includes("hotel") ||
    t.includes("dormir") ||
    t.includes("hébergement")
  )
    return "stay"
  if (
    t.includes("eat") ||
    t.includes("food") ||
    t.includes("manger") ||
    t.includes("cuisine") ||
    t.includes("restaurant")
  )
    return "food"
  if (
    t.includes("transport") ||
    t.includes("comment aller") ||
    t.includes("how to get") ||
    t.includes("train") ||
    t.includes("flight") ||
    t.includes("avion")
  )
    return "transport"
  if (
    t.includes("conseil") ||
    t.includes("advice") ||
    t.includes("tip") ||
    t.includes("warning") ||
    t.includes("éviter") ||
    t.includes("avoid")
  )
    return "tips"
  if (
    t.includes("suggest") ||
    t.includes("recommande") ||
    t.includes("où aller") ||
    t.includes("where") ||
    t.includes("destination") ||
    t.includes("idée")
  )
    return "suggest"
  if (
    t.includes("bonjour") ||
    t.includes("hello") ||
    t.includes("salut") ||
    t.includes("hi") ||
    t.includes("hey")
  )
    return "greet"
  return "general"
}

function buildResponse(
  text: string,
  history: Msg[],
): { text: string; chips?: string[]; tripPlan?: GeneratedPlan } {
  const intent = detectIntent(text)
  const dest =
    detectDestination(text) ??
    detectDestination(history.map((m) => m.text).join(" "))
  const info = dest ? DESTINATIONS[dest] : null

  if (intent === "greet") {
    return {
      text: "Hey! 👋 I'm your trip planner.\n\nI can help you create an itinerary, estimate a budget, decide where to stay, and plan the details of your trip.\n\nJust tell me where you want to go or what you want to plan.",
      chips: ["Plan my trip", "Suggest a destination", "Trip budget", "Where to stay"],
    }
  }

  if (intent === "suggest") {
    return {
      text: "I can help you design a trip around your style and budget.\n\nTell me your destination, travel dates, and vibe — city, beach, nature, or food — and I’ll build your plan from scratch.",
      chips: ["City trip", "Beach trip", "Nature trip", "Food trip"],
    }
  }

  if (!info) {
    if (intent === "plan" || intent === "general") {
      return {
        text: "I’m ready to help you plan your trip.\n\nTell me your destination, trip length, budget, and travel style, and I’ll turn it into a clear itinerary.",
        chips: ["My destination", "Trip length", "Budget", "Travel style"],
      }
    }
    return {
      text: "I’m not sure which destination you mean yet. Tell me the country, city, or vibe you want, and I’ll build the plan around it.",
      chips: ["Beach trip", "City trip", "Nature trip", "Food trip"],
    }
  }

  if (intent === "budget") {
    return {
      text: `💰 **Budget breakdown for ${dest!.charAt(0).toUpperCase() + dest!.slice(1)} ${info.flag}**\n\n**Daily average:** ${info.budget}\n\n• 🏨 Hostel: $10–25/night\n• 🍜 Street food meals: $1–4 each\n• 🚌 Local transport: $2–8/day\n• 🎯 Activities: $5–30/day\n\n**Best time to go:** ${info.best}\n**Recommended stay:** ${info.days}\n\n💡 Pro tip: ${info.avoid.split(".")[0]}.`,
      chips: [
        `${dest} itinerary`,
        `Where to stay in ${dest}`,
        `${dest} food guide`,
      ],
    }
  }

  if (intent === "stay") {
    return {
      text: `🏨 **Best places to stay in ${dest!.charAt(0).toUpperCase() + dest!.slice(1)} ${info.flag}**\n\n${info.stay.map((s) => `• ${s}`).join("\n")}\n\n💡 Book on **Hostelworld** or **Booking.com** — always read recent reviews and check the location on a map first.\n\nWant me to build your full itinerary with these stays included?`,
      chips: [`Full ${dest} plan`, `${dest} food`, `${dest} transport`],
    }
  }

  if (intent === "food") {
    return {
      text: `🍜 **Must-eat in ${dest!.charAt(0).toUpperCase() + dest!.slice(1)} ${info.flag}**\n\n${info.eat.map((e) => `• ${e}`).join("\n")}\n\n💡 **Rule #1:** Eat where locals eat. If there's a queue, join it. Avoid places with photos on laminated menus near tourist spots — always overpriced.\n\nSay *"plan my trip"* and I'll include the best food spots in your itinerary!`,
      chips: [`Plan ${dest} trip`, `${dest} budget`, `${dest} tips`],
    }
  }

  if (intent === "transport") {
    return {
      text: `🚌 **Getting around ${dest!.charAt(0).toUpperCase() + dest!.slice(1)} ${info.flag}**\n\n${info.transport}\n\n💡 **Tip:** Always book transport in advance during high season. Overnight buses/trains save you a night of accommodation costs!\n\nNeed me to plan your full route with transport between each city?`,
      chips: [`Full ${dest} itinerary`, `${dest} budget`, `${dest} tips`],
    }
  }

  if (intent === "tips") {
    return {
      text: `💡 **Insider tips for ${dest!.charAt(0).toUpperCase() + dest!.slice(1)} ${info.flag}**\n\n⚠️ ${info.avoid}\n\n**Best time to visit:** ${info.best}\n\n**Must-do experiences:**\n${info.must
        .slice(0, 4)
        .map((m) => `• ${m}`)
        .join("\n")}\n\nWant the full day-by-day plan?`,
      chips: [`Plan ${dest} trip`, `${dest} food`, `${dest} budget`],
    }
  }

  // plan / general — full itinerary
  const destName = dest!.charAt(0).toUpperCase() + dest!.slice(1)
  const tripPlan: GeneratedPlan = {
    dest: destName,
    flag: info.flag,
    budget: info.budget,
    days: info.days,
    best: info.best,
    stops: info.plan.map((p) => ({
      city: p.title,
      duration: p.day,
      highlights: p.items,
    })),
  }
  return {
    text: `🗺 **${destName} Trip Plan ${info.flag}**\n\n📅 **Best time:** ${info.best}\n💰 **Budget:** ${info.budget}\n⏱ **Ideal duration:** ${info.days}\n✨ **Vibe:** ${info.vibe}\n\n---\n\n${info.plan.map((p) => `**${p.day} — ${p.title}**\n${p.items.map((i) => `• ${i}`).join("\n")}`).join("\n\n")}\n\n---\n\n🚌 **Transport:** ${info.transport}\n\n⚠️ **Remember:** ${info.avoid}`,
    chips: [
      `${dest} budget`,
      `Where to stay`,
      `Best food spots`,
      `Transport tips`,
    ],
    tripPlan,
  }
}

// ── Component ───────────────────────────────────────────────────────────────

const WELCOME: Msg = {
  id: id(),
  role: "bot",
  text: "Hey! 👋 I’m here to help you plan your trip from scratch.\n\nTell me your destination, trip dates, budget, and travel style, and I’ll build the plan with you.",
  chips: ["Plan my trip", "Budget", "Destination", "Travel style"],
}

function renderText(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*.*?\*\*)/g)
    return (
      <span key={i}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
        {i < text.split("\n").length - 1 && <br />}
      </span>
    )
  })
}

export default function ChatbotScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const [messages, setMessages] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const [generatingId, setGeneratingId] = useState<number | null>(null)
  const [generatedId, setGeneratedId] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typing])

  const send = (text: string) => {
    if (!text.trim() || typing) return
    const userMsg: Msg = { id: id(), role: "user", text: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setTyping(true)

    const delay = 800 + Math.random() * 700
    setTimeout(() => {
      const allMsgs = [...messages, userMsg]
      const {
        text: responseText,
        chips,
        tripPlan,
      } = buildResponse(text, allMsgs)
      setMessages((prev) => [
        ...prev,
        { id: id(), role: "bot", text: responseText, chips, tripPlan },
      ])
      setTyping(false)
    }, delay)
  }

  return (
    <div className="flex flex-col h-full md:h-[calc(100dvh-64px)] md:min-h-[500px]" style={{ background: "#f5f6ff" }}>
      {/* Header */}
      <div
        className="flex-shrink-0 pt-12 pb-4 px-5 md:px-8 flex items-center gap-3"
        style={{
          background: "linear-gradient(135deg, #0D0F2E, #1e2080)",
          borderRadius: "0 0 28px 28px",
        }}
      >
        <button
          onClick={() => goBack("home")}
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

        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 4px 12px rgba(59,65,200,0.4)",
          }}
        >
          🤖
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-[16px]">Tripo AI</h1>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            <span className="text-white/50 text-[11px]">
              Travel advisor · always online
            </span>
          </div>
        </div>

        <button
          onClick={() => setMessages([WELCOME])}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.08)" }}
          title="New conversation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8a5 5 0 1 1 2.5 4.33"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M3 11V8h3"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 flex flex-col gap-3 md:max-w-3xl md:mx-auto md:w-full">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            } items-end`}
          >
            {msg.role === "bot" && (
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0 mb-1"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                }}
              >
                🤖
              </div>
            )}

            <div
              className={`flex flex-col gap-2 ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
              style={{ maxWidth: isDesktop ? "65%" : "78%" }}
            >
              <div
                className={`px-4 py-3 rounded-[20px] text-[13px] leading-relaxed ${
                  msg.role === "user" ? "text-white" : "bg-white text-navy"
                }`}
                style={
                  msg.role === "user"
                    ? {
                        background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                        borderBottomRightRadius: "6px",
                      }
                    : {
                        borderBottomLeftRadius: "6px",
                        boxShadow: "0 2px 12px rgba(59,65,200,0.08)",
                      }
                }
              >
                {renderText(msg.text)}
              </div>

              {/* Trip plan CTA card */}
              {msg.tripPlan && msg.role === "bot" && (
                <div
                  className="w-full rounded-[20px] overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, #0D0F2E, #1e2080)",
                    boxShadow: "0 8px 24px rgba(13,15,46,0.3)",
                  }}
                >
                  {/* Plan preview header */}
                  <div className="px-4 pt-4 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{msg.tripPlan.flag}</span>
                      <p className="text-white font-black text-[14px]">
                        {msg.tripPlan.dest} Adventure
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-white/50 text-[11px]">
                        ⏱ {msg.tripPlan.days}
                      </span>
                      <span className="text-white/50 text-[11px]">
                        💰 {msg.tripPlan.budget}
                      </span>
                      <span className="text-white/50 text-[11px]">
                        📅 {msg.tripPlan.best}
                      </span>
                    </div>
                  </div>

                  {/* Stops preview */}
                  <div className="px-4 py-3 flex flex-col gap-2">
                    {msg.tripPlan.stops.map((stop, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                          style={{
                            background:
                              "linear-gradient(135deg, #3B41C8, #06C4D4)",
                          }}
                        >
                          {si + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-[12px]">
                            {stop.city}
                          </p>
                          <p className="text-white/40 text-[10px] truncate">
                            {stop.duration}
                          </p>
                        </div>
                        {si < msg.tripPlan!.stops.length - 1 && (
                          <div className="w-[1px] h-3 bg-white/15 mx-auto" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* CTA button */}
                  {generatedId === msg.id ? (
                    <div
                      className="mx-4 mb-4 py-3 rounded-2xl flex items-center justify-center gap-2"
                      style={{
                        background: "rgba(16,185,129,0.2)",
                        border: "1px solid rgba(16,185,129,0.3)",
                      }}
                    >
                      <span className="text-green-400 font-black text-[13px]">
                        ✓ Trip created! Opening…
                      </span>
                    </div>
                  ) : generatingId === msg.id ? (
                    <div
                      className="mx-4 mb-4 py-3 rounded-2xl flex items-center justify-center gap-2"
                      style={{ background: "rgba(59,65,200,0.2)" }}
                    >
                      <span className="text-white/60 text-[13px] font-bold">
                        Building your trip plan…
                      </span>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-white/40"
                            style={{
                              animation: `bounce 1s ease-in-out ${i * 0.18}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setGeneratingId(msg.id)
                        setTimeout(() => {
                          setGeneratedId(msg.id)
                          setGeneratingId(null)
                          setTimeout(() => navigate("trip-overview"), 900)
                        }, 2200)
                      }}
                      className="mx-4 mb-4 w-[calc(100%-32px)] py-3.5 rounded-2xl flex items-center justify-center gap-2"
                      style={{
                        background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                        boxShadow: "0 6px 20px rgba(59,65,200,0.4)",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M8 2l1.5 4.5H14l-3.7 2.7 1.4 4.3L8 11l-3.7 2.5 1.4-4.3L2 6.5h4.5L8 2z"
                          fill="white"
                        />
                      </svg>
                      <span className="text-white font-black text-[13px]">
                        Créer ce voyage dans Trypo
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Quick reply chips */}
              {msg.chips && msg.role === "bot" && !msg.tripPlan && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {msg.chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => send(chip)}
                      className="px-3 py-1.5 rounded-full text-[11px] font-bold"
                      style={{
                        background: "rgba(59,65,200,0.09)",
                        color: "#3B41C8",
                        border: "1px solid rgba(59,65,200,0.2)",
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typing && (
          <div className="flex gap-2 items-end">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
              }}
            >
              🤖
            </div>
            <div
              className="px-4 py-3 rounded-[20px] bg-white flex gap-1.5 items-center"
              style={{
                borderBottomLeftRadius: "6px",
                boxShadow: "0 2px 12px rgba(59,65,200,0.08)",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: "#3B41C8",
                    opacity: 0.4,
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-4 md:px-8 py-3 flex items-center gap-3 md:max-w-3xl md:mx-auto md:w-full"
        style={{
          background: "white",
          borderTop: "1px solid rgba(59,65,200,0.08)",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input)
          }}
          placeholder="Ask me anything about your trip..."
          className="flex-1 rounded-2xl px-4 py-3 text-[13px] text-navy font-medium outline-none"
          style={{
            background: "#f5f6ff",
            border: "1.5px solid rgba(59,65,200,0.12)",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || typing}
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all"
          style={{
            background:
              input.trim() && !typing
                ? "linear-gradient(135deg, #3B41C8, #06C4D4)"
                : "rgba(59,65,200,0.1)",
            boxShadow:
              input.trim() && !typing
                ? "0 6px 16px rgba(59,65,200,0.35)"
                : "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M15 9H3M15 9l-5-5M15 9l-5 5"
              stroke={input.trim() && !typing ? "white" : "#3B41C8"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
