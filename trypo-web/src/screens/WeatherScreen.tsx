import { useEffect, useState } from "react"
import type { Screen } from "../App"
import { getWeatherForTripCities, type WeatherSnapshot } from "../lib/travelApi"
import { getTripDetails, getActiveTripId } from "../lib/trips"
import { useSettings, formatTemp, formatWind } from "../lib/settings"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

export default function WeatherScreen({ navigate, goBack }: Props) {
  const { settings } = useSettings()
  const isDesktop = useIsDesktop()
  const [weather, setWeather] = useState<WeatherSnapshot[]>([])
  const [tripTitle, setTripTitle] = useState<string>("Mon Voyage")
  const [loading, setLoading] = useState(true)
  const [activeCity, setActiveCity] = useState(0)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    async function loadWeather() {
      setLoading(true)
      try {
        // Offline → serve last cached snapshot immediately
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          try {
            const cached = localStorage.getItem("trypo_weather_cache_v1")
            if (cached) {
              const parsed = JSON.parse(cached)
              if (parsed?.weather?.length) {
                setWeather(parsed.weather)
                setTripTitle(parsed.tripTitle || "Mon Voyage")
                setFromCache(true)
                setLoading(false)
                return
              }
            }
          } catch {}
        }
        const trip = await getTripDetails(getActiveTripId())
        setTripTitle(trip?.title || "Mon Voyage")

        let tripCities: string[] = (trip?.trip_destinations || [])
          .map((d) => d.city?.trim())
          .filter(Boolean) as string[]

        if (tripCities.length === 0 && trip?.title) {
          // If title has a city or country name, try to extract it
          const cleaned = trip.title.replace(/[^\p{L}\s]/gu, "").trim()
          if (cleaned) {
            tripCities = [cleaned.split(" ")[0]]
          }
        }

        if (tripCities.length === 0) {
          tripCities = ["Tunis", "Sousse", "Sfax"]
        }

        // Deduplicate cities
        const uniqueCities = [...new Set(tripCities)]
        const data = await getWeatherForTripCities(uniqueCities)
        if (data && data.length > 0) {
          setWeather(data)
          setFromCache(false)
          try {
            localStorage.setItem("trypo_weather_cache_v1", JSON.stringify({ weather: data, tripTitle: trip?.title || "Mon Voyage", savedAt: new Date().toISOString() }))
          } catch {}
        } else {
          // Fallback if network issue
          const fallback = await getWeatherForTripCities(["Tunis", "Sousse", "Sfax"])
          setWeather(fallback)
        }
      } catch (e) {
        console.warn("Could not load dynamic trip weather:", e)
        // Last resort: cached snapshot for true offline mode
        try {
          const cached = localStorage.getItem("trypo_weather_cache_v1")
          if (cached) {
            const parsed = JSON.parse(cached)
            if (parsed?.weather?.length) {
              setWeather(parsed.weather)
              setTripTitle(parsed.tripTitle || "Mon Voyage")
              setFromCache(true)
              return
            }
          }
        } catch {}
        const fallback = await getWeatherForTripCities(["Tunis", "Sousse", "Sfax"])
        setWeather(fallback)
      } finally {
        setLoading(false)
      }
    }

    void loadWeather()
  }, [])

  const dest = weather[activeCity]

  if (loading || !dest) {
    return (
      <div className="min-h-full bg-surface flex items-center justify-center px-5">
        <div className="text-center text-navy font-bold">
          <p className="text-3xl mb-2">⛅</p>
          <p>Chargement météo en direct…</p>
        </div>
      </div>
    )
  }

  const tempColor =
    dest.temp > 30 ? "#FF6347" : dest.temp > 22 ? "#06C4D4" : "#3B41C8"

  return (
    <div className="min-h-full bg-surface pb-8">
      <div className="px-5 md:px-8 flex items-center gap-3 mb-5">
        <div>
          <h1 className="text-[20px] font-black text-navy">Météo en direct</h1>
          <p className="text-slate-400 text-[12px] font-medium">
            {tripTitle} · {fromCache ? "📶 Offline cache" : "Prévisions temps réel"} · {settings.units === "imperial" ? "°F, mph" : "°C, km/h"}
          </p>
        </div>
      </div>

      <div className="flex gap-2 px-5 md:px-8 mb-5 overflow-x-auto pb-1">
        {weather.map((d, i) => (
          <button
            key={d.city}
            onClick={() => setActiveCity(i)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-[12px] font-bold transition-all"
            style={{
              background: i === activeCity ? "#3B41C8" : "white",
              color: i === activeCity ? "white" : "#64748b",
              boxShadow:
                i === activeCity
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {d.city}
          </button>
        ))}
      </div>

      <div
        className="mx-5 md:mx-8 rounded-[24px] p-5 mb-5 overflow-hidden relative"
        style={{
          background:
            "linear-gradient(145deg, #0D0F2E 0%, #1a2060 60%, #0a3060 100%)",
          boxShadow: "0 12px 36px rgba(13,15,46,0.35)",
        }}
      >
        <div
          className="absolute top-[-30px] right-[-30px] w-[120px] h-[120px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #06C4D4, transparent)",
          }}
        />

        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-white/60 text-[12px] font-medium">{dest.date}</p>
            <h2 className="text-white font-black text-[24px]">{dest.city}</h2>
            <p className="text-white/50 text-[12px]">{dest.country}</p>
          </div>
          <span className="text-[48px]">{dest.icon}</span>
        </div>

        <div className="flex items-end gap-3 mb-4">
          <span
            className="font-black text-[64px] leading-none"
            style={{ color: tempColor }}
          >
            {formatTemp(dest.temp, settings.units).replace("°C", "°").replace("°F", "°")}
          </span>
          <div className="mb-3">
            <p className="text-white font-bold text-[14px]">{dest.condition}</p>
            <p className="text-white/50 text-[11px]">
              Feels like {formatTemp(dest.feels, settings.units)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: "💧", label: "Humidity", value: `${dest.humidity}%` },
            { icon: "🌧", label: "Rain chance", value: `${dest.rain}%` },
            { icon: "💨", label: "Wind", value: formatWind(dest.wind, settings.units) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl py-2 px-2 text-center"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              <span className="text-base">{s.icon}</span>
              <p className="text-white font-black text-[13px]">{s.value}</p>
              <p className="text-white/40 text-[9px] font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 md:px-8 mb-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          4-Day Forecast
        </p>
        <div className="flex gap-2 md:grid md:grid-cols-4">
          {dest.forecast.map((f) => (
            <div
              key={f.day}
              className="flex-1 bg-white rounded-2xl p-3 flex flex-col items-center gap-1.5"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
            >
              <p className="text-[9px] font-bold text-slate-400 text-center">{f.day}</p>
              <span className="text-xl">{f.icon}</span>
              <p className="text-navy font-black text-[13px]">{formatTemp(f.high, settings.units)}</p>
              <p className="text-slate-400 text-[10px]">{formatTemp(f.low, settings.units)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 md:px-8 pb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          All Stops
        </p>
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-2"}>
          {weather.map((d) => (
            <div
              key={d.city}
              className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between"
              style={{ boxShadow: "0 2px 6px rgba(59,65,200,0.05)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{d.icon}</span>
                <div>
                  <p className="text-navy font-bold text-[13px]">{d.city}</p>
                  <p className="text-slate-400 text-[11px]">{d.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-navy font-black text-[16px]">{formatTemp(d.temp, settings.units)}</p>
                <p className="text-slate-400 text-[10px]">{d.condition}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
