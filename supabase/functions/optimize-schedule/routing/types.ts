export type AppointmentLocationMode =
  | "inherit"
  | "studio"
  | "patient"
  | "custom";

export type ResolvedLocationSource = "studio" | "patient" | "custom";

export interface LocationCandidate {
  address?: string | null;
  addressHash?: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface LocationResolutionInput {
  mode: AppointmentLocationMode;
  studio: LocationCandidate | null;
  patient: LocationCandidate | null;
  custom: LocationCandidate | null;
}

export interface ResolvedLocation {
  key: string;
  source: ResolvedLocationSource;
  latitude: number | null;
  longitude: number | null;
  addressHash: string | null;
}

export type TravelMode = "foot-walking" | "driving-car";
