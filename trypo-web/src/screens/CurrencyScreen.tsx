import { useState, useEffect } from "react"
import type { Screen } from "../App"
import {
  SUPPORTED_CURRENCIES,
  fetchLiveRates,
  getStoredRates,
  convertAmount,
  getRelativeRate,
  type ExchangeRatesData,
} from "../lib/currencyApi"
import { useSettings } from "../lib/settings"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const quickAmounts = [1, 5, 10, 20, 50, 100]

export default function CurrencyScreen({ navigate, goBack }: Props) {
  const { settings, update } = useSettings()
  const isDesktop = useIsDesktop()
  const [ratesData, setRatesData] = useState<ExchangeRatesData>(getStoredRates)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [amount, setAmount] = useState("100")
  const [from, setFrom] = useState(settings.currency || "USD")
  const [to, setTo] = useState("TND")

  // Keep converter source in sync when the global Settings currency changes
  useEffect(() => {
    setFrom(settings.currency)
  }, [settings.currency])

  const setFromAndSaveDefault = (code: string) => {
    setFrom(code)
    if (code !== settings.currency) update({ currency: code })
  }

  const refreshRates = async () => {
    // Offline mode / no network → use cached rates only
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setRatesData(getStoredRates())
      return
    }
    setIsRefreshing(true)
    try {
      const data = await fetchLiveRates()
      setRatesData(data)
    } finally {
      setTimeout(() => setIsRefreshing(false), 400)
    }
  }

  useEffect(() => {
    // Initial fetch
    void refreshRates()

    // Auto refresh every 60s (skipped while offline)
    const timer = setInterval(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void fetchLiveRates().then(setRatesData)
    }, 60000)

    const onCurrencyUpdated = (e: any) => {
      if (e.detail?.rates) {
        setRatesData(getStoredRates())
      }
    }
    window.addEventListener("trypo:currency_updated", onCurrencyUpdated)

    return () => {
      clearInterval(timer)
      window.removeEventListener("trypo:currency_updated", onCurrencyUpdated)
    }
  }, [])

  const handleAmountChange = (val: string) => {
    const sanitized = val.replace(/,/g, ".").replace(/[^0-9.]/g, "")
    const parts = sanitized.split(".")
    if (parts.length > 2) return
    setAmount(sanitized)
  }

  const numAmount = parseFloat(amount) || 0
  const rawResult = convertAmount(numAmount, from, to, ratesData.rates)
  const formattedResult =
    amount.trim() === ""
      ? "0.00"
      : rawResult.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })

  const relativeRate = getRelativeRate(from, to, ratesData.rates)
  const formattedRelativeRate =
    relativeRate >= 100
      ? relativeRate.toFixed(1)
      : relativeRate >= 1
        ? relativeRate.toFixed(3)
        : relativeRate.toFixed(4)

  const inputFontSize =
    amount.length > 9
      ? "text-[18px]"
      : amount.length > 6
        ? "text-[22px]"
        : "text-[28px]"

  const resultFontSize =
    formattedResult.length > 12
      ? "text-[16px]"
      : formattedResult.length > 9
        ? "text-[20px]"
        : formattedResult.length > 7
          ? "text-[24px]"
          : "text-[28px]"

  const swap = () => {
    const nextFrom = to
    const nextTo = from
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom !== settings.currency) update({ currency: nextFrom })
  }

  const fromInfo = SUPPORTED_CURRENCIES[from] || { name: from, flag: "🌐", symbol: from }
  const toInfo = SUPPORTED_CURRENCIES[to] || { name: to, flag: "🌐", symbol: to }

  return (
    <div className="min-h-full w-full max-w-full overflow-x-hidden bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goBack("trip-overview")}
            className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 cursor-pointer active:scale-95 transition-transform"
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
          <div className="min-w-0">
            <h1 className={isDesktop ? "text-[20px] md:text-[24px] font-black text-navy max-w-none" : "text-[20px] font-black text-navy truncate"}>
              Currency Converter
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-slate-400 text-[11px] font-medium truncate">
                Live Google Rates · Realtime
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={refreshRates}
          disabled={isRefreshing}
          className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-500 hover:text-navy cursor-pointer active:scale-90 transition-all"
          style={{ boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
          title="Refresh rates"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className={isRefreshing ? "animate-spin text-brand" : ""}
          >
            <path
              d="M13.5 8a5.5 5.5 0 11-1.61-3.89M13.5 1.5v3h-3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Converter */}
      <div className="px-5 md:px-8 mb-5">
        <div
          className="bg-white rounded-[24px] p-5 overflow-hidden w-full max-w-full"
          style={{ boxShadow: "0 4px 20px rgba(59,65,200,0.1)" }}
        >
          {/* From */}
          <div className="mb-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              From
            </label>
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              <select
                value={from}
                onChange={(e) => setFromAndSaveDefault(e.target.value)}
                className="flex-shrink-0 font-black text-[14px] text-navy outline-none bg-surface rounded-xl px-2.5 py-2 border border-slate-100 cursor-pointer"
              >
                {Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => (
                  <option key={code} value={code}>
                    {info.flag} {code}
                  </option>
                ))}
              </select>
              <div className="flex-1 min-w-0 flex items-center justify-end overflow-hidden">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={`w-full min-w-0 text-right ${inputFontSize} font-black text-navy outline-none bg-transparent placeholder-slate-300`}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-slate-400 text-[11px] mt-1.5 truncate">
              {fromInfo.name}
            </p>
          </div>

          {/* Swap button */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-[1px] bg-slate-100" />
            <button
              onClick={swap}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer active:scale-95 transition-transform"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                boxShadow: "0 4px 12px rgba(59,65,200,0.3)",
              }}
              title="Invert currencies"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 6L8 2l4 4M12 10l-4 4-4-4"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="flex-1 h-[1px] bg-slate-100" />
          </div>

          {/* To */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              To
            </label>
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-shrink-0 font-black text-[14px] text-navy outline-none bg-surface rounded-xl px-2.5 py-2 border border-slate-100 cursor-pointer"
              >
                {Object.entries(SUPPORTED_CURRENCIES).map(([code, info]) => (
                  <option key={code} value={code}>
                    {info.flag} {code}
                  </option>
                ))}
              </select>
              <div className="flex-1 min-w-0 text-right overflow-hidden">
                <p
                  className={`${resultFontSize} font-black truncate leading-tight`}
                  style={{
                    background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                  title={formattedResult}
                >
                  {formattedResult}
                </p>
              </div>
            </div>
            <p className="text-slate-400 text-[11px] mt-1.5 truncate">{toInfo.name}</p>
          </div>
        </div>
      </div>

      {/* Live Rate display */}
      <div
        className="mx-5 md:mx-8 rounded-2xl p-3.5 flex items-center justify-between mb-5"
        style={{ background: "rgba(59,65,200,0.06)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[14px]">📊</span>
          <span className="text-slate-600 text-[12px] font-semibold">Live Market rate</span>
        </div>
        <span className="text-brand font-black text-[13px]">
          1 {from} = {formattedRelativeRate} {to}
        </span>
      </div>

      {/* Quick amounts */}
      <div className="px-5 md:px-8 mb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Quick Convert
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {quickAmounts.map((qa) => {
            const qResult = convertAmount(qa, from, to, ratesData.rates)
            const formattedQ =
              qResult >= 1000
                ? Math.round(qResult).toLocaleString()
                : qResult.toFixed(1)
            return (
              <button
                key={qa}
                onClick={() => setAmount(String(qa))}
                className="bg-white rounded-2xl p-3 text-center active:scale-95 transition-transform cursor-pointer"
                style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
              >
                <p className="text-navy font-black text-[14px]">
                  {qa} {from}
                </p>
                <p className="text-slate-400 text-[11px] font-semibold mt-0.5">
                  ≈ {formattedQ} {to}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* All rates */}
      <div className="px-5 md:px-8 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Live Rates · Base: {from}
          </p>
          <span className="text-[10px] text-emerald-600 font-bold">
            ● Real-time
          </span>
        </div>
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-2"}>
          {Object.entries(SUPPORTED_CURRENCIES)
            .filter(([code]) => code !== from)
            .map(([code, info]) => {
              const liveRate = getRelativeRate(from, code, ratesData.rates)
              const formattedLiveRate =
                liveRate >= 100
                  ? liveRate.toFixed(2)
                  : liveRate >= 1
                    ? liveRate.toFixed(3)
                    : liveRate.toFixed(4)

              return (
                <button
                  key={code}
                  onClick={() => setTo(code)}
                  className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between text-left hover:border-brand/30 border border-transparent transition-all cursor-pointer"
                  style={{ boxShadow: "0 2px 6px rgba(59,65,200,0.05)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{info.flag}</span>
                    <div>
                      <p className="text-navy font-bold text-[13px]">{code}</p>
                      <p className="text-slate-400 text-[11px]">{info.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-navy font-black text-[14px]">
                      {formattedLiveRate}
                    </span>
                    <span className="text-slate-400 text-[10px] block">
                      {info.symbol}
                    </span>
                  </div>
                </button>
              )
            })}
        </div>
      </div>
    </div>
  )
}

