export interface CurrencyInfo {
  code: string
  name: string
  flag: string
  symbol: string
  defaultRate: number // Rate against 1 USD
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: "USD", name: "US Dollar", flag: "🇺🇸", symbol: "$", defaultRate: 1 },
  EUR: { code: "EUR", name: "Euro", flag: "🇪🇺", symbol: "€", defaultRate: 0.86 },
  TND: { code: "TND", name: "Tunisian Dinar", flag: "🇹🇳", symbol: "DT", defaultRate: 2.91 },
  GBP: { code: "GBP", name: "British Pound", flag: "🇬🇧", symbol: "£", defaultRate: 0.74 },
  CAD: { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦", symbol: "CA$", defaultRate: 1.36 },
  AED: { code: "AED", name: "UAE Dirham", flag: "🇦🇪", symbol: "AED", defaultRate: 3.67 },
  JPY: { code: "JPY", name: "Japanese Yen", flag: "🇯🇵", symbol: "¥", defaultRate: 153.2 },
  CHF: { code: "CHF", name: "Swiss Franc", flag: "🇨🇭", symbol: "CHF", defaultRate: 0.81 },
  AUD: { code: "AUD", name: "Australian Dollar", flag: "🇦🇺", symbol: "A$", defaultRate: 1.44 },
  MAD: { code: "MAD", name: "Moroccan Dirham", flag: "🇲🇦", symbol: "MAD", defaultRate: 9.35 },
  DZD: { code: "DZD", name: "Algerian Dinar", flag: "🇩🇿", symbol: "DZD", defaultRate: 130.5 },
  TRY: { code: "TRY", name: "Turkish Lira", flag: "🇹🇷", symbol: "₺", defaultRate: 38.2 },
  THB: { code: "THB", name: "Thai Baht", flag: "🇹🇭", symbol: "฿", defaultRate: 31.8 },
  SAR: { code: "SAR", name: "Saudi Riyal", flag: "🇸🇦", symbol: "SAR", defaultRate: 3.75 },
}

const CACHE_KEY = "trypo_live_currency_rates_v1"
const CACHE_TIME_KEY = "trypo_live_currency_time_v1"

export interface ExchangeRatesData {
  base: string
  rates: Record<string, number>
  lastUpdated: string
  isLive: boolean
}

const getDefaultRates = (): Record<string, number> => {
  const defaults: Record<string, number> = {}
  for (const [code, info] of Object.entries(SUPPORTED_CURRENCIES)) {
    defaults[code] = info.defaultRate
  }
  return defaults
}

export function getStoredRates(): ExchangeRatesData {
  if (typeof window === "undefined") {
    return {
      base: "USD",
      rates: getDefaultRates(),
      lastUpdated: new Date().toISOString(),
      isLive: false,
    }
  }

  try {
    const saved = localStorage.getItem(CACHE_KEY)
    const savedTime = localStorage.getItem(CACHE_TIME_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        base: "USD",
        rates: { ...getDefaultRates(), ...parsed },
        lastUpdated: savedTime || new Date().toISOString(),
        isLive: true,
      }
    }
  } catch (e) {
    console.warn("Error reading stored currency rates", e)
  }

  return {
    base: "USD",
    rates: getDefaultRates(),
    lastUpdated: new Date().toISOString(),
    isLive: false,
  }
}

export async function fetchLiveRates(): Promise<ExchangeRatesData> {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(`Currency API returned status ${response.status}`)
    }

    const data = await response.json()
    if (data && data.rates) {
      const liveRates = data.rates as Record<string, number>
      const updatedTime = data.time_last_update_utc || new Date().toISOString()

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(liveRates))
          localStorage.setItem(CACHE_TIME_KEY, updatedTime)
          window.dispatchEvent(new CustomEvent("trypo:currency_updated", { detail: { rates: liveRates, time: updatedTime } }))
        } catch {
          // ignore
        }
      }

      return {
        base: "USD",
        rates: { ...getDefaultRates(), ...liveRates },
        lastUpdated: updatedTime,
        isLive: true,
      }
    }
  } catch (error) {
    console.warn("Failed to fetch live currency rates, falling back to cache/defaults", error)
  }

  return getStoredRates()
}

export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number>,
): number {
  if (fromCode === toCode) return amount
  const fromRate = rates[fromCode] || 1
  const toRate = rates[toCode] || 1
  const inUSD = amount / fromRate
  return inUSD * toRate
}

export function getRelativeRate(
  fromCode: string,
  toCode: string,
  rates: Record<string, number>,
): number {
  const fromRate = rates[fromCode] || 1
  const toRate = rates[toCode] || 1
  return toRate / fromRate
}

