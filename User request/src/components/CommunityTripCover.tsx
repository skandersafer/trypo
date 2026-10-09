import { useEffect, useState } from "react"
import { getDestinationGuide } from "../lib/travelApi"

export const COMMUNITY_FALLBACK_COVER =
  "https://images.unsplash.com/photo-1532370184535-22cec5ca8480?w=800&h=450&fit=crop&auto=format"

/** "2026-09-21" → "21 Sep 2026". Falls back to the raw value when unparseable. */
export function formatTripDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** "21 Sep 2026 – 26 Sep 2026", a single date, or null when dateless. */
export function formatTripDateRange(
  start?: string | null,
  end?: string | null,
): string | null {
  const s = formatTripDate(start)
  const e = formatTripDate(end)
  if (s && e) return s === e ? s : `${s} – ${e}`
  return s || e
}

interface Props {
  coverImageUrl?: string | null
  /** First destination city — used to fetch a real cover when none is set. */
  city?: string | null
  country?: string | null
  title: string
  className?: string
}

/**
 * Community trip cover: the trip's own photo when set, otherwise a real
 * Wikipedia photo of the first destination city (cached per city), instead
 * of the same beach fallback on every card.
 */
export default function CommunityTripCover({
  coverImageUrl,
  city,
  country,
  title,
  className,
}: Props) {
  const [img, setImg] = useState(coverImageUrl || COMMUNITY_FALLBACK_COVER)

  useEffect(() => {
    if (coverImageUrl) {
      setImg(coverImageUrl)
      return
    }
    const place = (city || "").trim()
    if (!place) return
    let alive = true
    void getDestinationGuide(place, (country || "").trim() || undefined)
      .then((g) => {
        if (alive && g?.wikiImage) setImg(g.wikiImage)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [coverImageUrl, city, country])

  return <img src={img} alt={title} className={className} loading="lazy" />
}
