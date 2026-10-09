export type ExternalServiceCategory =
  | "Accommodation"
  | "Flights"
  | "Transport"
  | "Ferries"
  | "Activities"

export type ExternalProviderConfig = {
  id: string
  name: string
  category: ExternalServiceCategory
  icon: string
  homepage?: string
  url: string
}

export type ExternalSearchContext = {
  destination: string
  arrivalDate: string
  departureDate: string
  city: string
  country?: string
  tripTitle?: string
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const formatDateForProvider = (date: string) => {
  if (!date) return ""
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toISOString().slice(0, 10)
}

export const getExternalSearchContext = (trip: any): ExternalSearchContext => {
  const destination =
    trip?.trip_destinations?.[0]?.city ||
    trip?.destination ||
    trip?.city ||
    trip?.title?.split("-")?.[0]?.trim() ||
    "Bangkok"

  const arrivalDate =
    trip?.trip_destinations?.[0]?.arrival_date ||
    trip?.start_date ||
    "2027-01-10"

  const departureDate =
    trip?.trip_destinations?.[0]?.departure_date ||
    trip?.end_date ||
    "2027-01-13"

  return {
    destination,
    city: destination,
    arrivalDate: formatDateForProvider(arrivalDate),
    departureDate: formatDateForProvider(departureDate),
    tripTitle: trip?.title || "Trip",
    country: trip?.country || trip?.destination_country || "",
  }
}

const buildAccommodationUrl = (provider: string, context: ExternalSearchContext) => {
  const dest = encodeURIComponent(context.destination)
  const checkin = encodeURIComponent(context.arrivalDate)
  const checkout = encodeURIComponent(context.departureDate)

  const templateMap: Record<string, string> = {
    booking: `https://www.booking.com/searchresults.html?ss=${dest}&checkin=${checkin}&checkout=${checkout}`,
    hostelworld: `https://www.hostelworld.com/search?search=${dest}&dateFrom=${checkin}&dateTo=${checkout}`,
    airbnb: `https://www.airbnb.com/s/${encodeURIComponent(context.city)}?checkin=${checkin}&checkout=${checkout}`,
  }

  return templateMap[provider] || "https://www.google.com/search?q=" + encodeURIComponent(`${context.destination} accommodation`)
}

const buildFlightTransportUrl = (provider: string, context: ExternalSearchContext) => {
  const dest = encodeURIComponent(context.destination)
  const origin = encodeURIComponent("home")

  const templateMap: Record<string, string> = {
    skyscanner: `https://www.skyscanner.com/transport/flights/${origin}/${dest}/?adults=1&currency=EUR&date=${context.arrivalDate}`,
    kayak: `https://www.kayak.com/flights?origin=anywhere&destination=${dest}&depart=${context.arrivalDate}&return=${context.departureDate}`,
    omio: `https://www.omio.com/search?destination=${dest}&departureDate=${context.arrivalDate}&returnDate=${context.departureDate}`,
    rome2rio: `https://www.rome2rio.com/map/${encodeURIComponent(context.city)}/${encodeURIComponent(context.country || context.city)}`,
  }

  return templateMap[provider] || `https://www.google.com/search?q=${encodeURIComponent(`${context.destination} travel`)} `
}

const buildFerryUrl = (provider: string, context: ExternalSearchContext) => {
  const dest = encodeURIComponent(context.destination)
  const templateMap: Record<string, string> = {
    ferryhopper: `https://www.ferryhopper.com/en/search?from=home&to=${dest}`,
    directferries: `https://www.directferries.com/search?destination=${dest}`,
  }

  return templateMap[provider] || `https://www.google.com/search?q=${encodeURIComponent(`${context.destination} ferry tickets`)} `
}

const buildActivityUrl = (provider: string, context: ExternalSearchContext) => {
  const dest = encodeURIComponent(context.destination)
  const templateMap: Record<string, string> = {
    getyourguide: `https://www.getyourguide.com/s/?q=${dest}`,
    viator: `https://www.viator.com/searchResults/all?search=${dest}`,
  }

  return templateMap[provider] || `https://www.google.com/search?q=${encodeURIComponent(`${context.destination} activities`)} `
}

const providerCatalog: Record<ExternalServiceCategory, Omit<ExternalProviderConfig, "url">[]> = {
  Accommodation: [
    { id: "booking", name: "Booking.com", category: "Accommodation", icon: "🏨", homepage: "https://www.booking.com" },
    { id: "hostelworld", name: "Hostelworld", category: "Accommodation", icon: "🛏️", homepage: "https://www.hostelworld.com" },
    { id: "airbnb", name: "Airbnb", category: "Accommodation", icon: "🏠", homepage: "https://www.airbnb.com" },
  ],
  Flights: [
    { id: "skyscanner", name: "Skyscanner", category: "Flights", icon: "✈️", homepage: "https://www.skyscanner.com" },
    { id: "kayak", name: "Kayak", category: "Flights", icon: "🛫", homepage: "https://www.kayak.com" },
  ],
  Transport: [
    { id: "omio", name: "Omio", category: "Transport", icon: "🚆", homepage: "https://www.omio.com" },
    { id: "rome2rio", name: "Rome2Rio", category: "Transport", icon: "🚍", homepage: "https://www.rome2rio.com" },
  ],
  Ferries: [
    { id: "ferryhopper", name: "Ferryhopper", category: "Ferries", icon: "⛴️", homepage: "https://www.ferryhopper.com" },
    { id: "directferries", name: "Direct Ferries", category: "Ferries", icon: "🛳️", homepage: "https://www.directferries.com" },
  ],
  Activities: [
    { id: "getyourguide", name: "GetYourGuide", category: "Activities", icon: "🎟️", homepage: "https://www.getyourguide.com" },
    { id: "viator", name: "Viator", category: "Activities", icon: "🧭", homepage: "https://www.viator.com" },
  ],
}

const categoryBuilders: Record<ExternalServiceCategory, (providerId: string, context: ExternalSearchContext) => string> = {
  Accommodation: buildAccommodationUrl,
  Flights: buildFlightTransportUrl,
  Transport: buildFlightTransportUrl,
  Ferries: buildFerryUrl,
  Activities: buildActivityUrl,
}

export const getExternalProvidersForTrip = (trip: any) => {
  const context = getExternalSearchContext(trip)

  return (Object.keys(providerCatalog) as ExternalServiceCategory[]).map((category) => ({
    category,
    providers: providerCatalog[category].map((provider) => ({
      ...provider,
      url: categoryBuilders[category](provider.id, context),
      summary: provider.id === "booking" ? `${context.destination} · ${context.arrivalDate} → ${context.departureDate}` : undefined,
    })),
  }))
}

export const getExternalProviderSearchUrl = (providerId: string, trip: any) => {
  const context = getExternalSearchContext(trip)
  const category = (Object.keys(providerCatalog) as ExternalServiceCategory[]).find((key) =>
    providerCatalog[key].some((provider) => provider.id === providerId),
  )

  if (!category) return "https://www.google.com/search?q=" + encodeURIComponent(context.destination)

  return categoryBuilders[category](providerId, context)
}

export const getExternalProviderLabel = (category: ExternalServiceCategory) => {
  const labelMap: Record<ExternalServiceCategory, string> = {
    Accommodation: "Accommodation",
    Flights: "Flights",
    Transport: "Transport",
    Ferries: "Ferries",
    Activities: "Activities",
  }

  return labelMap[category]
}

export const getDefaultExternalContext = () =>
  getExternalSearchContext({
    title: "Bangkok trip",
    trip_destinations: [{ city: "Bangkok", arrival_date: "2027-01-10", departure_date: "2027-01-13" }],
    start_date: "2027-01-10",
    end_date: "2027-01-13",
  })
