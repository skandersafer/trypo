import type { CommunityTrip, CommunityTripPlan } from "./trips"

export type CommunityTripSelection = {
  meta: CommunityTrip
  plan: CommunityTripPlan
}

let selection: CommunityTripSelection | null = null

export function setCommunityTripSelection(trip: CommunityTripSelection) {
  selection = trip
}

export function getCommunityTripSelection(): CommunityTripSelection | null {
  return selection
}

export function clearCommunityTripSelection() {
  selection = null
}