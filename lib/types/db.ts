// Type + constant layer mirroring the EXISTING Supabase schema.
// Source of truth = database. Do not add/rename columns here beyond what exists.

export const BUSINESS_TYPES = [
  'physiotherapist', 'dentist', 'barber', 'hairdresser', 'spa', 'beauty_center',
  'psychologist', 'nutritionist', 'personal_trainer', 'consultant', 'veterinarian', 'other',
] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  physiotherapist: 'Physiotherapist', dentist: 'Dentist', barber: 'Barber',
  hairdresser: 'Hairdresser', spa: 'Spa', beauty_center: 'Beauty Center',
  psychologist: 'Psychologist', nutritionist: 'Nutritionist', personal_trainer: 'Personal Trainer',
  consultant: 'Consultant', veterinarian: 'Veterinarian', other: 'Other',
}

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

export const APPOINTMENT_STATUS = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number]

export const BOOKING_SOURCE = ['manual', 'ai', 'future_customer_portal', 'calendar_import'] as const
export type BookingSource = (typeof BOOKING_SOURCE)[number]

export const APPOINTMENT_LOCATION_MODES = ['inherit', 'studio', 'patient', 'custom'] as const
export type AppointmentLocationMode = (typeof APPOINTMENT_LOCATION_MODES)[number]

export const BUSINESS_LOCATION_SOURCES = ['device_geolocation'] as const
export type BusinessLocationSource = (typeof BUSINESS_LOCATION_SOURCES)[number]

export const OPTIMIZATION_GOALS = ['optimize', 'free_period'] as const
export type OptimizationGoal = (typeof OPTIMIZATION_GOALS)[number]

export const ROUTING_PROFILES = ['foot-walking', 'driving-car'] as const
export type RoutingProfile = (typeof ROUTING_PROFILES)[number]

export const AVAILABILITY_PRIORITY = ['low', 'normal', 'high'] as const
export type AvailabilityPriority = (typeof AVAILABILITY_PRIORITY)[number]

export const OPTIMIZATION_MODE = ['conservative', 'balanced', 'aggressive'] as const
export type OptimizationMode = (typeof OPTIMIZATION_MODE)[number]

export const OPTIMIZATION_RESULT = ['preview', 'accepted', 'discarded'] as const
export type OptimizationResult = (typeof OPTIMIZATION_RESULT)[number]

// Only languages with a full interface translation (lib/i18n) are offered.
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'it', label: 'Italiano' },
  { value: 'es', label: 'Español' },
] as const

// Supported currencies. `locale` drives Intl number formatting so amounts read
// natural for that currency (grouping, decimal separator, symbol position).
export const CURRENCIES = [
  { value: 'EUR', label: 'Euro (€)', locale: 'it-IT' },
  { value: 'USD', label: 'US Dollar ($)', locale: 'en-US' },
  { value: 'GBP', label: 'British Pound (£)', locale: 'en-GB' },
  { value: 'CHF', label: 'Swiss Franc (CHF)', locale: 'de-CH' },
  { value: 'CAD', label: 'Canadian Dollar (C$)', locale: 'en-CA' },
  { value: 'AUD', label: 'Australian Dollar (A$)', locale: 'en-AU' },
  { value: 'SEK', label: 'Swedish Krona (kr)', locale: 'sv-SE' },
  { value: 'JPY', label: 'Japanese Yen (¥)', locale: 'ja-JP' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['value']

export const CURRENCY_LOCALE: Record<string, string> = Object.fromEntries(
  CURRENCIES.map((c) => [c.value, c.locale]),
)

export const TIMEZONES = [
  'Europe/Rome', 'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin',
  'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata',
] as const

// ---- Row types (subset of columns actually used by the app) ----
export interface Profile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  phone: string | null
  language: string
  timezone: string
  onboarding_completed: boolean
}

export interface Business {
  id: string
  profile_id: string
  business_name: string
  business_type: BusinessType
  address: string | null
  city: string | null
  postal_code: string | null
  location_latitude: number | null
  location_longitude: number | null
  location_accuracy_meters: number | null
  location_source: BusinessLocationSource | null
  location_captured_at: string | null
  timezone: string
  language: string
  currency: string
  default_appointment_duration: number
  slot_interval_minutes: number
  default_buffer_minutes: number
  max_daily_appointments: number | null
  lunch_break_enabled: boolean
  lunch_start: string | null
  lunch_end: string | null
  primary_color: string | null
  accent_color: string | null
}

export interface WorkingHour {
  id: string
  business_id: string
  weekday: Weekday
  is_open: boolean
  morning_start: string | null
  morning_end: string | null
  afternoon_start: string | null
  afternoon_end: string | null
}

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number | null
  color: string | null
  emoji: string | null
  icon: string | null
  is_active: boolean
  sort_order: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  max_daily_bookings: number | null
  vat_percentage: number | null
  allow_ai_scheduling: boolean
  online_bookable: boolean
}

export interface Patient {
  id: string
  business_id: string
  first_name: string
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  notes: string | null
  color: string | null
  tags: string[] | null
  is_active: boolean
  is_vip: boolean
  blacklisted: boolean
  archived: boolean
  preferred_service_id: string | null
  preferred_duration_minutes: number | null
  total_appointments: number
  no_show_count: number
  total_spent: number
}

export interface Appointment {
  id: string
  business_id: string
  patient_id: string
  service_id: string | null
  title: string | null
  appointment_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  price: number | null
  status: AppointmentStatus
  source: BookingSource
  confirmed: boolean
  locked: boolean
  generated_by_ai: boolean
  color: string | null
  location_mode: AppointmentLocationMode
  location_address: string | null
  location_city: string | null
  location_postal_code: string | null
  location_latitude: number | null
  location_longitude: number | null
  location_geocoding_status: string | null
  location_address_hash: string | null
  location_geocoded_at: string | null
  manual_override: boolean
  version: number
}

export interface RouteCache {
  id: string
  business_id: string
  origin_hash: string
  destination_hash: string
  origin_latitude: number
  origin_longitude: number
  destination_latitude: number
  destination_longitude: number
  profile: RoutingProfile
  duration_seconds: number
  distance_meters: number
  provider: string
  fetched_at: string
  expires_at: string
  created_at: string
}

export interface PatientAvailability {
  id: string
  patient_id: string
  weekday: Weekday
  start_time: string
  end_time: string
  priority: AvailabilityPriority
  is_available: boolean
  valid_from: string | null
  valid_until: string | null
  recurring: boolean
}
