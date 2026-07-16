import type { TravelMode } from "./types.ts";

export function chooseTravelMode(
  walkingSeconds: number | null,
  thresholdMinutes: number,
): TravelMode {
  if (
    walkingSeconds !== null &&
    Number.isFinite(walkingSeconds) &&
    walkingSeconds >= 0 &&
    walkingSeconds <= thresholdMinutes * 60
  ) {
    return "foot-walking";
  }
  return "driving-car";
}
